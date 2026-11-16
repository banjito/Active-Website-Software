import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'
import {
  canUseQuickBooks,
  getAccessToken,
  QuickBooksReconnectError,
  type Connection,
} from '../_shared/quickbooksConnection.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status })

function intuitUrl(connection: Connection, endpoint: string): string {
  const baseUrl = connection.environment === 'production'
    ? 'https://quickbooks.api.intuit.com'
    : 'https://sandbox-quickbooks.api.intuit.com'

  const apiEndpoint = endpoint.replace(/{realmId}/g, connection.realm_id)

  // Client already sends query= encoded; do NOT encode again (double-encoding caused 400s)
  if (apiEndpoint.includes('?query=')) {
    const [path, queryPart] = apiEndpoint.split('?query=')
    return `${baseUrl}${path.startsWith('/') ? path : `/${path}`}?query=${queryPart}&minorversion=65`
  }
  return `${baseUrl}${apiEndpoint.startsWith('/') ? apiEndpoint : `/${apiEndpoint}`}`
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const encryptionKey = Deno.env.get('QB_ENCRYPTION_KEY')
    if (!encryptionKey) throw new Error('QB_ENCRYPTION_KEY not configured')

    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    if (!supabaseUrl) throw new Error('SUPABASE_URL is not set')

    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    if (!supabaseServiceKey) throw new Error('SUPABASE_SERVICE_ROLE_KEY is not set')

    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return json({ error: 'Missing authorization header' }, 401)

    const { data: { user }, error: userError } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''))
    if (userError || !user) return json({ error: 'Invalid or expired token' }, 401)

    // One shared company connection, so only employees may use it
    if (!canUseQuickBooks(user)) return json({ error: 'Only employees can use QuickBooks.' }, 403)

    // realm_id picks the company; left out, it's the main company (AMP)
    let body: { endpoint?: string; method?: string; data?: unknown; realm_id?: string }
    try {
      const raw = await req.json()
      body = raw && typeof raw === 'object' ? raw : {}
    } catch {
      return json({ error: 'Invalid or missing request body', details: 'Body must be valid JSON with an "endpoint" field' }, 400)
    }
    const { endpoint, method = 'GET', data, realm_id: realmId } = body

    if (!endpoint || typeof endpoint !== 'string' || !endpoint.trim()) {
      return json({
        error: 'Missing endpoint parameter',
        details: 'Request body must include "endpoint" (e.g. "/v3/company/{realmId}/companyinfo/{realmId}").',
        receivedKeys: body ? Object.keys(body) : [],
      }, 400)
    }

    const callIntuit = (connection: Connection, accessToken: string) => {
      const url = intuitUrl(connection, endpoint)
      console.log(`QuickBooks API call: ${method} ${url}`)
      return fetch(url, {
        method,
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Accept': 'application/json',
          'Content-Type': 'application/json',
        },
        body: data ? JSON.stringify(data) : undefined,
      })
    }

    let { token, connection } = await getAccessToken(supabase, encryptionKey, undefined, realmId)
    let apiResponse = await callIntuit(connection, token)

    // QuickBooks turned the login down. Renew it once and retry (nothing ran on a 401).
    if (apiResponse.status === 401) {
      ;({ token, connection } = await getAccessToken(supabase, encryptionKey, connection.access_token, realmId))
      apiResponse = await callIntuit(connection, token)
    }

    const responseText = await apiResponse.text()

    if (!apiResponse.ok) {
      const url = intuitUrl(connection, endpoint)
      console.error('QuickBooks API error:', { status: apiResponse.status, url, response: responseText })
      return json({ error: 'QuickBooks API error', status: apiResponse.status, details: responseText, url }, apiResponse.status)
    }

    let responseData
    try {
      responseData = JSON.parse(responseText)
    } catch {
      responseData = { raw: responseText }
    }

    // A company info request refreshes the stored company name
    const companyName = endpoint.includes('companyinfo') ? responseData?.CompanyInfo?.CompanyName : null
    if (companyName) {
      await supabase
        .schema('common')
        .from('quickbooks_integrations')
        .update({ company_name: companyName })
        .eq('id', connection.id)
    }

    return json(responseData)
  } catch (error) {
    if (error instanceof QuickBooksReconnectError) {
      return json({ error: error.message, code: 'QB_RECONNECT' }, 409)
    }
    console.error('Error in quickbooks-api function:', error)
    return json({ error: error.message || 'Internal server error' }, 500)
  }
})
