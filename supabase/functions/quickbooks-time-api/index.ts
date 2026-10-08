import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'

// Connection to QuickBooks Time (the time-clock side of QuickBooks, formerly TSheets).
// Payroll reads hours from QuickBooks Time, not from the TimeActivity records the
// QuickBooks Online API writes, so time meant for payroll has to go through here.
//
// Two ways to call it:
//   { endpoint, method, data }  passes one allowed call through to QuickBooks Time
//   { action: 'sync' }          copies the job list and matches people into the TimeStAMP tables

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const QB_TIME_BASE_URL = 'https://rest.tsheets.com/api/v1'

// The access token can read and write everyone's time, so only these roles may use it
const ALLOWED_ROLES = ['Admin', 'Super Admin']

// The only calls the app may pass through. Anything else is refused.
const ALLOWED_CALLS: Record<string, string[]> = {
  GET: ['/current_user', '/users', '/jobcodes', '/timesheets', '/customfields'],
  POST: ['/timesheets'],
  DELETE: ['/timesheets'],
}

// Pay data must never leave QuickBooks. User records carry it, and QuickBooks Time
// tucks copies of user records into other responses, so strip it from everything.
const PAY_FIELDS = ['pay_rate', 'pay_interval']

function stripPayData(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripPayData)
  if (value && typeof value === 'object') {
    const cleaned: Record<string, unknown> = {}
    for (const [key, inner] of Object.entries(value)) {
      if (!PAY_FIELDS.includes(key)) cleaned[key] = stripPayData(inner)
    }
    return cleaned
  }
  return value
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    status,
  })
}

function chunk<T>(list: T[], size: number): T[][] {
  const parts: T[][] = []
  for (let i = 0; i < list.length; i += size) parts.push(list.slice(i, i + size))
  return parts
}

// Read every page of a QuickBooks Time list. `more` says whether another page exists.
async function qbTimeGetAll(accessToken: string, path: string, key: string): Promise<any[]> {
  const rows: any[] = []
  for (let page = 1; page <= 100; page++) {
    const joiner = path.includes('?') ? '&' : '?'
    const res = await fetch(`${QB_TIME_BASE_URL}${path}${joiner}page=${page}`, {
      headers: { 'Authorization': `Bearer ${accessToken}`, 'Accept': 'application/json' },
    })
    if (!res.ok) {
      throw new Error(`QuickBooks Time ${path} failed (${res.status}): ${await res.text()}`)
    }
    const body = await res.json()
    rows.push(...Object.values(body?.results?.[key] ?? {}))
    if (!body?.more) break
  }
  return rows
}

// "26103- TA Realty" -> "26103". Same convention ampOS uses to match QuickBooks projects.
function leadingNumber(name: string): string | null {
  const match = (name ?? '').match(/^\s*0*(\d{1,12})/)
  return match ? match[1] : null
}

