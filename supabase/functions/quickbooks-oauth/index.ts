import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'
import { encode as base64Encode, decode as base64Decode } from 'https://deno.land/std@0.168.0/encoding/base64.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface TokenResponse {
  access_token: string
  refresh_token: string
  expires_in: number
  token_type: string
  realmId?: string
}

// AES-256-GCM encryption for OAuth tokens (Intuit security requirement)
async function getEncryptionKey(keyString: string): Promise<CryptoKey> {
  const encoder = new TextEncoder()
  const keyData = encoder.encode(keyString.padEnd(32, '0').slice(0, 32)) // Ensure 256-bit key
  return await crypto.subtle.importKey(
    'raw',
    keyData,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  )
}

async function encryptToken(token: string, encryptionKey: string): Promise<string> {
  const key = await getEncryptionKey(encryptionKey)
  const iv = crypto.getRandomValues(new Uint8Array(12)) // 96-bit IV for GCM
  const encoder = new TextEncoder()
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    encoder.encode(token)
  )
  // Combine IV + ciphertext and encode as base64
  const combined = new Uint8Array(iv.length + new Uint8Array(encrypted).length)
  combined.set(iv)
  combined.set(new Uint8Array(encrypted), iv.length)
  return base64Encode(combined)
}

async function decryptToken(encryptedToken: string, encryptionKey: string): Promise<string> {
  const key = await getEncryptionKey(encryptionKey)
  const combined = base64Decode(encryptedToken)
  const iv = combined.slice(0, 12)
  const ciphertext = combined.slice(12)
  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    key,
    ciphertext
  )
  const decoder = new TextDecoder()
  return decoder.decode(decrypted)
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Get environment variables
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

    // AES encryption key for OAuth tokens (Intuit security requirement)
    // Note: Only required for POST (token exchange) and PUT (token refresh) operations
    const encryptionKey = Deno.env.get('QB_ENCRYPTION_KEY')

    // Get Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    if (!supabaseUrl) throw new Error('SUPABASE_URL is not set')

    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    if (!supabaseServiceKey) throw new Error('SUPABASE_SERVICE_ROLE_KEY is not set')

    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Get user from Authorization header
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 401 }
      )
    }

    // Extract token from "Bearer <token>"
    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: userError } = await supabase.auth.getUser(token)
    
    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: 'Invalid or expired token' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 401 }
      )
    }

    const { method } = req
    const url = new URL(req.url)

    // Handle token refresh (PUT /quickbooks-oauth)
    if (method === 'PUT') {
      // Get current integration
      const { data: integration, error: integrationError } = await supabase
        .schema('common')
        .from('quickbooks_integrations')
        .select('*')
        .eq('user_id', user.id)
        .eq('is_active', true)
        .single()

      if (integrationError || !integration) {
        return new Response(
          JSON.stringify({ error: 'No active QuickBooks integration found' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 404 }
        )
      }

      // Require encryption key for token operations
      if (!encryptionKey) {
        throw new Error('QB_ENCRYPTION_KEY not configured. Set it as a Supabase secret: supabase secrets set QB_ENCRYPTION_KEY=your_32_char_key')
      }

      // Decrypt stored refresh token
      const decryptedRefreshToken = await decryptToken(integration.refresh_token, encryptionKey)

      // OAuth token URL is the same for both sandbox and production
      const tokenUrl = 'https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer'

      // Refresh the token
      const refreshResponse = await fetch(tokenUrl, {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/x-www-form-urlencoded',
          'Authorization': `Basic ${btoa(`${clientId}:${clientSecret}`)}`,
        },
        body: new URLSearchParams({
          grant_type: 'refresh_token',
          refresh_token: decryptedRefreshToken,
        }),
      })

      if (!refreshResponse.ok) {
        const errorText = await refreshResponse.text()
        console.error('Token refresh failed:', errorText)
        return new Response(
          JSON.stringify({ error: 'Failed to refresh token', details: errorText }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
        )
      }

      const refreshData: TokenResponse = await refreshResponse.json()

      // Calculate new expiration
      const expiresAt = new Date(Date.now() + (refreshData.expires_in * 1000))

      // Encrypt new tokens before storage
      const encryptedAccessToken = await encryptToken(refreshData.access_token, encryptionKey)
      const encryptedRefreshToken = await encryptToken(
        refreshData.refresh_token || decryptedRefreshToken, 
        encryptionKey
      )

      // Update encrypted tokens in database
      const { data: updatedIntegration, error: updateError } = await supabase
        .schema('common')
        .from('quickbooks_integrations')
        .update({
          access_token: encryptedAccessToken,
          refresh_token: encryptedRefreshToken,
          token_expires_at: expiresAt.toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', integration.id)
        .select()
        .single()

      if (updateError) {
        console.error('Update error:', updateError)
        return new Response(
          JSON.stringify({ error: 'Failed to update tokens', details: updateError.message }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
        )
      }

      // Return decrypted access token for immediate use (sent over HTTPS)
      return new Response(
        JSON.stringify({
          success: true,
          message: 'Token refreshed successfully',
          access_token: refreshData.access_token,
          expires_at: expiresAt.toISOString(),
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      )
    }

    // Handle GET - check integration status
    if (method === 'GET') {
      const { data: integration, error: integrationError } = await supabase
        .schema('common')
        .from('quickbooks_integrations')
        .select('id, realm_id, company_name, environment, token_expires_at, created_at')
        .eq('user_id', user.id)
        .eq('is_active', true)
        .single()

      if (integrationError || !integration) {
        return new Response(
          JSON.stringify({ connected: false }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
        )
      }

      return new Response(
        JSON.stringify({
          connected: true,
          integration: {
            id: integration.id,
            realm_id: integration.realm_id,
            company_name: integration.company_name,
            environment: integration.environment,
            expires_at: integration.token_expires_at,
            created_at: integration.created_at,
          },
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      )
    }

    // Handle DELETE - disconnect QuickBooks
    if (method === 'DELETE') {
      const { error: deleteError } = await supabase
        .schema('common')
        .from('quickbooks_integrations')
        .update({ is_active: false })
        .eq('user_id', user.id)
        .eq('is_active', true)

      if (deleteError) {
        return new Response(
          JSON.stringify({ error: 'Failed to disconnect QuickBooks', details: deleteError.message }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
        )
      }

      return new Response(
        JSON.stringify({ success: true, message: 'QuickBooks disconnected successfully' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      )
    }

    // Handle POST with action: 'get_oauth_url' - get OAuth URL (keeps client ID server-side)
    if (method === 'POST') {
      let body: any = {}
      try {
        body = await req.json()
      } catch {
        // No body or invalid JSON
      }
      
      // Check for get_oauth_url action
      if (body.action === 'get_oauth_url') {
        const { origin } = body
        
        const scope = 'com.intuit.quickbooks.accounting'
        const callbackRedirectUri = redirectUri || `${origin}/auth/quickbooks/callback`
        
        const authUrl = 'https://appcenter.intuit.com/connect/oauth2'
        const params = new URLSearchParams({
          client_id: clientId,
          scope: scope,
          redirect_uri: callbackRedirectUri,
          response_type: 'code',
          access_type: 'offline',
          state: 'quickbooks-oauth',
        })

        return new Response(
          JSON.stringify({ 
            authUrl: `${authUrl}?${params.toString()}`,
            environment: environment 
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
        )
      }
      
      // Otherwise handle token exchange (existing POST logic)
      const { code, realmId } = body

      if (!code) {
        return new Response(
          JSON.stringify({ error: 'Missing authorization code' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
        )
      }

      // OAuth token URL is the same for both sandbox and production
      // Only API calls use different URLs (sandbox-quickbooks.api.intuit.com vs quickbooks.api.intuit.com)
      const tokenUrl = 'https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer'

      // Exchange authorization code for tokens
      const tokenResponse = await fetch(tokenUrl, {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/x-www-form-urlencoded',
          'Authorization': `Basic ${btoa(`${clientId}:${clientSecret}`)}`,
        },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          code: code,
          redirect_uri: redirectUri || '',
        }),
      })

      if (!tokenResponse.ok) {
        const errorText = await tokenResponse.text()
        console.error('Token exchange failed:', errorText)
        return new Response(
          JSON.stringify({ error: 'Failed to exchange authorization code', details: errorText }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
        )
      }

      const tokenData: TokenResponse = await tokenResponse.json()

      // Calculate token expiration
      const expiresAt = new Date(Date.now() + (tokenData.expires_in * 1000))

      // Require encryption key for token storage
      if (!encryptionKey) {
        throw new Error('QB_ENCRYPTION_KEY not configured. Set it as a Supabase secret: supabase secrets set QB_ENCRYPTION_KEY=your_32_char_key')
      }

      // Encrypt tokens before storage (Intuit security requirement - AES-256-GCM)
      const encryptedAccessToken = await encryptToken(tokenData.access_token, encryptionKey)
      const encryptedRefreshToken = await encryptToken(tokenData.refresh_token, encryptionKey)

      // Deactivate any existing integrations for this user
      await supabase
        .schema('common')
        .from('quickbooks_integrations')
        .update({ is_active: false })
        .eq('user_id', user.id)
        .eq('is_active', true)

      // Store encrypted tokens in database
      const { data: integration, error: dbError } = await supabase
        .schema('common')
        .from('quickbooks_integrations')
        .insert({
          user_id: user.id,
          access_token: encryptedAccessToken,
          refresh_token: encryptedRefreshToken,
          token_expires_at: expiresAt.toISOString(),
          realm_id: realmId || tokenData.realmId || null,
          environment: environment,
          is_active: true,
        })
        .select()
        .single()

      if (dbError) {
        console.error('Database error:', dbError)
        return new Response(
          JSON.stringify({ error: 'Failed to store tokens', details: dbError.message }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
        )
      }

      return new Response(
        JSON.stringify({
          success: true,
          message: 'QuickBooks connected successfully',
          integration: {
            id: integration.id,
            realm_id: integration.realm_id,
            environment: integration.environment,
          },
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      )
    }

    return new Response(
      JSON.stringify({ error: 'Method not allowed' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 405 }
    )
  } catch (error) {
    console.error('Error in quickbooks-oauth function:', error)
    return new Response(
      JSON.stringify({ error: error.message || 'Internal server error' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    )
  }
})

