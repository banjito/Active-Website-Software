// Send one job bill: the QuickBooks invoice PDF (pulled fresh, so Kelly's edits
// in QuickBooks are included) plus any files the PM attached, emailed from
// accounting with accounting copied. Then marks the bill sent.
//
// POST { bill_id, to: string[], cc?: string[], subject, body, attachments?: [{ filename, content (base64) }] }
// Who can send: anyone who can see the bill (PMs/admins or the job's PM; job_bills RLS).
// Test-company bills may only go to company addresses.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'
import { encode as base64Encode } from 'https://deno.land/std@0.168.0/encoding/base64.ts'
import { getAccessToken, QuickBooksReconnectError, type Connection } from '../_shared/quickbooksConnection.ts'
import { sendEmail } from '../_shared/email.ts'
import { COMPANY_ACCOUNTING_EMAIL, COMPANY_FULL_NAME, isEmployeeEmailDomain } from '../_shared/companyConfig.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status })

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/
const MAX_RECIPIENTS = 10
const MAX_EXTRA_BYTES = 15 * 1024 * 1024

const cleanList = (value: unknown): string[] =>
  Array.isArray(value)
    ? [...new Set(value.map((v) => String(v).trim().toLowerCase()).filter(Boolean))]
    : []

const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

const safeName = (name: string) => name.replace(/[^\w.\- ()#]+/g, '_').slice(0, 120) || 'file.pdf'

async function invoicePdf(db: ReturnType<typeof createClient>, encryptionKey: string, realmId: string, invoiceId: string) {
  const call = (connection: Connection, token: string) => {
    const base = connection.environment === 'production'
      ? 'https://quickbooks.api.intuit.com'
      : 'https://sandbox-quickbooks.api.intuit.com'
    return fetch(`${base}/v3/company/${connection.realm_id}/invoice/${encodeURIComponent(invoiceId)}/pdf`, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/pdf' },
    })
  }
  let { token, connection } = await getAccessToken(db, encryptionKey, undefined, realmId)
  let res = await call(connection, token)
  if (res.status === 401) {
    ;({ token, connection } = await getAccessToken(db, encryptionKey, connection.access_token, realmId))
    res = await call(connection, token)
  }
  if (!res.ok) throw new Error(`QuickBooks would not send the invoice PDF (status ${res.status}).`)
  return base64Encode(new Uint8Array(await res.arrayBuffer()))
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    const encryptionKey = Deno.env.get('QB_ENCRYPTION_KEY')
    if (!supabaseUrl || !anonKey || !serviceKey || !encryptionKey) throw new Error('Server is missing settings.')

    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return json({ error: 'Missing authorization header' }, 401)

    // The sender's own login, so the bill's row rules decide who may send it
    const asUser = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } })
    const { data: { user } } = await asUser.auth.getUser(authHeader.replace('Bearer ', ''))
    if (!user) return json({ error: 'Invalid or expired login' }, 401)

    let body: Record<string, unknown>
    try {
      body = await req.json()
    } catch {
      return json({ error: 'Request body must be JSON' }, 400)
    }

    const billId = String(body.bill_id ?? '')
    const { data: bill, error: billError } = await asUser
      .schema('neta_ops')
      .from('job_bills')
      .select('*')
      .eq('id', billId)
      .maybeSingle()
    if (billError) return json({ error: billError.message }, 400)
    if (!bill) return json({ error: 'Bill not found, or you cannot send it.' }, 404)
    if (bill.status === 'void') return json({ error: 'This bill was voided.' }, 400)

    // Recipients. Accounting is always copied.
    const to = cleanList(body.to)
    const cc = [...new Set([...cleanList(body.cc), COMPANY_ACCOUNTING_EMAIL.toLowerCase()])].filter((a) => !to.includes(a))
    if (to.length === 0) return json({ error: 'Add who the bill goes to.' }, 400)
    if (to.length + cc.length > MAX_RECIPIENTS * 2) return json({ error: 'Too many addresses.' }, 400)
    const bad = [...to, ...cc].find((a) => !EMAIL.test(a))
    if (bad) return json({ error: `"${bad}" isn't an email address.` }, 400)
    if (bill.is_test) {
      const outside = [...to, ...cc].find((a) => !isEmployeeEmailDomain(a))
      if (outside) return json({ error: `Test bills only go to company addresses. Remove ${outside}.` }, 400)
    }

    const subject = String(body.subject ?? '').trim().slice(0, 250)
    if (!subject) return json({ error: 'Add a subject.' }, 400)
    const text = String(body.body ?? '').slice(0, 20000)

    // Files the PM attached (SOV, lien waiver)
    const extras = Array.isArray(body.attachments) ? body.attachments : []
    let extraBytes = 0
    const files = extras.map((a: any) => {
      const content = String(a?.content ?? '')
      extraBytes += Math.floor((content.length * 3) / 4)
      return { filename: safeName(String(a?.filename ?? 'file.pdf')), content }
    })
    if (extraBytes > MAX_EXTRA_BYTES) return json({ error: 'Attached files are over 15 MB.' }, 400)
    if (files.some((f) => !f.content)) return json({ error: 'An attached file was empty.' }, 400)

    const service = createClient(supabaseUrl, serviceKey)
    const invoiceName = `Invoice ${bill.qbo_doc_number || bill.qbo_invoice_id}.pdf`
    const invoice = await invoicePdf(service, encryptionKey, bill.realm_id, bill.qbo_invoice_id)

    const html = `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.5;color:#111">${escapeHtml(text).replace(/\r?\n/g, '<br>')}</div>`
    const sent = await sendEmail({
      from: `${COMPANY_FULL_NAME} Accounting <${COMPANY_ACCOUNTING_EMAIL}>`,
      to,
      cc,
      replyTo: COMPANY_ACCOUNTING_EMAIL,
      subject,
      html,
      text,
      attachments: [{ filename: invoiceName, content: invoice }, ...files],
    })
    if (!sent.ok) {
      console.error('send-bill: email failed', sent.status, sent.body)
      return json({ error: `The email didn't go out (${sent.status || 'no response'}). Nothing was marked sent.` }, 502)
    }

    const { error: markError } = await asUser
      .schema('neta_ops')
      .from('job_bills')
      .update({
        status: 'sent',
        sent_at: new Date().toISOString(),
        sent_by: user.id,
        sent_to: to,
        sent_cc: cc,
        sent_subject: subject,
      })
      .eq('id', bill.id)
    if (markError) console.error('send-bill: sent but could not mark the bill', markError)

    return json({ success: true, email_id: sent.id ?? null, marked: !markError })
  } catch (error) {
    if (error instanceof QuickBooksReconnectError) return json({ error: error.message, code: 'QB_RECONNECT' }, 409)
    console.error('send-bill error:', error)
    return json({ error: error instanceof Error ? error.message : 'Server error' }, 500)
  }
})
