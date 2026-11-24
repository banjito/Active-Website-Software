// Sign-in links for invited subcontractors (Roles scope item 8).
//
// The link is made here and emailed through Resend, not by Supabase's own mailer,
// and it uses a one-time token (?token_hash=) so it works in any browser or device.
// AuthCallback.tsx redeems it and then opens `next`.

import { BRAND_COLOR, COMPANY_NAME, DEFAULT_FROM_EMAIL } from './companyConfig.ts'
import { buildFromHeader, sendEmail } from './email.ts'

// deno-lint-ignore no-explicit-any
type Admin = any

const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string)

/**
 * Where sign-in links point. Never an address the request supplies: a link carrying a
 * one-time token must only ever lead to ampOS. APP_URL (white-label instances) or ampOS.
 * `allowLocalhost`: a signed-in staff member testing on their own computer.
 */
export function appBaseUrl(req: Request, allowLocalhost = false): string {
  const origin = req.headers.get('origin') || ''
  if (allowLocalhost && /^http:\/\/localhost(:\d+)?$/i.test(origin)) return origin
  return (Deno.env.get('APP_URL') || Deno.env.get('SITE_URL') || 'https://ampos.io').replace(/\/+$/, '')
}

/** A one-time sign-in link for an existing account. */
export async function signInLink(
  supabase: Admin,
  email: string,
  appUrl: string,
  next: string,
): Promise<string> {
  const { data, error } = await supabase.auth.admin.generateLink({ type: 'magiclink', email })
  const hash = data?.properties?.hashed_token
  if (error || !hash) throw new Error(error?.message || 'Could not make a sign-in link')
  const params = new URLSearchParams({ token_hash: hash, type: 'magiclink', next })
  return `${appUrl}/auth/callback?${params.toString()}`
}

/** Emails the sign-in link. `intro` is one plain sentence about why they're getting it. */
export async function emailSignInLink(opts: {
  to: string
  name: string
  link: string
  subject: string
  intro: string
}): Promise<boolean> {
  const name = escapeHtml(opts.name || 'there')
  const intro = escapeHtml(opts.intro)
  const html = `<!doctype html><html><body style="margin:0;padding:24px;background:#f5f5f5;font-family:Arial,sans-serif;color:#1b1b1b">
<div style="max-width:520px;margin:0 auto;background:#ffffff;border-top:4px solid ${BRAND_COLOR};padding:28px">
<p style="margin:0 0 14px;font-size:16px">Hi ${name},</p>
<p style="margin:0 0 20px;font-size:15px;line-height:1.5">${intro}</p>
<p style="margin:0 0 22px"><a href="${opts.link}" style="display:inline-block;background:${BRAND_COLOR};color:#ffffff;text-decoration:none;font-weight:bold;padding:12px 20px">Open ampOS</a></p>
<p style="margin:0;font-size:13px;color:#5d5d5b;line-height:1.5">The button works once and for a limited time. After that, open ampOS, choose "Email me a sign-in link" and enter this email address.</p>
</div></body></html>`
  const text = `Hi ${opts.name || 'there'},\n\n${opts.intro}\n\nOpen ampOS: ${opts.link}\n\nThe link works once and for a limited time. After that, open ampOS, choose "Email me a sign-in link" and enter this email address.`
  const res = await sendEmail({
    from: buildFromHeader(DEFAULT_FROM_EMAIL),
    to: opts.to,
    subject: opts.subject,
    html,
    text,
  })
  if (!res.ok) console.error('subcontractor link email failed', res.status, res.body)
  return res.ok
}

export { COMPANY_NAME }
