import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'

// Mints a short-lived signed URL for a published report PDF.
// Security: access is re-checked server-side by running the SAME RLS predicate
// the portal trusts — common.customer_can_select_technical_report(report_id) —
// evaluated AS THE CALLING USER (their JWT is forwarded). The storage bucket
// stays private; only this function can hand out signed URLs.

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const BUCKET = 'customer-reports'
const SIGNED_URL_TTL_SECONDS = 300

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
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    if (!supabaseUrl || !anonKey || !serviceKey) throw new Error('Missing Supabase credentials')

    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return json({ error: 'Missing authorization header' }, 401)

    const authToken = authHeader.replace('Bearer ', '')

    const body = await req.json().catch(() => ({}))
    const assetId = String(body?.asset_id || '').trim()
    if (!assetId) return json({ error: 'asset_id is required' }, 400)

    // Client A: acts AS THE USER so RLS / SECURITY DEFINER functions see auth.uid().
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    })

    // Pass the token explicitly — there's no stored session in an edge function,
    // so getUser() with no argument can't resolve the user.
    const { data: { user }, error: userError } = await userClient.auth.getUser(authToken)
    if (userError || !user) return json({ error: 'Invalid or expired token' }, 401)

    // Authorize + resolve the file path in one step: customer_report_assets() is
    // SECURITY DEFINER and already scoped to this customer's approved/sent assets.
    // If the asset isn't in that result set, the caller isn't allowed to see it.
    const { data: rows, error: rpcError } = await userClient
      .schema('common')
      .rpc('customer_report_assets')
    if (rpcError) return json({ error: rpcError.message }, 400)

    const match = (rows as Array<{ asset_id: string; published_pdf_path: string | null }> | null)
      ?.find((r) => r.asset_id === assetId)
    if (!match) return json({ error: 'Not authorized for this report' }, 403)

    const path = match.published_pdf_path
    if (!path) {
      return json(
        { error: 'This report has not been published as a downloadable PDF yet.' },
        409,
      )
    }

    // Client B: service role, used only to sign the URL for the private bucket.
    const adminClient = createClient(supabaseUrl, serviceKey)

    const { data: signed, error: signError } = await adminClient.storage
      .from(BUCKET)
      .createSignedUrl(path, SIGNED_URL_TTL_SECONDS)
    if (signError || !signed?.signedUrl) {
      return json({ error: signError?.message ?? 'Could not create download link' }, 500)
    }

    return json({ url: signed.signedUrl })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return json({ error: message }, 500)
  }
})
