import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'
import { isEmployeeEmailDomain, isEmployeeRole } from '../_shared/companyConfig.ts'

// Publishes a delivered packet's cover letter to ampOS ACCESS.
//
// A "deliverable" (Report Packet) is a cover letter + selected reports. The
// reports are published one by one through publish-report-pdf (the staff app
// loops over them; rendering many reports here would outrun this function's
// time limit). This function handles the cover letter only.
//
// The cover letter is stored as a self-contained HTML document
// (neta_ops.generated_documents.html), so Browserless renders it straight from
// `html`: no staff-app page, print token or renderer login needed.
//
// Flow: staff check -> load deliverable (must be Delivered) -> job -> customer
// -> cover letter html -> Browserless /pdf -> upload to the private
// customer-reports bucket -> stamp neta_ops.deliverables.published_cover_pdf_path.
// customer-report-download signs it for the customer.
//
// Required secrets (same as publish-report-pdf):
//   BROWSERLESS_URL / BROWSERLESS_TOKEN
//   STAFF_APP_URL (optional here: base for any relative image URLs in the letter)

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const BUCKET = 'customer-reports'

// Same positive staff check as publish-report-pdf: a staff account may also
// carry a customer flag, so never reject on "is a customer" alone.
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

// This Browserless tier renders with SCREEN media (see publish-report-pdf), so
// the letter's own @media print rules never apply. Apply the same page layout
// the in-app viewer uses for printing, unconditionally.
const PAGE_LAYOUT_CSS = `<style data-ampos-pdf>
html, body { margin: 0 !important; padding: 0 !important; background: #fff !important; height: auto !important; overflow: visible !important; }
.print-hidden { display: none !important; }
.amp-page { display: flex !important; flex-direction: column !important; height: 11in !important; width: 8.5in !important; margin: 0 !important; overflow: hidden !important; box-sizing: border-box !important; transform: none !important; page-break-after: always !important; break-after: page !important; }
.amp-page:last-child { page-break-after: auto !important; break-after: auto !important; }
.amp-stripe { position: absolute !important; }
.amp-header { position: relative !important; top: auto !important; left: auto !important; right: auto !important; flex-shrink: 0 !important; }
.amp-page-content { flex: 1 1 auto !important; overflow: hidden !important; min-height: 0 !important; }
.amp-footer { position: relative !important; bottom: auto !important; left: auto !important; right: auto !important; flex-shrink: 0 !important; margin-top: auto !important; }
.toc-page { page-break-before: always !important; break-before: page !important; }
</style>`

/** Prepare the stored letter html for a standalone render. */
function prepareHtml(raw: string, staffAppUrl: string): string {
  let html = raw
  // Relative image URLs resolve against the staff app (where the in-app viewer
  // shows the letter), not about:blank.
  if (staffAppUrl) {
    const base = `<base href="${staffAppUrl}/">`
    html = /<head[^>]*>/i.test(html)
      ? html.replace(/<head[^>]*>/i, (m) => `${m}${base}`)
      : `${base}${html}`
  }
  return html.includes('</head>')
    ? html.replace('</head>', `${PAGE_LAYOUT_CSS}</head>`)
    : `${html}${PAGE_LAYOUT_CSS}`
}

async function renderPdf(html: string): Promise<Uint8Array> {
  const browserlessUrl = Deno.env.get('BROWSERLESS_URL')
  const browserlessToken = Deno.env.get('BROWSERLESS_TOKEN')
  if (!browserlessUrl || !browserlessToken) {
    throw new Error('Browserless is not configured (BROWSERLESS_URL / BROWSERLESS_TOKEN)')
  }
  const endpoint = `${browserlessUrl.replace(/\/$/, '')}/pdf?token=${browserlessToken}`

  const resp = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      html,
      // Letter, no margins: the brand stripe runs the full page height, same as
      // printing the letter from the app with margins set to None.
      options: {
        format: 'Letter',
        printBackground: true,
        preferCSSPageSize: true,
        margin: { top: '0', bottom: '0', left: '0', right: '0' },
      },
      gotoOptions: { waitUntil: 'networkidle0', timeout: 60000 },
      waitForTimeout: 1000,
      bestAttempt: true,
    }),
  })

  if (!resp.ok) {
    const detail = await resp.text().catch(() => '')
    throw new Error(`Browserless ${resp.status}: ${detail.slice(0, 500)}`)
  }
  return new Uint8Array(await resp.arrayBuffer())
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    const staffAppUrl = (Deno.env.get('STAFF_APP_URL') || '').replace(/\/$/, '')
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

    const { data: deliverable, error: delErr } = await admin
      .schema('neta_ops')
      .from('deliverables')
      .select('id, job_id, cover_letter_id, status')
      .eq('id', deliverableId)
      .maybeSingle()
    if (delErr) throw new Error(`deliverable lookup failed: ${delErr.message}`)
    if (!deliverable) return json({ error: 'Deliverable not found' }, 404)
    // ACCESS only shows Delivered packets; don't publish anything earlier.
    if (String(deliverable.status || '').toLowerCase() !== 'delivered') {
      return json({ error: 'Only delivered packets can be published' }, 409)
    }
    if (!deliverable.cover_letter_id) {
      return json({ error: 'Deliverable has no cover letter' }, 409)
    }

    const { data: jobRow } = await admin
      .schema('neta_ops')
      .from('jobs')
      .select('customer_id')
      .eq('id', deliverable.job_id)
      .maybeSingle()
    const customerId = jobRow?.customer_id
    if (!customerId) return json({ error: 'Job has no linked customer' }, 409)

    const { data: doc, error: docErr } = await admin
      .schema('neta_ops')
      .from('generated_documents')
      .select('html')
      .eq('id', deliverable.cover_letter_id)
      .maybeSingle()
    if (docErr) throw new Error(`cover letter lookup failed: ${docErr.message}`)
    const rawHtml = String(doc?.html || '')
    if (!rawHtml.trim()) return json({ error: 'Cover letter is empty' }, 409)

    const pdf = await renderPdf(prepareHtml(rawHtml, staffAppUrl))

    const path = `${customerId}/${deliverable.job_id}/packets/${deliverableId}-cover-letter.pdf`
    const { error: upErr } = await admin.storage
      .from(BUCKET)
      .upload(path, new Blob([pdf], { type: 'application/pdf' }), {
        contentType: 'application/pdf',
        upsert: true,
        cacheControl: '60',
      })
    if (upErr) throw new Error(`upload failed: ${upErr.message}`)

    const { error: dbErr } = await admin
      .schema('neta_ops')
      .from('deliverables')
      .update({ published_cover_pdf_path: path })
      .eq('id', deliverableId)
    if (dbErr) throw new Error(`db update failed: ${dbErr.message}`)

    return json({ ok: true, path })
  } catch (e) {
    console.error('publish-deliverable-pdf error:', e instanceof Error ? e.message : e)
    return json({ error: e instanceof Error ? e.message : 'Failed to publish cover letter' }, 500)
  }
})
