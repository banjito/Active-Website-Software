/**
 * Customer-facing RFQ emails for an opportunity.
 *
 * mode "acknowledge": thanks the opportunity's contact for the RFQ and tells
 *   them when to expect the proposal (proposal_due_date). Sent once per
 *   opportunity unless `resend` is set.
 * mode "date_change": tells the customer the proposal date moved. Only sends
 *   when an acknowledgment already went out and proposal_due_date now differs
 *   from the date they were last told (rfq_ack_promised_date), so the app can
 *   call it after any save without double-sending.
 *
 * Skips come back as 200 with emailSent:false; real failures are non-2xx with
 * an `error` message meant for the user.
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'
import {
  BRAND_COLOR,
  COMPANY_ESTIMATING_EMAIL,
  COMPANY_FULL_NAME,
  DEFAULT_FROM_EMAIL,
  isEmployeeEmailDomain,
  isEmployeeRole,
} from '../_shared/companyConfig.ts'
import { getEmailApiKey, sendEmail } from '../_shared/email.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    status,
  })
}

function isEmployee(user: any) {
  const email = String(user?.email || '').toLowerCase()
  const app = user?.app_metadata || {}
  const meta = user?.user_metadata || {}
  const role = String(app.role || meta.role || '').toLowerCase()
  const accountType = String(app.account_type || meta.account_type || '').toLowerCase()
  const userType = String(app.user_type || meta.user_type || '').toLowerCase()

  return isEmployeeEmailDomain(email) || accountType === 'employee' || userType === 'employee' || isEmployeeRole(role)
}

const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')

/** "2026-10-16" -> "Friday, October 16, 2026". Written out so 10/16 vs 16/10 can't be misread. */
const formatLongDate = (isoDate: string): string =>
  new Date(`${isoDate}T12:00:00Z`).toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  })

/** First 10 chars of a date or timestamp column ("YYYY-MM-DD"), or null. */
const toIsoDate = (value: unknown): string | null =>
  value ? String(value).slice(0, 10) : null

// Customers see the full company name, not the internal "<Company> System" sender.
const FROM_HEADER = DEFAULT_FROM_EMAIL.includes('<')
  ? DEFAULT_FROM_EMAIL
  : `${COMPANY_FULL_NAME} <${DEFAULT_FROM_EMAIL}>`

type Mode = 'acknowledge' | 'date_change'

interface EmailInput {
  mode: Mode
  firstName: string
  title: string
  quoteNumber: string
  dueDate: string
  previousDate: string | null
}

