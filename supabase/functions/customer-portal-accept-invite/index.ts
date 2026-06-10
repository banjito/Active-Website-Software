import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'

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

    const authToken = authHeader.replace('Bearer ', '')
    const { data: { user }, error: userError } = await supabase.auth.getUser(authToken)

    if (userError || !user) return json({ error: 'Invalid or expired token' }, 401)

    const body = await req.json().catch(() => ({}))
    const inviteToken = String(body?.token || '').trim()

    if (!inviteToken) return json({ error: 'Invite token is required' }, 400)

    const { data: invite, error: inviteError } = await supabase
      .schema('common')
      .from('customer_invites')
      .select('id, email, customer_id, expires_at, accepted_at, revoked_at, invited_by')
      .eq('token', inviteToken)
      .single()

    if (inviteError || !invite) return json({ error: 'Invite not found' }, 404)
    if (invite.revoked_at) return json({ error: 'Invite was revoked' }, 410)
    if (invite.accepted_at) return json({ error: 'Invite was already accepted' }, 409)
    if (new Date(invite.expires_at).getTime() < Date.now()) return json({ error: 'Invite expired' }, 410)

    const invitedEmail = String(invite.email || '').toLowerCase()
    const userEmail = String(user.email || '').toLowerCase()
    if (invitedEmail !== userEmail) return json({ error: 'Invite email does not match signed-in user' }, 403)

    const { data: existingLink, error: existingError } = await supabase
      .schema('common')
      .from('customer_users')
      .select('customer_id')
      .eq('auth_user_id', user.id)
      .maybeSingle()

    if (existingError) return json({ error: existingError.message }, 400)
    if (existingLink && existingLink.customer_id !== invite.customer_id) {
      return json({ error: 'This user is already linked to a different customer' }, 409)
    }

    if (!existingLink) {
      const { error: linkError } = await supabase
        .schema('common')
        .from('customer_users')
        .insert({
          auth_user_id: user.id,
          customer_id: invite.customer_id,
          invited_by: invite.invited_by,
        })

      if (linkError) return json({ error: linkError.message }, 400)
    }

    const { error: metadataError } = await supabase.auth.admin.updateUserById(user.id, {
      app_metadata: {
        ...(user.app_metadata || {}),
        account_type: 'customer',
        customer_id: invite.customer_id,
      },
    })

    if (metadataError) return json({ error: metadataError.message }, 400)

    const { error: acceptError } = await supabase
      .schema('common')
      .from('customer_invites')
      .update({
        accepted_at: new Date().toISOString(),
        accepted_by: user.id,
      })
      .eq('id', invite.id)

    if (acceptError) return json({ error: acceptError.message }, 400)

    return json({ success: true, customerId: invite.customer_id })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return json({ error: message }, 500)
  }
})
