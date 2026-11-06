import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'
import {
  BRAND_COLOR,
  COMPANY_ACCOUNTING_EMAIL,
  COMPANY_FULL_NAME,
  COMPANY_SUPPRESSED_EMAILS,
  DEFAULT_FROM_EMAIL,
  isEmployeeEmailDomain,
  isEmployeeRole,
} from '../_shared/companyConfig.ts'
import { sendEmail } from '../_shared/email.ts'

/**
 * Online signing for Change Orders (Project Management scope, item 13).
 *
 * Staff actions (signed-in employee):
 *   { action: "send", changeOrderId, signerName, signerEmail, origin }
 *       Snapshots the Change Order's current letter, emails the signer a link,
 *       marks the Change Order Sent. Earlier unsigned links for it stop working.
 *   { action: "notify_approved", changeOrderId }
 *       Tells accounting a Change Order was approved (manual approvals).
 *
 * Public actions (the link's secret is the only key):
 *   { action: "view", token }      the letter and the signing state
 *   { action: "sign", token, signedName, signatureImage, consent: true }
 *   { action: "decline", token, reason }
 *
 * Signing approves the Change Order and emails the signer, the sender and
 * accounting. The QuickBooks push stays with the job page ("Push to QB").
 * Tables: database/migrations/change_order_approval.sql.
 */

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

const FROM_HEADER = DEFAULT_FROM_EMAIL.includes('<') ? DEFAULT_FROM_EMAIL : `${COMPANY_FULL_NAME} <${DEFAULT_FROM_EMAIL}>`
const LINK_DAYS = 30
const CONSENT_TEXT =
  'I agree to sign this Change Order electronically. My typed name and drawn signature have the same effect as a handwritten signature.'

const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

const money = (n: number) =>
  `$${(Number(n) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

const pad3 = (n: number) => String(n).padStart(3, '0')

async function sha256Hex(text: string) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('')
}

function newToken() {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}

function isEmployee(user: any) {
  const email = String(user?.email || '').toLowerCase()
  const app = user?.app_metadata || {}
  const meta = user?.user_metadata || {}
  const role = String(app.role || meta.role || '').toLowerCase()
  const accountType = String(app.account_type || meta.account_type || '').toLowerCase()
  return isEmployeeEmailDomain(email) || accountType === 'employee' || isEmployeeRole(role)
}

// Only send links to this app: the configured URL, or localhost while testing.
function linkBase(origin: unknown) {
  const configured = (Deno.env.get('APP_URL') || '').replace(/\/+$/, '')
  const o = String(origin || '').replace(/\/+$/, '')
  if (/^http:\/\/localhost(:\d+)?$/.test(o)) return o
  if (configured) return configured
  if (/^https:\/\/[a-z0-9.-]+$/i.test(o)) return o
  return null
}

const isEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)

function wrapEmail(body: string) {
  return `
<div style="font-family: Arial, sans-serif; font-size: 15px; line-height: 1.5; color: #171717; max-width: 560px;">
  <div style="border-top: 4px solid ${BRAND_COLOR}; padding-top: 16px;">${body}</div>
</div>`
}

function button(href: string, label: string) {
  return `<p><a href="${escapeHtml(href)}" style="display:inline-block;background:${BRAND_COLOR};color:#fff;padding:10px 18px;text-decoration:none;font-weight:bold;">${escapeHtml(label)}</a></p>