// Copy the QuickBooks Time job list into common.time_jobs and link each job to its ampOS job
async function syncJobs(supabase: any, accessToken: string) {
  const startedAt = new Date().toISOString()
  const regular = await qbTimeGetAll(accessToken, '/jobcodes?active=yes', 'jobcodes')

  // Time-off codes are their own type and are left out of the default list
  let timeOff: any[] = []
  let timeOffError: string | null = null
  try {
    timeOff = await qbTimeGetAll(accessToken, '/jobcodes?active=yes&type=pto', 'jobcodes')
  } catch (error) {
    timeOffError = error?.message ?? 'unknown error'
  }

  const nameById = new Map([...regular, ...timeOff].map((j) => [j.id, j.name]))

  const numbers = [...new Set(regular.map((j) => leadingNumber(j.name)).filter(Boolean))] as string[]
  const jobIdByNumber = new Map<string, string | null>()
  for (const part of chunk(numbers, 200)) {
    const { data, error } = await supabase
      .schema('neta_ops')
      .from('jobs')
      .select('id, job_number_numeric')
      .in('job_number_numeric', part)
    if (error) throw error
    for (const job of data ?? []) {
      const key = String(job.job_number_numeric)
      // Two ampOS jobs sharing one number is ambiguous, so link neither
      jobIdByNumber.set(key, jobIdByNumber.has(key) ? null : job.id)
    }
  }

  const toRow = (j: any) => {
    const number = leadingNumber(j.name)
    return {
      qb_time_jobcode_id: j.id,
      parent_jobcode_id: j.parent_id || null,
      name: j.name,
      customer_name: j.parent_id ? nameById.get(j.parent_id) ?? null : null,
      job_number: number,
      job_id: number ? jobIdByNumber.get(number) ?? null : null,
      active: true,
      synced_at: startedAt,
    }
  }

  // `kind` is left out for normal jobs so a hand-set Shop, Travel or Training tag survives
  const regularRows = regular.map(toRow)
  const timeOffRows = timeOff.map((j) => ({
    ...toRow(j),
    job_number: null,
    job_id: null,
    kind: /holiday/i.test(j.name ?? '') ? 'holiday' : 'pto',
  }))

  for (const rows of [regularRows, timeOffRows]) {
    for (const part of chunk(rows, 500)) {
      const { error } = await supabase
        .schema('common')
        .from('time_jobs')
        .upsert(part, { onConflict: 'qb_time_jobcode_id' })
      if (error) throw error
    }
  }

  // Anything this run did not touch is no longer active in QuickBooks Time
  let stale = supabase
    .schema('common')
    .from('time_jobs')
    .update({ active: false })
    .eq('active', true)
    .lt('synced_at', startedAt)
  if (timeOffError) stale = stale.not('kind', 'in', '(pto,holiday)')
  const { data: deactivated, error: staleError } = await stale.select('qb_time_jobcode_id')
  if (staleError) throw staleError

  return {
    copied: regularRows.length + timeOffRows.length,
    timeOffCodes: timeOffRows.length,
    linkedToAmposJobs: regularRows.filter((r) => r.job_id).length,
    markedInactive: deactivated?.length ?? 0,
    timeOffError,
  }
}

const NAME_SUFFIXES = new Set(['jr', 'sr', 'ii', 'iii', 'iv'])

// "Lyons Jr., John" and "John Lyons" both become comparable lowercase name parts
function nameParts(name: string): string[] {
  return (name ?? '')
    .toLowerCase()
    .replace(/[^a-z\s-]/g, ' ')
    .split(/[\s-]+/)
    .filter((part) => part && !NAME_SUFFIXES.has(part))
}