function buildEmail({ mode, firstName, title, quoteNumber, dueDate, previousDate }: EmailInput) {
  const quoteSuffix = quoteNumber ? `, Quote #${quoteNumber}` : ''
  const project = title || 'your project'
  const greeting = firstName ? `Hi ${firstName},` : 'Hello,'
  const due = formatLongDate(dueDate)
  const previous = previousDate ? formatLongDate(previousDate) : null

  const subject = mode === 'acknowledge'
    ? `We received your request${quoteSuffix}`
    : `Updated proposal date${quoteSuffix}`

  // Plain-text paragraphs; the HTML version is built from the same lines.
  const paragraphs: { text: string; html: string }[] = mode === 'acknowledge'
    ? [
        {
          text: `Thank you for your request for quote on ${project}. Our estimating team is working on it now.`,
          html: `Thank you for your request for quote on <strong>${escapeHtml(project)}</strong>. Our estimating team is working on it now.`,
        },
        {
          text: `You can expect a proposal by ${due}.`,
          html: `<strong>You can expect a proposal by ${due}.</strong>`,
        },
      ]
    : [
        {
          text: `A quick update on your request for quote on ${project}.`,
          html: `A quick update on your request for quote on <strong>${escapeHtml(project)}</strong>.`,
        },
        {
          text: `You can now expect a proposal by ${due}${previous ? ` (previously ${previous})` : ''}.`,
          html: `<strong>You can now expect a proposal by ${due}.</strong>${previous ? ` Previously ${previous}.` : ''}`,
        },
      ]

  if (quoteNumber) {
    paragraphs.push({
      text: `Your reference number is ${quoteNumber}.`,
      html: `Your reference number is <strong>${escapeHtml(quoteNumber)}</strong>.`,
    })
  }
  paragraphs.push({
    text: mode === 'acknowledge'
      ? 'If you have drawings, one-lines, or site details to add, just reply to this email.'
      : 'Questions? Just reply to this email.',
    html: mode === 'acknowledge'
      ? 'If you have drawings, one-lines, or site details to add, just reply to this email.'
      : 'Questions? Just reply to this email.',
  })

  const signoff = `The ${COMPANY_FULL_NAME} Estimating Team`

  const text = [
    greeting,
    '',
    ...paragraphs.flatMap((p) => [p.text, '']),
    'Thank you,',
    signoff,
  ].join('\n')

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #222; font-size: 15px; line-height: 1.5;">
      <div style="border-top: 4px solid ${BRAND_COLOR}; padding: 24px 20px;">
        <p style="margin: 0 0 16px 0;">${escapeHtml(greeting)}</p>
        ${paragraphs.map((p) => `<p style="margin: 0 0 16px 0;">${p.html}</p>`).join('\n        ')}
        <p style="margin: 24px 0 0 0;">Thank you,<br />${escapeHtml(signoff)}</p>
      </div>
    </div>
  `

  return { subject, html, text }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    if (!supabaseUrl || !serviceKey) throw new Error('Missing Supabase server credentials')

    const supabase = createClient(supabaseUrl, serviceKey)
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return json({ error: 'Missing authorization header' }, 401)

    const token = authHeader.replace('Bearer ', '')
    const { data: { user: caller }, error: callerError } = await supabase.auth.getUser(token)
    if (callerError || !caller) return json({ error: 'Invalid or expired token' }, 401)
    if (!isEmployee(caller)) return json({ error: 'Employee access required' }, 403)

    const body = await req.json().catch(() => ({}))
    const opportunityId = String(body?.opportunityId || '').trim()
    const mode: Mode = body?.mode === 'date_change' ? 'date_change' : 'acknowledge'
    const resend = body?.resend === true
    if (!opportunityId) return json({ error: 'opportunityId is required' }, 400)

    const { data: opp, error: oppError } = await supabase
      .schema('business')
      .from('opportunities')
      .select('id, title, quote_number, contact_id, proposal_due_date, rfq_ack_sent_at, rfq_ack_sent_to, rfq_ack_promised_date')
      .eq('id', opportunityId)
      .maybeSingle()
    if (oppError) throw oppError
    if (!opp) return json({ error: 'Opportunity not found' }, 404)

    const dueDate = toIsoDate(opp.proposal_due_date)
    const promisedDate = toIsoDate(opp.rfq_ack_promised_date)
    const skip = (reason: string) => json({ emailSent: false, reason })

    if (mode === 'date_change') {
      if (!opp.rfq_ack_sent_at) return skip('not_acknowledged')
      if (!dueDate) return skip('no_due_date')
      if (dueDate === promisedDate) return skip('date_unchanged')
    } else {
      if (opp.rfq_ack_sent_at && !resend) return skip('already_sent')
      if (!dueDate) return json({ error: 'Set a Proposal Due Date before sending the acknowledgment.' }, 400)
    }

    let contact: { first_name?: string | null; email?: string | null } | null = null
    if (opp.contact_id) {
      const { data, error } = await supabase
        .schema('common')
        .from('contacts')
        .select('first_name, email')
        .eq('id', opp.contact_id)
        .maybeSingle()
      if (error) throw error
      contact = data
    }

    // A date change still reaches whoever got the original if the contact was since cleared.
    const toEmail = String(contact?.email || (mode === 'date_change' ? opp.rfq_ack_sent_to : '') || '').trim()
    if (!toEmail.includes('@')) {
      return json({ error: 'The opportunity contact has no email address, so the customer was not emailed.' }, 400)
    }

    if (!getEmailApiKey()) return json({ error: 'Email is not configured (RESEND_API_KEY missing).' }, 500)

    const stamp: Record<string, string> = mode === 'date_change'
      ? { rfq_ack_promised_date: dueDate! }
      : { rfq_ack_sent_at: new Date().toISOString(), rfq_ack_sent_to: toEmail, rfq_ack_promised_date: dueDate! }
    const previous = Object.fromEntries(Object.keys(stamp).map((key) => [key, (opp as any)[key] ?? null]))

    // Claim the send before emailing, so a double-click or two saves racing
    // each other can't mail the customer twice. Undone if the send fails.
    let claim = supabase.schema('business').from('opportunities').update(stamp).eq('id', opp.id)
    if (mode === 'date_change') {
      claim = promisedDate ? claim.eq('rfq_ack_promised_date', promisedDate) : claim.is('rfq_ack_promised_date', null)
    } else if (!resend) {
      claim = claim.is('rfq_ack_sent_at', null)
    }
    const { data: claimed, error: claimError } = await claim.select('id')
    if (claimError) throw claimError
    if (!claimed?.length) return skip(mode === 'date_change' ? 'date_unchanged' : 'already_sent')

    const email = buildEmail({
      mode,
      firstName: String(contact?.first_name || '').trim(),
      title: String(opp.title || '').trim(),
      quoteNumber: String(opp.quote_number || '').trim(),
      dueDate: dueDate!,
      previousDate: mode === 'date_change' ? promisedDate : null,
    })

    const sendRes = await sendEmail({
      from: FROM_HEADER,
      to: toEmail,
      replyTo: COMPANY_ESTIMATING_EMAIL,
      subject: email.subject,
      html: email.html,
      text: email.text,
    })

    if (!sendRes.ok) {
      console.error('RFQ email send failed:', opp.id, sendRes.status, sendRes.body)
      const { error: revertError } = await supabase
        .schema('business')
        .from('opportunities')
        .update(previous)
        .eq('id', opp.id)
      if (revertError) console.error('Could not undo RFQ send stamp:', opp.id, revertError)
      return json({ error: `The email failed to send (provider status ${sendRes.status}).` }, 502)
    }

    console.log(`RFQ ${mode} email sent for opportunity ${opp.id} to ${toEmail}`)
    return json({ emailSent: true, sentTo: toEmail, dueDate })
  } catch (error: unknown) {
    console.error('Error in rfq-acknowledgment:', error)
    // PostgREST errors are plain objects, not Error instances.
    const message = (error as { message?: string })?.message || String(error)
    return json({ error: message }, 500)
  }
})
