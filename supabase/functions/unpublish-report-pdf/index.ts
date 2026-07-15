import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'
import { isEmployeeEmailDomain } from '../_shared/companyConfig.ts'

// Removes a report's viewing access from the customer portal (ampOS ACCESS).
//
// This is the inverse of publish-report-pdf. When staff "Unsend" a report
// (revert sent -> approved), the customer must no longer be able to view or
// download it. We do that by deleting the published PDF from the private
// customer-reports bucket and clearing neta_ops.assets.published_pdf_path.
//
// With published_pdf_path null, common.customer_report_assets() reports the
// asset as not-openable and customer-report-download refuses to sign a URL, so
// the customer loses access even though the asset row (now status=approved)
// still exists.
//
// Required secrets (auto-injected in the Supabase runtime):
//   SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const BUCKET = 'customer-reports'

// Staff gate — copied from publish-report-pdf so the two agree. A single auth
// account can be flagged account_type=customer yet still be an employee, so we
// must not reject on "is a customer" alone.
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
    EMPLOYEE_ROLES.has(role)
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

    // Caller must be an authenticated staff user (never a customer).
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return json({ error: 'Missing authorization header' }, 401)
    const authToken = authHeader.replace('Bearer ', '')

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    })
    const { data: { user }, error: userError } = await userClient.auth.getUser(authToken)
    if (userError || !user) return json({ error: 'Invalid or expired token' }, 401)

    // Staff-only (employees may also carry a customer flag — see isEmployee).
    if (!isEmployee(user)) return json({ error: 'Employee access required' }, 403)

    const body = await req.json().catch(() => ({}))
    const assetId = String(body?.assetId || body?.asset_id || '').trim()
    if (!assetId) return json({ error: 'assetId is required' }, 400)

    // Service role: read the asset's published path, delete the object, clear the column.
    const admin = createClient(supabaseUrl, serviceKey)

    const { data: asset, error: assetErr } = await admin
      .schema('neta_ops')
      .from('assets')
      .select('id, published_pdf_path')
      .eq('id', assetId)
      .maybeSingle()
    if (assetErr) throw new Error(`asset lookup failed: ${assetErr.message}`)
    if (!asset) return json({ error: 'Report asset not found' }, 404)

    const path = String(asset.published_pdf_path || '')

    // Delete the published PDF so it can't be re-signed. Best-effort: a missing
    // object isn't an error (the report may never have been published).
    if (path) {
      const { error: rmErr } = await admin.storage.from(BUCKET).remove([path])
      if (rmErr) throw new Error(`storage delete failed: ${rmErr.message}`)
    }

    // Clear the pointer regardless — this is what actually revokes portal access.
    const { error: dbErr } = await admin
      .schema('neta_ops')
      .from('assets')
      .update({ published_pdf_path: null })
      .eq('id', assetId)
    if (dbErr) throw new Error(`db update failed: ${dbErr.message}`)

    return json({ ok: true, removed: Boolean(path) })
  } catch (e) {
    console.error('unpublish-report-pdf error:', e instanceof Error ? e.message : e)
    return json({ error: e instanceof Error ? e.message : 'Failed to unpublish report PDF' }, 500)
  }
})