// Match QuickBooks Time users to ampOS logins and record the match in common.time_people.
// Email matches are saved. Name matches are only suggested, for a person to confirm.
async function syncPeople(supabase: any, accessToken: string) {
  const users = await qbTimeGetAll(accessToken, '/users?active=yes', 'users')

  // QuickBooks Time can hold two records for one person with the same email. Most
  // recently used first, so the record they really clock in on gets the match.
  const emailOf = (user: any) => (user?.email ?? '').trim().toLowerCase()
  const activeAt = (user: any) => Date.parse(user?.last_active ?? '') || 0
  users.sort((a, b) => activeAt(b) - activeAt(a))
  const bestByEmail = new Map<string, any>()
  for (const user of users) {
    const email = emailOf(user)
    if (email && !bestByEmail.has(email)) bestByEmail.set(email, user)
  }

  const { data: profiles, error: profilesError } = await supabase
    .schema('common')
    .from('profiles')
    .select('id, email, full_name')
    .limit(5000)
  if (profilesError) throw profilesError

  const profileByEmail = new Map<string, string>()
  for (const profile of profiles ?? []) {
    const email = (profile.email ?? '').trim().toLowerCase()
    if (email) profileByEmail.set(email, profile.id)
  }

  const { data: existing, error: existingError } = await supabase
    .schema('common')
    .from('time_people')
    .select('profile_id, qb_time_user_id')
  if (existingError) throw existingError

  // An earlier run may have matched by email to the less-used duplicate. Move those
  // to the record the person really uses. Matches made by hand are left alone.
  const usersById = new Map(users.map((user) => [String(user.id), user]))
  const usedUserIds = new Set((existing ?? []).map((p: any) => String(p.qb_time_user_id)))
  let movedToActiveRecord = 0
  for (const person of existing ?? []) {
    const current = usersById.get(String(person.qb_time_user_id))
    const email = emailOf(current)
    const best = email ? bestByEmail.get(email) : null
    if (!current || !best || best.id === current.id) continue
    if (profileByEmail.get(email) !== person.profile_id || usedUserIds.has(String(best.id))) continue
    const { error } = await supabase
      .schema('common')
      .from('time_people')
      .update({ qb_time_user_id: best.id })
      .eq('profile_id', person.profile_id)
    if (error) throw error
    usedUserIds.add(String(best.id))
    person.qb_time_user_id = best.id
    movedToActiveRecord++
  }

  const matchedUserIds = new Set(
    (existing ?? []).filter((p: any) => p.qb_time_user_id).map((p: any) => String(p.qb_time_user_id))
  )
  const existingByProfile = new Map((existing ?? []).map((p: any) => [p.profile_id, p]))
  const claimedProfiles = new Set<string>(
    (existing ?? []).filter((p: any) => p.qb_time_user_id).map((p: any) => p.profile_id)
  )

  // Which QuickBooks Time record holds each matched login, to explain shared emails
  const holderByProfile = new Map<string, any>()
  for (const person of existing ?? []) {
    const holder = usersById.get(String(person.qb_time_user_id))
    if (holder) holderByProfile.set(person.profile_id, holder)
  }

  const toInsert: any[] = []
  const toLink: any[] = []
  const unmatched: any[] = []
  let alreadyMatched = 0

  for (const user of users) {
    if (matchedUserIds.has(String(user.id))) {
      alreadyMatched++
      continue
    }
    const email = (user.email ?? '').trim().toLowerCase()
    const profileId = email ? profileByEmail.get(email) : undefined

    let reason = ''
    if (!email) reason = 'No email in QuickBooks Time'
    else if (!profileId) reason = 'No ampOS login with that email'
    else if (claimedProfiles.has(profileId)) {
      const holder = holderByProfile.get(profileId)
      reason = holder
        ? `Same email as "${holder.last_name ?? ''}, ${holder.first_name ?? ''}" in QuickBooks Time, which already has this ampOS login`
        : 'Another QuickBooks Time record with the same email already has this ampOS login'
    }

    if (reason || !profileId) {
      unmatched.push({
        qb_time_user_id: user.id,
        name: `${user.last_name ?? ''}, ${user.first_name ?? ''}`,
        reason,
        salaried: !!user.salaried,
        first: nameParts(user.first_name)[0] ?? '',
        last: nameParts(user.last_name).pop() ?? '',
      })
      continue
    }

    claimedProfiles.add(profileId)
    holderByProfile.set(profileId, user)
    if (existingByProfile.has(profileId)) {
      toLink.push({ profile_id: profileId, qb_time_user_id: user.id })
    } else {
      // Hourly staff clock in. Salaried people only approve.
      toInsert.push({ profile_id: profileId, qb_time_user_id: user.id, clocks_in: !user.salaried })
    }
  }

  if (toInsert.length > 0) {
    const { error } = await supabase.schema('common').from('time_people').insert(toInsert)
    if (error) throw error
  }
  for (const link of toLink) {
    const { error } = await supabase
      .schema('common')
      .from('time_people')
      .update({ qb_time_user_id: link.qb_time_user_id })
      .eq('profile_id', link.profile_id)
    if (error) throw error
  }

  // Suggest an ampOS login for everyone email could not place. Full name first; a last
  // name alone only counts when one free login and one unmatched person share it.
  const free = (profiles ?? [])
    .filter((p: any) => !claimedProfiles.has(p.id))
    .map((p: any) => ({ id: p.id, name: p.full_name || p.email || 'No name', parts: nameParts(p.full_name ?? '') }))
  const unmatchedPerLast = new Map<string, number>()
  for (const person of unmatched) {
    unmatchedPerLast.set(person.last, (unmatchedPerLast.get(person.last) ?? 0) + 1)
  }

  const needMatching = unmatched.map((person) => {
    const sameLast = person.last
      ? free.filter((p: any) => p.parts[p.parts.length - 1] === person.last)
      : []
    const sameBoth = sameLast.filter((p: any) => person.first && p.parts[0] === person.first)
    let suggestedProfileId: string | null = null
    let suggestedBy: string | null = null
    if (sameBoth.length === 1) {
      suggestedProfileId = sameBoth[0].id
      suggestedBy = 'name'
    } else if (sameBoth.length === 0 && sameLast.length === 1 && unmatchedPerLast.get(person.last) === 1) {
      suggestedProfileId = sameLast[0].id
      suggestedBy = 'last name'
    }
    return {
      qb_time_user_id: person.qb_time_user_id,
      name: person.name,
      reason: person.reason,
      salaried: person.salaried,
      suggestedProfileId,
      suggestedBy,
    }
  })

  return {
    inQuickBooksTime: users.length,
    amposLogins: (profiles ?? []).length,
    alreadyMatched,
    newlyMatched: toInsert.length + toLink.length,
    movedToActiveRecord,
    unmatched: needMatching,
    // Logins nobody is matched to yet, for the pick list
    amposPeople: free
      .map((p: any) => ({ id: p.id, name: p.name }))
      .sort((x: any, y: any) => x.name.localeCompare(y.name)),
  }
}

