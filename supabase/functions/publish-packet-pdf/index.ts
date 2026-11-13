import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'
import { isEmployeeEmailDomain, isEmployeeRole } from '../_shared/companyConfig.ts'
import { rebuildPacketPdf } from '../_shared/packetPdf.ts'

// Builds a delivered Report Packet's single "full packet" PDF for ampOS ACCESS.
//
// The staff app calls this last, after publish-deliverable-pdf (cover letter)
// and publish-report-pdf (each report) have put their PDFs in storage. This
// only merges those files (see _shared/packetPdf.ts), so it's fast.
//
// customer-report-download signs the result (kind: 'packet').

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Same positive staff check as publish-deliverable-pdf.
// deno-lint-ignore no-explicit-any
function isEmployee(user: any): boolean {
  const email = String(user?.email || '').toLowerCase()
  const app = user?.app_metadata || {}
  const meta = user?.user_metadata || {}
  const role = String(app.role || meta.role || '').toLowerCase()
  const accountType = String(app.account_type || meta.account_type || '').toLowerCase()
  const userType = String(app.user_type || meta.user_type || '').toLowerCase()
  return (
    isEmployeeEmailDomain(email) ||
    accountType === 'employee' ||
    userType === 'employee' ||
    isEmployeeRole(role)
  )
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
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    if (!supabaseUrl || !anonKey || !serviceKey) throw new Error('Missing Supabase credentials')

    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return json({ error: 'Missing authorization header' }, 401)
    const authToken = authHeader.replace('Bearer ', '')

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    })
    const { data: { user }, error: userError } = await userClient.auth.getUser(authToken)
    if (userError || !user) return json({ error: 'Invalid or expired token' }, 401)
    if (!isEmployee(user)) return json({ error: 'Employee access required' }, 403)

    const body = await req.json().catch(() => ({}))
    const deliverableId = String(body?.deliverableId || body?.deliverable_id || '').trim()
    if (!deliverableId) return json({ error: 'deliverableId is required' }, 400)

    const admin = createClient(supabaseUrl, serviceKey)
    const path = await rebuildPacketPdf(admin, deliverableId)
    return json({ ok: true, path })
  } catch (e) {
    console.error('publish-packet-pdf error:', e instanceof Error ? e.message : e)
    return json({ error: e instanceof Error ? e.message : 'Failed to build full packet PDF' }, 500)
  }
})
