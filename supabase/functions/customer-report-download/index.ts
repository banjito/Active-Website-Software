import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'

// Mints a short-lived signed URL for a published report PDF, or for a delivered
// Report Packet's cover letter PDF (body.deliverable_id), or its merged full
// packet PDF (body.deliverable_id + body.kind = 'packet').
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
    const deliverableId = String(body?.deliverable_id || '').trim()
    if (!assetId && !deliverableId) {
      return json({ error: 'asset_id or deliverable_id is required' }, 400)
    }

    // Client A: acts AS THE USER so RLS / SECURITY DEFINER functions see auth.uid().
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    })

    // Pass the token explicitly — there's no stored session in an edge function,
    // so getUser() with no argument can't resolve the user.
    const { data: { user }, error: userError } = await userClient.auth.getUser(authToken)
    if (userError || !user) return json({ error: 'Invalid or expired token' }, 401)

    let path: string | null = null
    // For the ACCESS view log (common.access_report_views).
    let viewKind: 'report' | 'cover' | 'packet' = 'report'
    let viewJobId: string | null = null

    if (deliverableId) {
      // Packet cover letter: customer_deliverables() is SECURITY DEFINER and
      // scoped to this customer's delivered packets. Not in the result = no access.
      const { data: rows, error: rpcError } = await userClient
        .schema('common')
        .rpc('customer_deliverables')
      if (rpcError) return json({ error: rpcError.message }, 400)

      const match = (rows as Array<{
        id: string
        job_id?: string | null
        cover_pdf_path: string | null
        packet_pdf_path?: string | null
      }> | null)?.find((r) => r.id === deliverableId)
      if (!match) return json({ error: 'Not authorized for this packet' }, 403)

      // kind 'packet' = the single merged PDF; default = the cover letter.
      const wantsPacket = String(body?.kind || '') === 'packet'
      viewKind = wantsPacket ? 'packet' : 'cover'
      viewJobId = match.job_id ?? null
      path = wantsPacket ? (match.packet_pdf_path ?? null) : match.cover_pdf_path
      if (!path) {
        return json(
          {
            error: wantsPacket
              ? 'The full packet PDF is not ready yet.'
              : 'This cover letter has not been published as a downloadable PDF yet.',
          },
          409,
        )
      }
    } else {
      // Authorize + resolve the file path in one step: customer_report_assets() is
      // SECURITY DEFINER and already scoped to this customer's approved/sent assets.
      // If the asset isn't in that result set, the caller isn't allowed to see it.
      const { data: rows, error: rpcError } = await userClient
        .schema('common')
        .rpc('customer_report_assets')
      if (rpcError) return json({ error: rpcError.message }, 400)

      const match = (rows as Array<{
        asset_id: string
        job_id?: string | null
        published_pdf_path: string | null
      }> | null)?.find((r) => r.asset_id === assetId)
      if (!match) return json({ error: 'Not authorized for this report' }, 403)

      viewJobId = match.job_id ?? null
      path = match.published_pdf_path
      if (!path) {
        return json(
          { error: 'This report has not been published as a downloadable PDF yet.' },
          409,
        )
      }
    }

    // Client B: service role, used only to sign the URL for the private bucket.
    const adminClient = createClient(supabaseUrl, serviceKey)

    const { data: signed, error: signError } = await adminClient.storage
      .from(BUCKET)
      .createSignedUrl(path, SIGNED_URL_TTL_SECONDS)
    if (signError || !signed?.signedUrl) {
      return json({ error: signError?.message ?? 'Could not create download link' }, 500)
    }

    // Log the open so staff see "Viewed in ACCESS" on Deliverables. Customer
    // accounts only (staff previews don't count). Never blocks the download.
    try {
      const { data: cu } = await adminClient
        .schema('common')
        .from('customer_users')
        .select('customer_id')
        .eq('auth_user_id', user.id)
        .maybeSingle()
      if (cu) {
        const meta = (user.user_metadata ?? {}) as Record<string, unknown>
        const name = String(meta.full_name || meta.name || '').trim() || null
        const { error: logErr } = await adminClient
          .schema('common')
          .from('access_report_views')
          .insert({
            auth_user_id: user.id,
            customer_id: cu.customer_id,
            viewer_email: user.email ?? null,
            viewer_name: name,
            job_id: viewJobId,
            asset_id: deliverableId ? null : assetId,
            deliverable_id: deliverableId || null,
            kind: viewKind,
          })
        if (logErr) console.warn('ACCESS view log failed:', logErr.message)
      }
    } catch (e) {
      console.warn('ACCESS view log failed:', e instanceof Error ? e.message : e)
    }

    return json({ url: signed.signedUrl })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return json({ error: message }, 500)
  }
})