// Same list the database uses for "payroll admin"
const PAYROLL_ROLES = ['Admin', 'Super Admin', 'HR', 'HR Rep', 'HR Representative']

async function qbTimeWrite(accessToken: string, endpoint: string, method: string, data?: unknown): Promise<any> {
  const response = await fetch(`${QB_TIME_BASE_URL}${endpoint}`, {
    method,
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Accept': 'application/json',
      'Content-Type': 'application/json',
    },
    body: data ? JSON.stringify(data) : undefined,
  })
  const text = await response.text()
  if (!response.ok) {
    throw new Error(`QuickBooks Time refused (${response.status}): ${text.slice(0, 300)}`)
  }
  return JSON.parse(text)
}

// Send an approved week's hours to QuickBooks Time: one manual entry per day per job.
// Safe to call again. Anything already sent is skipped, so a retry only sends what's missing.
async function sendWeek(
  supabase: any,
  accessToken: string,
  profileId: string,
  weekStart: string,
  callerId: string,
  callerRole: string
) {
  const db = supabase.schema('common')
  const end = new Date(`${weekStart}T00:00:00Z`)
  end.setUTCDate(end.getUTCDate() + 6)
  const lastDay = end.toISOString().slice(0, 10)

  const { data: week, error: weekError } = await db
    .from('time_weeks')
    .select('status, decided_by')
    .eq('profile_id', profileId)
    .eq('week_start', weekStart)
    .maybeSingle()
  if (weekError) throw weekError
  if (!week || week.status !== 'approved') throw new Error('That week is not approved')
  if (!PAYROLL_ROLES.includes(callerRole) && week.decided_by !== callerId) {
    throw new Error('Only the approver or payroll can send this week')
  }

  const { data: person, error: personError } = await db
    .from('time_people')
    .select('qb_time_user_id')
    .eq('profile_id', profileId)
    .maybeSingle()
  if (personError) throw personError
  if (!person?.qb_time_user_id) throw new Error('This person is not matched to QuickBooks Time')

  const { data: entries, error: entriesError } = await db
    .from('time_entries')
    .select('work_date, qb_time_jobcode_id, hours')
    .eq('profile_id', profileId)
    .gte('work_date', weekStart)
    .lte('work_date', lastDay)
  if (entriesError) throw entriesError

  const totals = new Map<string, { work_date: string; jobcode: number; hours: number }>()
  for (const entry of entries ?? []) {
    const hours = Number(entry.hours ?? 0)
    if (hours <= 0) continue
    const key = `${entry.work_date}|${entry.qb_time_jobcode_id}`
    const total = totals.get(key) ?? { work_date: entry.work_date, jobcode: entry.qb_time_jobcode_id, hours: 0 }
    total.hours += hours
    totals.set(key, total)
  }

  const { data: sentRows, error: sentError } = await db
    .from('time_qb_sends')
    .select('work_date, qb_time_jobcode_id')
    .eq('profile_id', profileId)
    .eq('week_start', weekStart)
    .is('removed_at', null)
  if (sentError) throw sentError

  const already = new Set((sentRows ?? []).map((s: any) => `${s.work_date}|${s.qb_time_jobcode_id}`))
  const toSend = [...totals.entries()].filter(([key]) => !already.has(key)).map(([, total]) => total)

  const failed: string[] = []
  let sent = 0

  for (const part of chunk(toSend, 50)) {
    const response = await qbTimeWrite(accessToken, '/timesheets', 'POST', {
      data: part.map((t) => ({
        user_id: person.qb_time_user_id,
        jobcode_id: t.jobcode,
        type: 'manual',
        date: t.work_date,
        duration: Math.round(t.hours * 3600),
        notes: 'From TimeStAMP',
      })),
    })

    // QuickBooks Time answers each row on its own, numbered from 1 in the order sent
    const results = response?.results?.timesheets ?? {}
    const made: any[] = []
    part.forEach((t, i) => {
      const result = results[String(i + 1)]
      if (result?._status_code === 200 && result.id) {
        made.push({
          profile_id: profileId,
          week_start: weekStart,
          work_date: t.work_date,
          qb_time_jobcode_id: t.jobcode,
          hours: t.hours,
          qb_time_timesheet_id: result.id,
        })
      } else {
        failed.push(`${t.work_date}: ${result?._status_message ?? 'No answer'} ${result?._status_extra ?? ''}`.trim())
      }
    })

    if (made.length > 0) {
      const { error: saveError } = await db.from('time_qb_sends').insert(made)
      if (saveError) {
        // With no record of them, a retry would send these hours a second time. Take them back out.
        await qbTimeWrite(
          accessToken,
          `/timesheets?ids=${made.map((m) => m.qb_time_timesheet_id).join(',')}`,
          'DELETE'
        ).catch((e) => console.error('Could not undo QuickBooks Time entries:', e))
        throw saveError
      }
      sent += made.length
    }
  }

  const { error: markError } = await db
    .from('time_weeks')
    .update(
      failed.length > 0
        ? { qb_error: failed.join(' | ').slice(0, 1000) }
        : { qb_sent_at: new Date().toISOString(), qb_error: null }
    )
    .eq('profile_id', profileId)
    .eq('week_start', weekStart)
  if (markError) throw markError

  return { sent, alreadySent: already.size, failed }
}

