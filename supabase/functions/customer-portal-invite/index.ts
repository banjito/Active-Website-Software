import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'

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

  return email.endsWith('@ampqes.com') || accountType === 'employee' || userType === 'employee' || EMPLOYEE_ROLES.has(role)
}

function randomToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32))
  return Array.from(bytes).map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    const portalUrl = Deno.env.get('CUSTOMER_PORTAL_URL') || 'https://customer.ampos.io'

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

    const inviteToken = randomToken()
    const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 14).toISOString()

    const { data: invite, error: inviteError } = await supabase
      .schema('common')
      .from('customer_invites')
      .insert({
        email,
        customer_id: customerId,
        token: inviteToken,
        expires_at: expiresAt,
        invited_by: caller.id,
      })
      .select('id, token')
      .single()

    if (inviteError) return json({ error: inviteError.message }, 400)

    const cleanPortalUrl = portalUrl.replace(/\/$/, '')
    const redirectTo = `${cleanPortalUrl}/accept-invite?token=${inviteToken}`
    const { error: emailError } = await supabase.auth.admin.inviteUserByEmail(email, {
      data: {
        account_type: 'customer',
        customer_id: customerId,
      },
      redirectTo,
    })

    // New user: invite email sent. The accept-invite flow finalizes the link.
    if (!emailError) {
      return json({ success: true, inviteId: invite.id, expiresAt })
    }

    // inviteUserByEmail fails when the email is already registered. Rather than
    // erroring, grant portal access to the existing account directly.
    const alreadyRegistered = /already|registered|exists/i.test(emailError.message || '')
    if (!alreadyRegistered) {
      await supabase.schema('common').from('customer_invites').delete().eq('id', invite.id)
      return json({ error: emailError.message }, 400)
    }

    const cleanup = async () => {
      await supabase.schema('common').from('customer_invites').delete().eq('id', invite.id)
    }

    // generateLink returns the existing user record, which gives us their id.
    const { data: linkData, error: linkErr } = await supabase.auth.admin.generateLink({
      type: 'magiclink',
      email,
      options: { redirectTo: `${cleanPortalUrl}/jobs` },
    })
    if (linkErr || !linkData?.user) {
      await cleanup()
      return json({ error: linkErr?.message || 'Could not resolve existing user' }, 400)
    }
    const existingUserId = linkData.user.id

    // Don't reassign a user that already belongs to a different customer.
    const { data: existingLink } = await supabase
      .schema('common')
      .from('customer_users')
      .select('customer_id')
      .eq('auth_user_id', existingUserId)
      .maybeSingle()

    if (existingLink && existingLink.customer_id !== customerId) {
      await cleanup()
      return json({ error: 'This user is already linked to a different customer account.' }, 409)
    }

    if (!existingLink) {
      const { error: linkInsertErr } = await supabase
        .schema('common')
        .from('customer_users')
        .insert({ auth_user_id: existingUserId, customer_id: customerId, invited_by: caller.id })
      if (linkInsertErr) {
        await cleanup()
        return json({ error: linkInsertErr.message }, 400)
      }
    }

    const { error: metaErr } = await supabase.auth.admin.updateUserById(existingUserId, {
      app_metadata: {
        ...(linkData.user.app_metadata || {}),
        account_type: 'customer',
        customer_id: customerId,
      },
    })
    if (metaErr) return json({ error: metaErr.message }, 400)

    // Access is already granted, so mark the invite accepted.
    await supabase
      .schema('common')
      .from('customer_invites')
      .update({ accepted_at: new Date().toISOString(), accepted_by: existingUserId })
      .eq('id', invite.id)

    return json({ success: true, existingUser: true, inviteId: invite.id })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return json({ error: message }, 500)
  }
})