<p style="color:#525252;font-size:13px;">Or copy this link: ${escapeHtml(href)}</p>`
}

const suppressed = new Set(COMPANY_SUPPRESSED_EMAILS.map((e: string) => e.toLowerCase()))
const recipients = (list: (string | null | undefined)[]) =>
  [...new Set(list.filter((e): e is string => !!e && isEmail(e)).map((e) => e.toLowerCase()))].filter(
    (e) => !suppressed.has(e),
  )

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  try {
    const url = Deno.env.get('SUPABASE_URL')
    const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    if (!url || !key) throw new Error('Missing Supabase server credentials')
    const db = createClient(url, key, { auth: { persistSession: false } })
    const ops = db.schema('neta_ops')

    const body = await req.json().catch(() => ({}))
    const action = String(body?.action || '')

    // Loads a Change Order with its job, for emails and checks
    const loadChangeOrder = async (id: string) => {
      const { data: co, error } = await ops
        .from('job_change_orders')
        .select('id, job_id, co_number, title, amount, status, opportunity_id, user_id')
        .eq('id', id)
        .maybeSingle()
      if (error) throw error
      if (!co) return null
      const { data: job } = await ops.from('jobs').select('id, job_number, title').eq('id', co.job_id).maybeSingle()
      return { co, job }
    }

    // ---------------------------------------------------------------- staff
    if (action === 'send' || action === 'notify_approved') {
      const auth = (req.headers.get('Authorization') || '').replace('Bearer ', '')
      const { data: { user }, error: userError } = await db.auth.getUser(auth)
      if (userError || !user) return json({ error: 'Sign in again, then retry.' }, 401)
      if (!isEmployee(user)) return json({ error: 'Employee access required' }, 403)

      const changeOrderId = String(body?.changeOrderId || '')
      const loaded = changeOrderId ? await loadChangeOrder(changeOrderId) : null
      if (!loaded) return json({ error: 'Change Order not found' }, 404)
      const { co, job } = loaded
      const label = `Change Order ${pad3(co.co_number)}${job?.job_number ? ` on Job ${job.job_number}` : ''}`

      if (action === 'notify_approved') {
        if (co.status !== 'approved') return json({ error: 'Not approved yet' }, 409)
        const to = recipients([COMPANY_ACCOUNTING_EMAIL])
        if (to.length === 0) return json({ emailSent: false, reason: 'no_recipient' })
        const res = await sendEmail({
          from: FROM_HEADER,
          to,
          subject: `${label} approved`,
          html: wrapEmail(`<p><b>${escapeHtml(label)}</b> was approved.</p>
<p>${escapeHtml(co.title)}<br/>Price: <b>${money(co.amount)}</b></p>
<p style="color:#525252;">Approved by ${escapeHtml(String(user.email || 'staff'))} in ampOS.</p>`),
          text: `${label} was approved.\n${co.title}\nPrice: ${money(co.amount)}`,
        })
        return json({ emailSent: res.ok })
      }

      // send
      if (co.status === 'approved' || co.status === 'rejected') {
        return json({ error: `This Change Order is already ${co.status}.` }, 409)
      }
      const signerName = String(body?.signerName || '').trim().slice(0, 200)
      const signerEmail = String(body?.signerEmail || '').trim().toLowerCase().slice(0, 254)
      if (!signerName || !isEmail(signerEmail)) return json({ error: 'Enter the signer\'s name and email.' }, 400)
      const base = linkBase(body?.origin)
      if (!base) return json({ error: 'Set APP_URL for this function, or send from the app.' }, 400)
      if (!co.opportunity_id) return json({ error: 'Price it on an estimate sheet and save the letter first.' }, 409)

      const { data: opp } = await db
        .schema('business')
        .from('opportunities')
        .select('selected_letter_proposal')
        .eq('id', co.opportunity_id)
        .maybeSingle()
      let letterQuery = db.schema('business').from('letter_proposals').select('id, html')
      letterQuery = opp?.selected_letter_proposal
        ? letterQuery.eq('id', opp.selected_letter_proposal)
        : letterQuery.eq('opportunity_id', co.opportunity_id).order('updated_at', { ascending: false }).limit(1)
      const { data: letters, error: letterError } = await letterQuery
      if (letterError) throw letterError
      const letter = (letters ?? [])[0]
      if (!letter?.html) return json({ error: 'No letter yet. Save the letter on its estimate sheet first.' }, 409)

      const token = newToken()
      const expires = new Date(Date.now() + LINK_DAYS * 86400000)

      // Earlier unsigned links for this Change Order stop working
      await ops.from('change_order_signatures').update({ status: 'void' }).eq('change_order_id', co.id).eq('status', 'sent')

      const { error: insertError } = await ops.from('change_order_signatures').insert({
        change_order_id: co.id,
        token_hash: await sha256Hex(token),
        signer_name: signerName,
        signer_email: signerEmail,
        sent_by: user.id,
        expires_at: expires.toISOString(),
        letter_proposal_id: letter.id,
        letter_html: letter.html,
        letter_sha256: await sha256Hex(letter.html),
        amount: co.amount,
        consent_text: CONSENT_TEXT,
      })
      if (insertError) throw insertError

      const link = `${base}/sign-change-order/${token}`
      const first = signerName.split(/\s+/)[0]
      const res = await sendEmail({
        from: FROM_HEADER,
        to: signerEmail,
        replyTo: user.email || undefined,
        subject: `Please review and sign ${label}`,
        html: wrapEmail(`<p>Hi ${escapeHtml(first)},</p>