// Take a week's entries back out of QuickBooks Time, so the week can be reopened and fixed.
async function unsendWeek(
  supabase: any,
  accessToken: string,
  profileId: string,
  weekStart: string,
  callerRole: string
) {
  if (!PAYROLL_ROLES.includes(callerRole)) {
    throw new Error('Only payroll can pull a week back from QuickBooks Time')
  }
  const db = supabase.schema('common')

  const { data: sends, error } = await db
    .from('time_qb_sends')
    .select('id, qb_time_timesheet_id')
    .eq('profile_id', profileId)
    .eq('week_start', weekStart)
    .is('removed_at', null)
  if (error) throw error

  const failed: string[] = []
  let removed = 0

  for (const part of chunk(sends ?? [], 50)) {
    const response = await qbTimeWrite(
      accessToken,
      `/timesheets?ids=${part.map((s: any) => s.qb_time_timesheet_id).join(',')}`,
      'DELETE'
    )
    const results = response?.results?.timesheets ?? {}
    const gone: number[] = []
    for (const send of part as any[]) {
      const result = results[String(send.qb_time_timesheet_id)]
      // 404 means someone already deleted it in QuickBooks Time, which is the same outcome
      if (result?._status_code === 200 || result?._status_code === 404) {
        gone.push(send.id)
      } else {
        failed.push(`${result?._status_message ?? 'No answer'} ${result?._status_extra ?? ''}`.trim())
      }
    }
    if (gone.length > 0) {
      const { error: markError } = await db
        .from('time_qb_sends')
        .update({ removed_at: new Date().toISOString() })
        .in('id', gone)
      if (markError) throw markError
      removed += gone.length
    }
  }

  if (failed.length > 0) {
    throw new Error(`QuickBooks Time kept ${failed.length} of the entries: ${failed.join(' | ')}`)
  }

  const { error: weekError } = await db
    .from('time_weeks')
    .update({ qb_sent_at: null, qb_error: null })
    .eq('profile_id', profileId)
    .eq('week_start', weekStart)
  if (weekError) throw weekError

  return { removed }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const accessToken = Deno.env.get('QB_TIME_ACCESS_TOKEN')
    if (!accessToken) {
      throw new Error('QB_TIME_ACCESS_TOKEN not configured')
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    if (!supabaseUrl) throw new Error('SUPABASE_URL is not set')

    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    if (!supabaseServiceKey) throw new Error('SUPABASE_SERVICE_ROLE_KEY is not set')

    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Get user from Authorization header
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return jsonResponse({ error: 'Missing authorization header' }, 401)
    }

    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: userError } = await supabase.auth.getUser(token)

    if (userError || !user) {
      return jsonResponse({ error: 'Invalid or expired token' }, 401)
    }

    const role = user.user_metadata?.role ?? ''

    let body: {
      action?: string
      endpoint?: string
      method?: string
      data?: unknown
      profile_id?: string
      week_start?: string
    }
    try {
      body = await req.json()
    } catch (_) {
      return jsonResponse(
        { error: 'Invalid or missing request body', details: 'Body must be valid JSON with an "endpoint" field' },
        400
      )
    }

    // Sending a week has its own rule (the approver who signed it, or payroll), checked inside
    if (body.action === 'send_week' || body.action === 'unsend_week') {
      if (!body.profile_id || !body.week_start) {
        return jsonResponse({ error: 'Missing profile_id or week_start' }, 400)
      }
      try {
        const result = body.action === 'send_week'
          ? await sendWeek(supabase, accessToken, body.profile_id, body.week_start, user.id, role)
          : await unsendWeek(supabase, accessToken, body.profile_id, body.week_start, role)
        console.log(`QuickBooks Time ${body.action}:`, result)
        return jsonResponse(result)
      } catch (error) {
        console.error(`QuickBooks Time ${body.action} failed:`, error)
        // 200 on purpose, so the page can show the reason instead of a generic failure
        return jsonResponse({ error: error?.message ?? 'Unknown error' })
      }
    }

    if (!ALLOWED_ROLES.includes(role)) {
      return jsonResponse(
        { error: 'Not allowed', details: 'Only admins can use the QuickBooks Time connection' },
        403
      )
    }

    if (body.action === 'sync') {
      console.log('QuickBooks Time sync started')
      const jobs = await syncJobs(supabase, accessToken)
      const people = await syncPeople(supabase, accessToken)
      return jsonResponse({ jobs, people })
    }

    const { endpoint, method = 'GET', data } = body

    if (!endpoint || typeof endpoint !== 'string' || !endpoint.startsWith('/')) {
      return jsonResponse(
        { error: 'Missing endpoint parameter', details: 'Request body must include "endpoint" (e.g. "/users?active=yes").' },
        400
      )
    }

    const verb = String(method).toUpperCase()
    const path = endpoint.split('?')[0]
    if (!(ALLOWED_CALLS[verb] ?? []).includes(path)) {
      return jsonResponse({ error: 'Call not allowed', details: `${verb} ${path}` }, 400)
    }

    console.log(`QuickBooks Time API call: ${verb} ${path}`)

    const apiResponse = await fetch(`${QB_TIME_BASE_URL}${endpoint}`, {
      method: verb,
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      },
      body: data ? JSON.stringify(data) : undefined,
    })

    const responseText = await apiResponse.text()

    if (!apiResponse.ok) {
      console.error('QuickBooks Time API error:', {
        status: apiResponse.status,
        path,
        response: responseText,
      })
      return jsonResponse(
        { error: 'QuickBooks Time API error', status: apiResponse.status, details: responseText },
        apiResponse.status
      )
    }

    let responseData: unknown
    try {
      responseData = JSON.parse(responseText)
    } catch (_) {
      responseData = { raw: responseText }
    }

    return jsonResponse(stripPayData(responseData))
  } catch (error) {
    console.error('QuickBooks Time API function error:', error)
    return jsonResponse({ error: error?.message ?? 'Unknown error' }, 500)
  }
})
