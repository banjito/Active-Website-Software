// Invite an outside subcontractor to a job (Roles scope item 8).
//
// POST { email, name, company, job_id }
// Caller needs "Invite subcontractors" (jobs.invite_subcontractors: Admin and PM).
//
// Makes the account if it's new, puts the person on the Subcontractor role, records
// them in common.external_users and gives them this job in common.external_job_access.
// Then emails a one-click sign-in link that opens the job. They never need a password:
// later they use "Email me a sign-in link" on the login page.
//
// Refuses company emails, people who already have another role, and customer portal
// logins. Access lasts until someone removes it (no end date, Jack Nov 23).

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'
import { isEmployeeEmailDomain } from '../_shared/companyConfig.ts'
import { userCan } from '../_shared/permissions.ts'
import { appBaseUrl, COMPANY_NAME, emailSignInLink, signInLink } from '../_shared/subcontractorLink.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    status,
  })
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    if (!supabaseUrl || !serviceKey) throw new Error('Missing Supabase server credentials')
    const supabase = createClient(supabaseUrl, serviceKey)

    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return json({ error: 'Missing authorization header' }, 401)
    const { data: { user: caller }, error: callerError } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''))
    if (callerError || !caller) return json({ error: 'Invalid or expired token' }, 401)
    if (!(await userCan(supabase, caller.id, 'jobs.invite_subcontractors'))) {
      return json({ error: 'You need the "Invite subcontractors" permission.' }, 403)
    }

    const body = await req.json().catch(() => ({}))
    const email = String(body?.email ?? '').trim().toLowerCase()
    const name = String(body?.name ?? '').trim()
    const company = String(body?.company ?? '').trim()
    const jobId = String(body?.job_id ?? '').trim()

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ error: 'Enter a valid email.' }, 400)
    if (!name) return json({ error: 'Enter their name.' }, 400)
    if (!company) return json({ error: 'Enter their company.' }, 400)
    if (!UUID.test(jobId)) return json({ error: 'Missing job.' }, 400)
    if (isEmployeeEmailDomain(email)) {
      return json({ error: 'That is a company email. Give staff a role on People & roles instead.' }, 400)
    }

    const { data: job, error: jobError } = await supabase
      .schema('neta_ops')
      .from('jobs')
      .select('id, job_number, title')
      .eq('id', jobId)
      .is('deleted_at', null)
      .maybeSingle()
    if (jobError) throw jobError
    if (!job) return json({ error: 'That job was not found.' }, 404)

    // Find or make the account
    let userId: string
    let existingUser = false
    const created = await supabase.auth.admin.createUser({
      email,
      email_confirm: true,
      user_metadata: { name, full_name: name },
      app_metadata: { account_type: 'subcontractor' },
    })
    if (created.data?.user) {
      userId = created.data.user.id
    } else if (/already|registered|exists/i.test(created.error?.message ?? '')) {
      existingUser = true
      const { data: found, error: findError } = await supabase.auth.admin.generateLink({ type: 'magiclink', email })
      if (findError || !found?.user) throw new Error(findError?.message || 'Could not find that account')
      const existing = found.user
      userId = existing.id

      if (String(existing.app_metadata?.account_type ?? '') === 'customer') {
        return json({ error: 'That email is a customer portal login. Use a different email.' }, 409)
      }
      const { data: link } = await supabase
        .schema('common').from('customer_users').select('customer_id').eq('auth_user_id', userId).maybeSingle()
      if (link) return json({ error: 'That email is a customer portal login. Use a different email.' }, 409)

      const { data: pick } = await supabase
        .schema('common').from('user_roles').select('role_key').eq('user_id', userId).maybeSingle()
      if (pick && pick.role_key !== 'subcontractor') {
        return json({ error: 'That email already has an ampOS role. Change it on People & roles instead.' }, 409)
      }

      const { error: metaError } = await supabase.auth.admin.updateUserById(userId, {
        ...(existing.user_metadata?.name ? {} : { user_metadata: { ...existing.user_metadata, name, full_name: name } }),
        app_metadata: { ...existing.app_metadata, account_type: 'subcontractor' },
      })
      if (metaError) throw metaError
    } else {
      throw new Error(created.error?.message || 'Could not make the account')
    }

    const now = new Date().toISOString()
    const db = supabase.schema('common')

    const { error: extError } = await db.from('external_users').upsert(
      { user_id: userId, company, invited_by: caller.id, invited_at: now, removed_at: null, removed_by: null },
      { onConflict: 'user_id' },
    )
    if (extError) throw extError

    const { data: before } = await db.from('user_roles').select('role_key').eq('user_id', userId).maybeSingle()
    if (before?.role_key !== 'subcontractor') {
      const { error: roleError } = await db.from('user_roles').upsert(
        { user_id: userId, role_key: 'subcontractor', updated_at: now, updated_by: caller.id },
        { onConflict: 'user_id' },
      )
      if (roleError) throw roleError
      await db.from('access_changes').insert({
        changed_by: caller.id,
        action: 'person_role',
        role_key: 'subcontractor',
        user_id: userId,
        detail: { from: before?.role_key ?? null, to: 'subcontractor', cleared: false, via: 'subcontractor invite' },
      })
    }

    const { error: accessError } = await db.from('external_job_access').upsert(
      { job_id: job.id, user_id: userId, added_by: caller.id, added_at: now },
      { onConflict: 'job_id,user_id', ignoreDuplicates: true },
    )
    if (accessError) throw accessError

    const link = await signInLink(supabase, email, appBaseUrl(req, true), `/jobs/${job.id}`)
    const inviter = String(caller.user_metadata?.name || caller.email || COMPANY_NAME)
    const jobLabel = [job.job_number, job.title].filter(Boolean).join(' · ')
    const emailed = await emailSignInLink({
      to: email,
      name,
      link,
      subject: `${COMPANY_NAME} invited you to job ${job.job_number ?? ''}`.trim(),
      intro: `${inviter} at ${COMPANY_NAME} invited you to job ${jobLabel} in ampOS, to see its test reports and fill in yours.`,
    })
    if (emailed) await db.from('external_users').update({ last_link_sent_at: now }).eq('user_id', userId)

    return json({ success: true, userId, existingUser, emailed })
  } catch (error) {
    console.error('subcontractor-invite failed', error)
    const message = error instanceof Error ? error.message : 'Unknown error'
    return json({ error: message }, 500)
  }
})
