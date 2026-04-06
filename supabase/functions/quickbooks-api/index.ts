import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'
import { encode as base64Encode, decode as base64Decode } from 'https://deno.land/std@0.168.0/encoding/base64.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// AES-256-GCM encryption for OAuth tokens (Intuit security requirement)
async function getEncryptionKey(keyString: string): Promise<CryptoKey> {
  const encoder = new TextEncoder()
  const keyData = encoder.encode(keyString.padEnd(32, '0').slice(0, 32))
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
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const encoder = new TextEncoder()
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    encoder.encode(token)
  )
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
    // Get encryption key for token decryption
    const encryptionKey = Deno.env.get('QB_ENCRYPTION_KEY')
    if (!encryptionKey) {
      throw new Error('QB_ENCRYPTION_KEY not configured')
    }

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

    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: userError } = await supabase.auth.getUser(token)
    
    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: 'Invalid or expired token' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 401 }
      )
    }

    // Get the user's QuickBooks integration
    const { data: integration, error: integrationError } = await supabase
      .schema('common')
      .from('quickbooks_integrations')
      .select('*')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .single()

    if (integrationError || !integration) {
      return new Response(
        JSON.stringify({ error: 'QuickBooks not connected' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 404 }
      )
    }

    // Check if token needs refresh
    const expiresAt = new Date(integration.token_expires_at)
    const now = new Date()
    const buffer = 5 * 60 * 1000 // 5 minutes
    
    // Decrypt access token for use
    let accessToken = await decryptToken(integration.access_token, encryptionKey)
    
    if (expiresAt.getTime() - now.getTime() < buffer) {
      // Refresh the token
      const clientId = Deno.env.get('QB_CLIENT_ID')
      const clientSecret = Deno.env.get('QB_CLIENT_SECRET')
      
      if (!clientId || !clientSecret) {
        throw new Error('QuickBooks credentials not configured')
      }

      // Decrypt refresh token for use
      const decryptedRefreshToken = await decryptToken(integration.refresh_token, encryptionKey)

      const tokenUrl = 'https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer'
      
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
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 401 }
        )
      }

      const refreshData = await refreshResponse.json()
      accessToken = refreshData.access_token
      
      // Encrypt new tokens before storing
      const encryptedAccessToken = await encryptToken(refreshData.access_token, encryptionKey)
      const encryptedRefreshToken = await encryptToken(
        refreshData.refresh_token || decryptedRefreshToken, 
        encryptionKey
      )
      
      // Update encrypted tokens in database
      const newExpiresAt = new Date(Date.now() + (refreshData.expires_in * 1000))
      await supabase
        .schema('common')
        .from('quickbooks_integrations')
        .update({
          access_token: encryptedAccessToken,
          refresh_token: encryptedRefreshToken,
          token_expires_at: newExpiresAt.toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', integration.id)
    }

    // Parse the request body for the API endpoint (safe parse - empty body or non-POST can fail)
    let body: { endpoint?: string; method?: string; data?: unknown }
    try {
      const raw = await req.json()
      body = raw && typeof raw === 'object' ? raw : {}
    } catch {
      return new Response(
        JSON.stringify({ error: 'Invalid or missing request body', details: 'Body must be valid JSON with an "endpoint" field' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      )
    }
    const { endpoint, method = 'GET', data } = body

    if (!endpoint || typeof endpoint !== 'string' || !endpoint.trim()) {
      return new Response(
        JSON.stringify({
          error: 'Missing endpoint parameter',
          details: 'Request body must include "endpoint" (e.g. "/v3/company/{realmId}/companyinfo/{realmId}").',
          receivedKeys: body ? Object.keys(body) : [],
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      )
    }

    // Determine base URL
    const baseUrl = integration.environment === 'production'
      ? 'https://quickbooks.api.intuit.com'
      : 'https://sandbox-quickbooks.api.intuit.com'

    // Replace {realmId} placeholder
    const realmId = integration.realm_id
    let apiEndpoint = endpoint.replace(/{realmId}/g, realmId)
    
    // Handle query strings - split path and query. Client already sends query= encoded; do NOT encode again.
    let finalUrl: string
    if (apiEndpoint.includes('?query=')) {
      const [path, queryPart] = apiEndpoint.split('?query=')
      // queryPart is already encoded by the client; double-encoding caused 400 from QuickBooks
      finalUrl = `${baseUrl}${path.startsWith('/') ? path : `/${path}`}?query=${queryPart}&minorversion=65`
    } else {
      finalUrl = `${baseUrl}${apiEndpoint.startsWith('/') ? apiEndpoint : `/${apiEndpoint}`}`
    }

    console.log(`QuickBooks API call: ${method} ${finalUrl}`)

    // Make the API call
    const apiResponse = await fetch(finalUrl, {
      method,
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      },
      body: data ? JSON.stringify(data) : undefined,
    })

    const responseText = await apiResponse.text()
    
    if (!apiResponse.ok) {
      console.error('QuickBooks API error:', {
        status: apiResponse.status,
        url: finalUrl,
        response: responseText
      })
      return new Response(
        JSON.stringify({ 
          error: 'QuickBooks API error', 
          status: apiResponse.status, 
          details: responseText,
          url: finalUrl 
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: apiResponse.status }
      )
    }

    // Parse response if it's JSON
    let responseData
    try {
      responseData = JSON.parse(responseText)
    } catch {
      responseData = { raw: responseText }
    }

    // If this is a company info request, update the company name in our database
    if (endpoint.includes('companyinfo') && responseData?.CompanyInfo) {
      const companyName = responseData.CompanyInfo.CompanyName
      if (companyName) {
        await supabase
          .schema('common')
          .from('quickbooks_integrations')
          .update({ company_name: companyName })
          .eq('id', integration.id)
      }
    }

    return new Response(
      JSON.stringify(responseData),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    )
  } catch (error) {
    console.error('Error in quickbooks-api function:', error)
    return new Response(
      JSON.stringify({ error: error.message || 'Internal server error' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    )
  }
})
