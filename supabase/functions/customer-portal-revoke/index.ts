import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'
import { isEmployeeEmailDomain } from '../_shared/companyConfig.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const EMPLOYEE_ROLES = new Set([
  'admin',
  'manager',
  'supervisor',
  'neta technician',
  'technician',
  'sales',
  'estimator',
  'engineering',
  'office admin',
  'hr_manager',
  'hr_personnel',
])

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    status,
  })
}

function isEmployee(user: any) {
  const email = String(user?.email || '').toLowerCase()
  const app = user?.app_metadata || {}
  const meta = user?.user_metadata || {}
  const role = String(app.role || meta.role || '').toLowerCase()
  const accountType = String(app.account_type || meta.account_type || '').toLowerCase()
  const userType = String(app.user_type || meta.user_type || '').toLowerCase()

  return isEmployeeEmailDomain(email) || accountType === 'employee' || userType === 'employee' || EMPLOYEE_ROLES.has(role)
}

// Resolve an auth user by email without side effects. The admin API has no
// getUserByEmail, so page through listUsers until a match is found.
async function findUserByEmail(supabase: any, email: string) {
  const perPage = 1000
  for (let page = 1; ; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage })
    if (error) throw error
    const match = (data?.users || []).find(
      (u: any) => String(u.email || '').toLowerCase() === email,
    )
    if (match) return match
    if (!data?.users || data.users.length < perPage) return null
  }
}

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

    const token = authHeader.replace('Bearer ', '')
    const { data: { user: caller }, error: callerError } = await supabase.auth.getUser(token)

    if (callerError || !caller) return json({ error: 'Invalid or expired token' }, 401)
    if (!isEmployee(caller)) return json({ error: 'Employee access required' }, 403)

    const body = await req.json().catch(() => ({}))
    const email = String(body?.email || '').trim().toLowerCase()
    const customerId = String(body?.customerId || '').trim()

    if (!email || !email.includes('@')) return json({ error: 'Valid email is required' }, 400)
    if (!customerId) return json({ error: 'customerId is required' }, 400)

    const now = new Date().toISOString()

    // 1. Revoke any pending/accepted invites for this email + customer.
    const { error: inviteError } = await supabase
      .schema('common')
      .from('customer_invites')
      .update({ revoked_at: now })
      .eq('customer_id', customerId)
      .eq('email', email)
      .is('revoked_at', null)
    if (inviteError) return json({ error: inviteError.message }, 400)

    // 2. Resolve the auth user (if any) and remove their access to this customer.
    const authUser = await findUserByEmail(supabase, email)
    let accessRemoved = false

    if (authUser) {
      const { data: link } = await supabase
        .schema('common')
        .from('customer_users')
        .select('id, customer_id')
        .eq('auth_user_id', authUser.id)
        .maybeSingle()

      if (link && link.customer_id === customerId) {
        const { error: delError } = await supabase
          .schema('common')
          .from('customer_users')
          .delete()
          .eq('id', link.id)
        if (delError) return json({ error: delError.message }, 400)
        accessRemoved = true

        // Clear the portal-account metadata so they can no longer sign in as
        // this customer. Only touch users that were portal (customer) accounts.
        const appMeta = authUser.app_metadata || {}
        if (String(appMeta.account_type || '').toLowerCase() === 'customer') {
          const { error: metaErr } = await supabase.auth.admin.updateUserById(authUser.id, {
            app_metadata: { ...appMeta, account_type: null, customer_id: null },
          })
          if (metaErr) return json({ error: metaErr.message }, 400)
        }
      }
    }

    return json({ success: true, accessRemoved })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return json({ error: message }, 500)
  }
})
