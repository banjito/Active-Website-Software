import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'
import {
  appKeys,
  canManageQuickBooks,
  canUseQuickBooks,
  encryptToken,
  getCompanyConnection,
  isTestConnection,
  listConnections,
  liveEnvironment,
  QB_TOKEN_URL,
  type Connection,
} from '../_shared/quickbooksConnection.ts'

// Shared QuickBooks connections, one per company (see _shared/quickbooksConnection.ts).
// GET: status of every company (any employee).
// POST/DELETE: connect, disconnect, or pick the main company (admins only).

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  // Browsers block DELETE (disconnect) unless the preflight lists it
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
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
    const redirectUri = Deno.env.get('QB_REDIRECT_URI')
    // Test sign-ins come back to the site they started on (localhost or ampos.io).
    // Intuit only accepts addresses listed on the app, so a made-up origin is refused there.
    const testCallback = (origin: unknown) => `${String(origin ?? '')}/auth/quickbooks/callback`

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

    // GET: status of every connected company. `integration` is the main one.
    if (req.method === 'GET') {
      if (!canUseQuickBooks(user)) return json({ connected: false, can_manage: false, companies: [] })

      const describe = async (row: Connection) => {
        const { data: owner } = await supabase.auth.admin.getUserById(row.user_id)
        const meta = owner?.user?.user_metadata ?? {}
        return {
          id: row.id,
          realm_id: row.realm_id,
          company_name: row.company_name,
          environment: row.environment,
          expires_at: row.token_expires_at,
          created_at: row.created_at,
          is_primary: !!row.is_primary,
          connected_by: meta.name || meta.full_name || owner?.user?.email || null,
        }
      }
      const companies = await Promise.all((await listConnections(supabase)).map(describe))
      const main = companies.find((c) => c.is_primary)
      return json({ connected: !!main, can_manage: canManage, integration: main, companies })
    }

    if (!canManage) return json({ error: ADMINS_ONLY }, 403)

    let body: any = {}
    try {
      body = await req.json()
    } catch {
      // No body or invalid JSON
    }

    // DELETE: disconnect one company for everyone (the main one when no realm_id is given)
    if (req.method === 'DELETE') {
      const target = await getCompanyConnection(supabase, body.realm_id)
      if (!target) return json({ error: 'That QuickBooks company is not connected.' }, 404)

      const { error: deleteError } = target.realm_id
        ? await table().delete().eq('realm_id', target.realm_id)
        : await table().delete().eq('id', target.id)
      if (deleteError) {
        return json({ error: 'Failed to disconnect QuickBooks', details: deleteError.message }, 500)
      }
      return json({ success: true, message: 'QuickBooks disconnected successfully' })
    }

    if (req.method === 'POST') {
      // get_oauth_url: build the sign-in link (keeps the client ID server-side)
      if (body.action === 'get_oauth_url') {
        // sandbox: connect an Intuit test company with the test keys
        const test = !!body.sandbox
        if (test && liveEnvironment() !== 'production') {
          return json({ error: 'Test companies only work while the real QuickBooks is set to production.' }, 400)
        }
        if (test && !body.origin) return json({ error: 'Missing origin' }, 400)
        const { clientId, environment } = appKeys(test)
        const params = new URLSearchParams({
          client_id: clientId,
          scope: 'com.intuit.quickbooks.accounting',
          redirect_uri: test ? testCallback(body.origin) : redirectUri || `${body.origin}/auth/quickbooks/callback`,
          response_type: 'code',
          access_type: 'offline',
          state: test ? 'quickbooks-oauth-sandbox' : 'quickbooks-oauth',
        })
        return json({ authUrl: `https://appcenter.intuit.com/connect/oauth2?${params.toString()}`, environment })
      }

      // set_primary: pick the main company (job linking, billing, change orders, A/R)
      if (body.action === 'set_primary') {
        const target = body.realm_id ? await getCompanyConnection(supabase, body.realm_id) : null
        if (!target) return json({ error: 'That QuickBooks company is not connected.' }, 404)
        if (isTestConnection(target)) return json({ error: "A test company can't be the main one." }, 400)

        const { error: clearError } = await table().update({ is_primary: false }).eq('is_primary', true)
        const { error: setError } = clearError
          ? { error: clearError }
          : await table().update({ is_primary: true }).eq('id', target.id)
        if (setError) return json({ error: 'Could not change the main company', details: setError.message }, 500)
        return json({ success: true })
      }

      // Otherwise: exchange the sign-in code for tokens
      const { code, realmId } = body
      if (!code) return json({ error: 'Missing authorization code' }, 400)

      const test = !!body.sandbox
      if (test && liveEnvironment() !== 'production') {
        return json({ error: 'Test companies only work while the real QuickBooks is set to production.' }, 400)
      }
      const { clientId, clientSecret, environment } = appKeys(test)

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
          redirect_uri: test ? testCallback(body.origin) : redirectUri || '',
        }),
      })

      if (!tokenResponse.ok) {
        const errorText = await tokenResponse.text()
        console.error('Token exchange failed:', errorText)
        return json({ error: 'Failed to exchange authorization code', details: errorText }, 400)
      }

      const tokenData: TokenResponse = await tokenResponse.json()
      const realm = realmId || tokenData.realmId
      if (!realm) return json({ error: 'QuickBooks did not say which company was connected. Try again.' }, 400)

      if (!encryptionKey) {
        throw new Error('QB_ENCRYPTION_KEY not configured. Set it as a Supabase secret: supabase secrets set QB_ENCRYPTION_KEY=your_32_char_key')
      }

      // Reconnecting a company keeps its "main" status. The very first company becomes main.
      // Any other new company is not main until an admin says so, so AMP work never
      // lands in another company's books by accident.
      const existing = await listConnections(supabase)
      const others = existing.filter((r) => r.realm_id !== realm)
      // A test company is never main.
      const isPrimary = !test && (existing.some((r) => r.realm_id === realm && r.is_primary) || others.length === 0)

      // QuickBooks just cancelled any older login for this company
      await table().delete().eq('realm_id', realm)

      const { data: integration, error: dbError } = await table()
        .insert({
          user_id: user.id,
          access_token: await encryptToken(tokenData.access_token, encryptionKey),
          refresh_token: await encryptToken(tokenData.refresh_token, encryptionKey),
          token_expires_at: new Date(Date.now() + (tokenData.expires_in * 1000)).toISOString(),
          realm_id: realm,
          environment,
          is_active: true,
          is_primary: isPrimary,
        })
        .select()
        .single()

      if (dbError) {
        console.error('Database error:', dbError)
        return json({ error: 'Failed to store tokens', details: dbError.message }, 500)
      }

      // Store the company name now, so the company list can show it
      try {
        const base = environment === 'production' ? 'https://quickbooks.api.intuit.com' : 'https://sandbox-quickbooks.api.intuit.com'
        const info = await fetch(`${base}/v3/company/${realm}/companyinfo/${realm}`, {
          headers: { 'Authorization': `Bearer ${tokenData.access_token}`, 'Accept': 'application/json' },
        }).then((r) => (r.ok ? r.json() : null))
        const companyName = info?.CompanyInfo?.CompanyName
        if (companyName) await table().update({ company_name: companyName }).eq('id', integration.id)
      } catch (err) {
        console.error('Could not read the QuickBooks company name:', err)
      }

      return json({
        success: true,
        message: 'QuickBooks connected successfully',
        integration: {
          id: integration.id,
          realm_id: integration.realm_id,
          environment: integration.environment,
          is_primary: isPrimary,
        },
      })
    }

    return json({ error: 'Method not allowed' }, 405)
  } catch (error) {
    console.error('Error in quickbooks-oauth function:', error)
    return json({ error: error.message || 'Internal server error' }, 500)
  }
})
