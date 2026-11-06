import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'
import { BRAND_COLOR, COMPANY_FULL_NAME, COMPANY_SUPPRESSED_EMAILS, DEFAULT_FROM_EMAIL } from '../_shared/companyConfig.ts'
import { sendEmail } from '../_shared/email.ts'

/**
 * Weekly temp hours email (Project Management scope, item 7).
 *
 * Body: { weekStart: "2026-11-01", agencyId }
 * Sends the agency one email with every temp's total hours by job for that week
 * (all PMs' jobs combined), to the recipients set on the agency in ampOS, with a
 * copy to the sender. Logs the send in neta_ops.temp_hour_weeks.
 *
 * Only people who can manage temp hours may send (common.temp_hours_can_manage).
 * Tables: database/migrations/temp_hours.sql.
 */

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

const FROM_HEADER = DEFAULT_FROM_EMAIL.includes('<') ? DEFAULT_FROM_EMAIL : `${COMPANY_FULL_NAME} <${DEFAULT_FROM_EMAIL}>`

const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

const fmtHours = (n: number) => (Math.round(n * 100) / 100).toLocaleString('en-US', { maximumFractionDigits: 2 })

// 2026-11-01 -> "Nov 1" (built at noon UTC so no time zone shifts the day)
const day = (ymd: string, plus = 0) => {
  const d = new Date(`${ymd}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + plus)
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: plus ? 'numeric' : undefined, timeZone: 'UTC' })
}

const isEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  try {
    const url = Deno.env.get('SUPABASE_URL')
    const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
    if (!url || !key || !anonKey) throw new Error('Missing Supabase server credentials')

    const authHeader = req.headers.get('Authorization') || ''
    // Ask the database, as the caller, whether they may manage temp hours
    const asCaller = createClient(url, anonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false },
    })
    const { data: { user } } = await asCaller.auth.getUser(authHeader.replace('Bearer ', ''))
    if (!user) return json({ error: 'Sign in again, then retry.' }, 401)
    const { data: allowed, error: allowedError } = await asCaller.schema('common').rpc('temp_hours_can_manage')
    if (allowedError) throw allowedError
    if (allowed !== true) return json({ error: 'Only PMs and admins can send temp hours.' }, 403)

    const body = await req.json().catch(() => ({}))
    const weekStart = String(body?.weekStart || '')
    const agencyId = String(body?.agencyId || '')
    if (!/^\d{4}-\d{2}-\d{2}$/.test(weekStart) || new Date(`${weekStart}T12:00:00Z`).getUTCDay() !== 0) {
      return json({ error: 'Pick a week (weeks start on Sunday).' }, 400)
    }

    const db = createClient(url, key, { auth: { persistSession: false } })
    const ops = db.schema('neta_ops')

    const { data: agency, error: agencyError } = await ops
      .from('temp_agencies')
      .select('id, name, recipients')
      .eq('id', agencyId)
      .maybeSingle()
    if (agencyError) throw agencyError
    if (!agency) return json({ error: 'Agency not found.' }, 404)

    const suppressed = new Set(COMPANY_SUPPRESSED_EMAILS.map((e: string) => e.toLowerCase()))
    const to = [...new Set((agency.recipients ?? []).map((e: string) => e.trim().toLowerCase()))]
      .filter((e) => isEmail(e) && !suppressed.has(e))
    if (to.length === 0) return json({ error: `Add who gets ${agency.name}'s email first (gear button).` }, 400)

    const { data: workers, error: workersError } = await ops
      .from('temp_workers')
      .select('id, name')
      .eq('agency_id', agency.id)
    if (workersError) throw workersError
    const workerName = new Map((workers ?? []).map((w: any) => [w.id, w.name as string]))
    if (workerName.size === 0) return json({ error: `No temps from ${agency.name} yet.` }, 400)

    const { data: lines, error: linesError } = await ops
      .from('temp_hour_lines')
      .select('worker_id, job_id, hours, entered_by')
      .eq('week_start', weekStart)
      .in('worker_id', [...workerName.keys()])
      .gt('hours', 0)
    if (linesError) throw linesError
    if (!lines?.length) return json({ error: 'No hours entered for this week.' }, 400)

    const jobIds = [...new Set(lines.map((l: any) => l.job_id))]
    const { data: jobs } = await ops.from('jobs').select('id, job_number, title').in('id', jobIds)
    const jobLabel = new Map(
      (jobs ?? []).map((j: any) => [j.id, `${j.job_number ? `${j.job_number} ` : ''}${j.title ?? ''}`.trim()]),
    )
    const enteredIds = [...new Set(lines.map((l: any) => l.entered_by).filter(Boolean))]
    const { data: people } = enteredIds.length
      ? await db.schema('common').from('profiles').select('id, full_name').in('id', enteredIds)
      : { data: [] }
    const personName = new Map((people ?? []).map((p: any) => [p.id, p.full_name as string]))

    // Group by temp, then job
    const byWorker = new Map<string, { job: string; lead: string; hours: number }[]>()
    for (const l of lines as any[]) {
      const list = byWorker.get(l.worker_id) ?? []
      list.push({
        job: jobLabel.get(l.job_id) || 'Job',
        lead: personName.get(l.entered_by) || '',
        hours: Number(l.hours) || 0,
      })
      byWorker.set(l.worker_id, list)
    }
    const temps = [...byWorker.entries()]
      .map(([id, rows]) => ({ name: workerName.get(id) || 'Temp', rows, total: rows.reduce((t, r) => t + r.hours, 0) }))
      .sort((a, b) => a.name.localeCompare(b.name))
    const grand = temps.reduce((t, w) => t + w.total, 0)

    const range = `${day(weekStart)} to ${day(weekStart, 6)}`
    const td = 'padding:6px 10px;border-bottom:1px solid #e5e5e5;'
    const rowsHtml = temps
      .map((w) =>
        w.rows
          .map(
            (r, i) => `<tr>
  <td style="${td}">${i === 0 ? `<b>${escapeHtml(w.name)}</b>` : ''}</td>
  <td style="${td}">${escapeHtml(r.job)}</td>
  <td style="${td}color:#525252;">${escapeHtml(r.lead)}</td>
  <td style="${td}text-align:right;">${fmtHours(r.hours)}</td>
</tr>`,
          )
          .join('') +
        (w.rows.length > 1
          ? `<tr><td style="${td}"></td><td style="${td}" colspan="2"><i>${escapeHtml(w.name)} total</i></td><td style="${td}text-align:right;"><b>${fmtHours(w.total)}</b></td></tr>`
          : ''),
      )
      .join('')

    const html = `
<div style="font-family: Arial, sans-serif; font-size: 14px; line-height: 1.5; color: #171717; max-width: 680px;">
  <div style="border-top: 4px solid ${BRAND_COLOR}; padding-top: 16px;">
    <p>Hi,</p>
    <p>Here are ${escapeHtml(COMPANY_FULL_NAME)}'s hours for ${escapeHtml(agency.name)} temps, week of <b>${range}</b>.</p>
    <table style="border-collapse:collapse;width:100%;font-size:14px;">
      <tr style="text-align:left;background:#f5f5f5;">
        <th style="${td}">Temp</th><th style="${td}">Job</th><th style="${td}">Entered by</th><th style="${td}text-align:right;">Hours</th>
      </tr>
      ${rowsHtml}
      <tr><td style="${td}" colspan="3"><b>Total</b></td><td style="${td}text-align:right;"><b>${fmtHours(grand)}</b></td></tr>
    </table>
    <p style="color:#525252;">Questions? Reply to this email.</p>
  </div>
</div>`
    const text = [
      `Hours for ${agency.name} temps, week of ${range}:`,
      '',
      ...temps.flatMap((w) => [
        ...w.rows.map((r) => `${w.name} | ${r.job} | ${fmtHours(r.hours)} h`),
        ...(w.rows.length > 1 ? [`${w.name} total: ${fmtHours(w.total)} h`] : []),
      ]),
      '',
      `Total: ${fmtHours(grand)} h`,
    ].join('\n')

    const res = await sendEmail({
      from: FROM_HEADER,
      to,
      cc: user.email && !suppressed.has(user.email.toLowerCase()) ? [user.email] : undefined,
      replyTo: user.email || undefined,
      subject: `Temp hours, week of ${range}`,
      html,
      text,
    })
    if (!res.ok) return json({ error: `The email failed to send (provider status ${res.status}).` }, 502)

    const { error: logError } = await ops.from('temp_hour_weeks').upsert(
      { week_start: weekStart, agency_id: agency.id, sent_at: new Date().toISOString(), sent_by: user.id, sent_to: to, total_hours: grand },
      { onConflict: 'week_start,agency_id' },
    )
    if (logError) console.error('temp-hours-email: log failed', logError)

    return json({ sent: true, sentTo: to, totalHours: grand })
  } catch (error: unknown) {
    console.error('temp-hours-email failed:', error)
    return json({ error: error instanceof Error ? error.message : String(error) }, 500)
  }
})