<p>${escapeHtml(COMPANY_FULL_NAME)} sent you <b>${escapeHtml(label)}</b>${job?.title ? ` for ${escapeHtml(job.title)}` : ''}: ${escapeHtml(co.title)}, ${money(co.amount)}.</p>
<p>Review the letter and sign it online. No account needed.</p>
${button(link, 'Review and sign')}
<p style="color:#525252;font-size:13px;">This link works for ${LINK_DAYS} days. Questions? Reply to this email.</p>`),
        text: `Hi ${first},\n\n${COMPANY_FULL_NAME} sent you ${label}: ${co.title}, ${money(co.amount)}.\nReview and sign: ${link}\n\nThis link works for ${LINK_DAYS} days.`,
      })
      if (!res.ok) {
        await ops.from('change_order_signatures').update({ status: 'void' }).eq('token_hash', await sha256Hex(token))
        return json({ error: `The email failed to send (provider status ${res.status}).` }, 502)
      }
      if (co.status === 'draft') await ops.from('job_change_orders').update({ status: 'submitted' }).eq('id', co.id)
      return json({ sent: true, sentTo: signerEmail, expiresAt: expires.toISOString() })
    }

    // --------------------------------------------------------------- public
    if (action === 'view' || action === 'sign' || action === 'decline') {
      const token = String(body?.token || '')
      if (!/^[0-9a-f]{64}$/.test(token)) return json({ error: 'This link is not valid.' }, 404)
      const { data: sig, error: sigError } = await ops
        .from('change_order_signatures')
        .select('*')
        .eq('token_hash', await sha256Hex(token))
        .maybeSingle()
      if (sigError) throw sigError
      if (!sig) return json({ error: 'This link is not valid.' }, 404)
      const loaded = await loadChangeOrder(sig.change_order_id)
      if (!loaded) return json({ error: 'This Change Order no longer exists.' }, 404)
      const { co, job } = loaded
      const expired = sig.status === 'sent' && new Date(sig.expires_at).getTime() < Date.now()
      const state = expired ? 'expired' : sig.status

      if (action === 'view') {
        return json({
          state,
          companyName: COMPANY_FULL_NAME,
          changeOrderNumber: pad3(co.co_number),
          jobNumber: job?.job_number ?? null,
          jobTitle: job?.title ?? null,
          title: co.title,
          amount: sig.amount,
          signerName: sig.signer_name,
          letterHtml: sig.letter_html,
          letterSha256: sig.letter_sha256,
          consentText: sig.consent_text || CONSENT_TEXT,
          signedName: sig.signed_name,
          signedAt: sig.signed_at,
          signatureImage: state === 'signed' ? sig.signature_image : null,
          expiresAt: sig.expires_at,
        })
      }

      if (state !== 'sent') {
        const why: Record<string, string> = {
          signed: 'This Change Order is already signed.',
          declined: 'This Change Order was declined.',
          void: 'This link was replaced by a newer one. Check your email for the latest.',
          expired: 'This link has expired. Ask your contact to send a new one.',
        }
        return json({ error: why[state] || 'This link can no longer be used.' }, 409)
      }

      const ip = (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() || null
      const userAgent = (req.headers.get('user-agent') || '').slice(0, 500) || null
      const { data: sender } = sig.sent_by ? await db.auth.admin.getUserById(sig.sent_by) : { data: null }
      const senderEmail = (sender as any)?.user?.email ?? null
      const label = `Change Order ${pad3(co.co_number)}${job?.job_number ? ` on Job ${job.job_number}` : ''}`

      if (action === 'decline') {
        const reason = String(body?.reason || '').trim().slice(0, 2000) || null
        const { data: claimed } = await ops
          .from('change_order_signatures')
          .update({ status: 'declined', declined_at: new Date().toISOString(), decline_reason: reason, signed_ip: ip, signed_user_agent: userAgent })
          .eq('id', sig.id)
          .eq('status', 'sent')
          .select('id')
        if (!claimed?.length) return json({ error: 'This link can no longer be used.' }, 409)
        const to = recipients([senderEmail])
        if (to.length) {
          await sendEmail({
            from: FROM_HEADER,
            to,
            subject: `${label} was declined`,
            html: wrapEmail(`<p>${escapeHtml(sig.signer_name)} declined <b>${escapeHtml(label)}</b> (${escapeHtml(co.title)}).</p>
