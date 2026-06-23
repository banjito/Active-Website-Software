import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'

// Renders an approved/sent report to a REAL, print-styled PDF and publishes it
// to the private customer-reports bucket (ampOS ACCESS).
//
// This is the on-send counterpart to scripts/publish-report-pdfs.mjs. Instead
// of a screenshot (html2canvas), it drives a headless Chromium via Browserless
// and uses Chromium's page.pdf(), which emulates print media — so the output is
// identical to what a user gets from the in-app Print button (white background,
// black text, page breaks, no app chrome).
//
// Flow: mint a short-lived HMAC print token -> Browserless loads
// <STAFF_APP_URL><reportPath>?print=true&token=... -> the page's RequireAuth
// exchanges the token (report-print-auth) for a renderer session and fetches
// the RLS-protected data client-side -> page.pdf() -> upload -> stamp
// neta_ops.assets.published_pdf_path.
//
// Required secrets (supabase functions secrets set ...):
//   PRINT_TOKEN_SECRET        - must match report-print-auth
//   STAFF_APP_URL             - PUBLIC url of the deployed staff app (Browserless
//                               must reach it; localhost will NOT work)
//   BROWSERLESS_URL           - e.g. https://production-sfo.browserless.io
//   BROWSERLESS_TOKEN         - Browserless API token
//   SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY (auto in runtime)

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const BUCKET = 'customer-reports'
const TOKEN_TTL_SECONDS = 600

// Staff gate — copied from customer-portal-invite so the two agree. This is a
// POSITIVE check: a single auth account can be flagged account_type=customer
// (e.g. staff who invited their own email to test the portal) yet still be an
// employee, so we must not reject on "is a customer" alone.
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
    email.endsWith('@ampqes.com') ||
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

function bytesToBase64url(bytes: Uint8Array): string {
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/**
 * Mint a token that report-print-auth validates byte-for-byte. Format:
 *   base64url(payloadJson) + "." + base64url(HMAC_SHA256(payloadB64, secret))
 */
async function mintPrintToken(assetId: string, secret: string): Promise<string> {
  const payload = JSON.stringify({
    aid: assetId,
    exp: Math.floor(Date.now() / 1000) + TOKEN_TTL_SECONDS,
  })
  const payloadB64 = bytesToBase64url(new TextEncoder().encode(payload))
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const sig = new Uint8Array(
    await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payloadB64)),
  )
  return `${payloadB64}.${bytesToBase64url(sig)}`
}

/** Render a URL to PDF bytes via Browserless, matching the backfill's options. */
async function renderPdf(url: string): Promise<Uint8Array> {
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
      url,
      // page.pdf() emulates print media -> same as the in-app Print button.
      options: {
        format: 'A4',
        landscape: true,
        printBackground: true,
        margin: { top: '0.4in', bottom: '0.4in', left: '0.3in', right: '0.3in' },
      },
      // The report fetches its data client-side after load; networkidle2 fires
      // once that settles. No HMR websocket on the deployed app, so it's
      // reliable here (unlike the dev server). Most reports render through
      // ReportWrapper with no stable "ready" selector, so we don't gate on one
      // — we wait out the network, then a fixed settle for chart paint.
      gotoOptions: { waitUntil: 'networkidle2', timeout: 90000 },
      waitForTimeout: 5000,
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
    const printSecret = Deno.env.get('PRINT_TOKEN_SECRET')
    const staffAppUrl = (Deno.env.get('STAFF_APP_URL') || '').replace(/\/$/, '')
    if (!supabaseUrl || !anonKey || !serviceKey) throw new Error('Missing Supabase credentials')
    if (!printSecret) throw new Error('Missing PRINT_TOKEN_SECRET')
    if (!staffAppUrl) throw new Error('Missing STAFF_APP_URL')

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

    // Service role: read the asset, resolve its job + customer, write the result.
    const admin = createClient(supabaseUrl, serviceKey)

    const { data: asset, error: assetErr } = await admin
      .schema('neta_ops')
      .from('assets')
      .select('id, file_url, status')
      .eq('id', assetId)
      .maybeSingle()
    if (assetErr) throw new Error(`asset lookup failed: ${assetErr.message}`)
    if (!asset) return json({ error: 'Report asset not found' }, 404)

    const fileUrl = String(asset.file_url || '')
    if (!fileUrl.startsWith('report:')) {
      return json({ error: 'Asset has no internal report to render' }, 400)
    }
    if (!['approved', 'sent'].includes(String(asset.status || '').toLowerCase())) {
      return json({ error: 'Only approved/sent reports can be published' }, 409)
    }

    // asset -> job -> customer
    const { data: link } = await admin
      .schema('neta_ops')
      .from('job_assets')
      .select('job_id')
      .eq('asset_id', assetId)
      .maybeSingle()
    const jobId = link?.job_id
    if (!jobId) return json({ error: 'Report is not linked to a job' }, 409)

    const { data: jobRow } = await admin
      .schema('neta_ops')
      .from('jobs')
      .select('customer_id')
      .eq('id', jobId)
      .maybeSingle()
    const customerId = jobRow?.customer_id
    if (!customerId) return json({ error: 'Job has no linked customer' }, 409)

    // Mint token, render, upload, stamp.
    const reportPath = fileUrl.replace('report:', '')
    const token = await mintPrintToken(assetId, printSecret)
    const url = `${staffAppUrl}${reportPath}?print=true&token=${encodeURIComponent(token)}`

    const pdf = await renderPdf(url)

    const path = `${customerId}/${jobId}/${assetId}.pdf`
    const { error: upErr } = await admin.storage
      .from(BUCKET)
      .upload(path, new Blob([pdf], { type: 'application/pdf' }), {
        contentType: 'application/pdf',
        upsert: true,
      })
    if (upErr) throw new Error(`upload failed: ${upErr.message}`)

    const { error: dbErr } = await admin
      .schema('neta_ops')
      .from('assets')
      .update({ published_pdf_path: path })
      .eq('id', assetId)
    if (dbErr) throw new Error(`db update failed: ${dbErr.message}`)

    return json({ ok: true, path })
  } catch (e) {
    console.error('publish-report-pdf error:', e instanceof Error ? e.message : e)
    return json({ error: e instanceof Error ? e.message : 'Failed to publish report PDF' }, 500)
  }
})
