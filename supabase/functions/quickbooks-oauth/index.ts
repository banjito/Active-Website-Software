import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'
import {
  canManageQuickBooks,
  canUseQuickBooks,
  encryptToken,
  getCompanyConnection,
  QB_TOKEN_URL,
} from '../_shared/quickbooksConnection.ts'

// One shared QuickBooks connection for the whole company (see _shared/quickbooksConnection.ts).
// GET: its status (any employee). POST/DELETE: connect or disconnect it (admins only).

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status })

const ADMINS_ONLY = 'Only admins can connect or disconnect QuickBooks. It is shared by the whole company.'

interface TokenResponse {
  access_token: string
  refresh_token: string
  expires_in: number
  token_type: string
  realmId?: string
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // QB_CLIENT_ID must be set as a Supabase secret or environment variable
    const clientId = Deno.env.get('QB_CLIENT_ID')
    const clientSecret = Deno.env.get('QB_CLIENT_SECRET')
    const environment = Deno.env.get('QB_ENVIRONMENT') || 'sandbox'
    const redirectUri = Deno.env.get('QB_REDIRECT_URI')

    if (!clientId) {
      throw new Error('QuickBooks credentials not configured. Missing QB_CLIENT_ID. Set it as a Supabase secret: supabase secrets set QB_CLIENT_ID=your_client_id')
    }
    if (!clientSecret) {
      throw new Error('QuickBooks credentials not configured. Missing QB_CLIENT_SECRET. Set it as a Supabase secret: supabase secrets set QB_CLIENT_SECRET=your_client_secret')
    }

    // AES encryption key for OAuth tokens (Intuit security requirement). Only needed to store tokens.
    const encryptionKey = Deno.env.get('QB_ENCRYPTION_KEY')

    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    if (!supabaseUrl) throw new Error('SUPABASE_URL is not set')

    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    if (!supabaseServiceKey) throw new Error('SUPABASE_SERVICE_ROLE_KEY is not set')

    const supabase = createClient(supabaseUrl, supabaseServiceKey)
    const table = () => supabase.schema('common').from('quickbooks_integrations')

    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return json({ error: 'Missing authorization header' }, 401)

    const { data: { user }, error: userError } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''))
    if (userError || !user) return json({ error: 'Invalid or expired token' }, 401)

    const canManage = canManageQuickBooks(user)

    // GET: status of the company connection
    if (req.method === 'GET') {
      if (!canUseQuickBooks(user)) return json({ connected: false, can_manage: false })

      const integration = await getCompanyConnection(supabase)
      if (!integration) return json({ connected: false, can_manage: canManage })

      const { data: owner } = await supabase.auth.admin.getUserById(integration.user_id)
      const meta = owner?.user?.user_metadata ?? {}

      return json({
        connected: true,
        can_manage: canManage,
        integration: {
          id: integration.id,
          realm_id: integration.realm_id,
          company_name: integration.company_name,
          environment: integration.environment,
          expires_at: integration.token_expires_at,
          created_at: integration.created_at,
          connected_by: meta.name || meta.full_name || owner?.user?.email || null,
        },
      })
    }

    if (!canManage) return json({ error: ADMINS_ONLY }, 403)

    // DELETE: disconnect for everyone
    if (req.method === 'DELETE') {
      const { error: deleteError } = await table().delete().not('id', 'is', null)
      if (deleteError) {
        return json({ error: 'Failed to disconnect QuickBooks', details: deleteError.message }, 500)
      }
      return json({ success: true, message: 'QuickBooks disconnected successfully' })
    }

    if (req.method === 'POST') {
      let body: any = {}
      try {
        body = await req.json()
      } catch {
        // No body or invalid JSON
      }

      // get_oauth_url: build the sign-in link (keeps the client ID server-side)
      if (body.action === 'get_oauth_url') {
        const params = new URLSearchParams({
          client_id: clientId,
          scope: 'com.intuit.quickbooks.accounting',
          redirect_uri: redirectUri || `${body.origin}/auth/quickbooks/callback`,
          response_type: 'code',
          access_type: 'offline',
          state: 'quickbooks-oauth',
        })
        return json({ authUrl: `https://appcenter.intuit.com/connect/oauth2?${params.toString()}`, environment })
      }

      // Otherwise: exchange the sign-in code for tokens
      const { code, realmId } = body
      if (!code) return json({ error: 'Missing authorization code' }, 400)

      const tokenResponse = await fetch(QB_TOKEN_URL, {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/x-www-form-urlencoded',
          'Authorization': `Basic ${btoa(`${clientId}:${clientSecret}`)}`,
        },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          code,
          redirect_uri: redirectUri || '',
        }),
      })

      if (!tokenResponse.ok) {
        const errorText = await tokenResponse.text()
        console.error('Token exchange failed:', errorText)
        return json({ error: 'Failed to exchange authorization code', details: errorText }, 400)
      }

      const tokenData: TokenResponse = await tokenResponse.json()

      if (!encryptionKey) {
        throw new Error('QB_ENCRYPTION_KEY not configured. Set it as a Supabase secret: supabase secrets set QB_ENCRYPTION_KEY=your_32_char_key')
      }

      // This user's old rows go first (one active row per user is enforced by the table)
      await table().delete().eq('user_id', user.id)

      const { data: integration, error: dbError } = await table()
        .insert({
          user_id: user.id,
          access_token: await encryptToken(tokenData.access_token, encryptionKey),
          refresh_token: await encryptToken(tokenData.refresh_token, encryptionKey),
          token_expires_at: new Date(Date.now() + (tokenData.expires_in * 1000)).toISOString(),
          realm_id: realmId || tokenData.realmId || null,
          environment,
          is_active: true,
        })
        .select()
        .single()

      if (dbError) {
        console.error('Database error:', dbError)
        return json({ error: 'Failed to store tokens', details: dbError.message }, 500)
      }

      // QuickBooks just cancelled every older login, so remove them
      await table().delete().neq('id', integration.id)

      return json({
        success: true,
        message: 'QuickBooks connected successfully',
        integration: {
          id: integration.id,
          realm_id: integration.realm_id,
          environment: integration.environment,
        },
      })
    }

    return json({ error: 'Method not allowed' }, 405)
  } catch (error) {
    console.error('Error in quickbooks-oauth function:', error)
    return json({ error: error.message || 'Internal server error' }, 500)
  }
})