${reason ? `<p>Their note: ${escapeHtml(reason)}</p>` : ''}<p style="color:#525252;">It's still open on the job. Edit it and send again, or reject it.</p>`),
            text: `${sig.signer_name} declined ${label} (${co.title}).${reason ? `\nTheir note: ${reason}` : ''}`,
          })
        }
        return json({ declined: true })
      }

      // sign
      const signedName = String(body?.signedName || '').trim().slice(0, 200)
      const signatureImage = String(body?.signatureImage || '')
      if (body?.consent !== true) return json({ error: 'Check the box to agree to sign electronically.' }, 400)
      if (!signedName) return json({ error: 'Type your full name.' }, 400)
      if (!/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(signatureImage) || signatureImage.length > 300000) {
        return json({ error: 'Draw your signature in the box.' }, 400)
      }
      const now = new Date()
      const { data: claimed, error: claimError } = await ops
        .from('change_order_signatures')
        .update({
          status: 'signed',
          signed_name: signedName,
          signature_image: signatureImage,
          signed_ip: ip,
          signed_user_agent: userAgent,
          signed_at: now.toISOString(),
        })
        .eq('id', sig.id)
        .eq('status', 'sent')
        .select('id')
      if (claimError) throw claimError
      if (!claimed?.length) return json({ error: 'This link can no longer be used.' }, 409)

      // Approve the Change Order, unless someone already decided it
      if (co.status !== 'approved' && co.status !== 'rejected') {
        const { error: approveError } = await ops
          .from('job_change_orders')
          .update({
            status: 'approved',
            approved_at: now.toISOString(),
            approved_date: now.toISOString().slice(0, 10),
            approved_by_name: signedName,
            approval_method: 'signed_online',
            amount: sig.amount ?? co.amount,
          })
          .eq('id', co.id)
        if (approveError) console.error('change-order-signature: approve failed', co.id, approveError)
      }

      const link = `${linkBase(body?.origin) ?? ''}/sign-change-order/${token}`
      const summary = `<p><b>${escapeHtml(label)}</b>: ${escapeHtml(co.title)}, ${money(sig.amount ?? co.amount)}.</p>
<p>Signed by ${escapeHtml(signedName)} on ${now.toUTCString()}.</p>`
      const signerRes = await sendEmail({
        from: FROM_HEADER,
        to: sig.signer_email,
        replyTo: senderEmail || undefined,
        subject: `Signed: ${label}`,
        html: wrapEmail(`<p>Thanks, ${escapeHtml(signedName.split(/\s+/)[0])}. Here's your copy.</p>${summary}
${linkBase(body?.origin) ? button(link, 'View or print the signed copy') : ''}`),
        text: `Thanks. You signed ${label}: ${co.title}, ${money(sig.amount ?? co.amount)}.`,
      })
      const staff = recipients([senderEmail, COMPANY_ACCOUNTING_EMAIL])
      if (staff.length) {
        await sendEmail({
          from: FROM_HEADER,
          to: staff,
          subject: `${label} signed and approved`,
          html: wrapEmail(`${summary}<p>It's approved on the job. If the job is linked to QuickBooks, use "Push to QB" on the job's Change Orders.</p>
${linkBase(body?.origin) ? button(link, 'View the signed copy') : ''}`),
          text: `${label} was signed by ${signedName} and approved. ${co.title}, ${money(sig.amount ?? co.amount)}.`,
        })
      }
      return json({ signed: true, copyEmailed: signerRes.ok })
    }

    return json({ error: 'Unknown action' }, 400)
  } catch (error: unknown) {
    console.error('change-order-signature failed:', error)
    return json({ error: error instanceof Error ? error.message : String(error) }, 500)
  }
})
