import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { BRAND_COLOR, COMPANY_FULL_NAME, COMPANY_HR_EMAIL, DEFAULT_FROM_EMAIL } from '../_shared/companyConfig.ts'
import { buildFromHeader, getEmailApiKey, sendEmail } from '../_shared/email.ts'
import { getTestRecipient } from '../_shared/testSend.ts'

console.log("new-applicant-notification: function loaded")

/**
 * Emails HR when someone applies through the public career page.
 *
 * The career page calls this with the anon key, so anyone could call it. To keep
 * it from being used to spam HR, it only mails about a career-page application
 * created in the last few minutes, never an arbitrary or old candidate.
 */
const FRESH_WINDOW_MS = 15 * 60 * 1000

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' }
    })
  }

  const headers = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' }

  try {
    const url = Deno.env.get('SUPABASE_URL')
    const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    if (!url || !key) throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')

    const { candidateId, testTo: requestedTestTo } = await req.json().catch(() => ({}))
    // Test sends: `testTo` sends to that address only, for any candidate, skipping the
    // freshness check. Without the service role key it throws and nothing is sent.
    const testTo = await getTestRecipient(req, requestedTestTo)
    if (!candidateId) {
      return new Response(JSON.stringify({ error: 'candidateId required' }), { headers, status: 400 })
    }

    const candRes = await fetch(
      `${url}/rest/v1/candidates?id=eq.${encodeURIComponent(candidateId)}&select=id,first_name,last_name,email,phone,location,position_applied,expected_compensation,resume_url,source,created_at`,
      { headers: { 'Authorization': `Bearer ${key}`, 'apikey': key, 'Accept': 'application/json', 'Accept-Profile': 'common' } }
    )
    const candData = await candRes.json()
    const candidate = Array.isArray(candData) ? candData[0] : null
    if (!candidate) {
      console.error("Candidate lookup failed:", candRes.status, JSON.stringify(candData))
      return new Response(JSON.stringify({ error: 'candidate not found' }), { headers, status: 404 })
    }

    const isFresh = Date.now() - new Date(candidate.created_at).getTime() < FRESH_WINDOW_MS
    if (!testTo && (candidate.source !== 'Career Page' || !isFresh)) {
      return new Response(JSON.stringify({ emailSent: false, message: 'not a new career page application' }), { headers })
    }

    if (!getEmailApiKey()) {
      console.error("RESEND_API_KEY is not set on this function - no mail can be sent")
      return new Response(JSON.stringify({ emailSent: false, message: 'no RESEND_API_KEY' }), { headers })
    }

    const escape = (v: unknown) => String(v ?? '').replace(/</g, '&lt;')
    const name = `${candidate.first_name ?? ''} ${candidate.last_name ?? ''}`.trim() || 'Unknown applicant'
    const position = candidate.position_applied || 'Unspecified position'
    const appUrl = (Deno.env.get('APP_URL') || Deno.env.get('SITE_URL') || '').replace(/\/$/, '')
    const candidatesLink = appUrl ? `${appUrl}/hr/recruiting/candidate-tracking` : ''

    const row = (label: string, value: string, last = false) => {
      const border = last ? '' : 'border-bottom:1px solid #eee;'
      return `<tr><td style="padding:12px;${border}font-weight:bold;background:#f8f9fa;width:140px">${label}</td><td style="padding:12px;${border}">${value}</td></tr>`
    }
    const resumeCell = candidate.resume_url ? `<a href="${escape(candidate.resume_url)}">View resume</a>` : 'Not attached'

    const htmlBody = `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">
        <div style="background:${BRAND_COLOR};color:#fff;padding:20px;text-align:center">
          <h1 style="margin:0;font-size:24px">New Applicant</h1>
        </div>
        <div style="padding:20px;background:#f9f9f9">
          <p style="font-size:15px;line-height:1.6"><strong>${escape(name)}</strong> applied for <strong>${escape(position)}</strong> on the career page.</p>
          <table style="width:100%;border-collapse:collapse;background:#fff;margin:16px 0">
            ${row('Email', escape(candidate.email) || 'N/A')}
            ${row('Phone', escape(candidate.phone) || 'N/A')}
            ${row('Location', escape(candidate.location) || 'N/A')}
            ${row('Expected Pay', escape(candidate.expected_compensation) || 'N/A')}
            ${row('Resume', resumeCell, true)}
          </table>
          ${candidatesLink ? `
            <div style="margin-top:20px;text-align:center">
              <a href="${candidatesLink}" style="background:${BRAND_COLOR};color:#fff;padding:14px 28px;text-decoration:none;display:inline-block;font-weight:bold;font-size:15px">
                Review Applicant
              </a>
            </div>
            <p style="text-align:center;margin-top:12px;font-size:12px;color:#888">
              HR Portal &rarr; Recruiting &rarr; Candidate Tracking
            </p>
          ` : ''}
        </div>
        <div style="padding:20px;text-align:center;color:#666;font-size:14px;border-top:1px solid #eee">
          <p style="margin:0">Automated notification from ${COMPANY_FULL_NAME}</p>
        </div>
      </div>
    `

    const textBody = [
      'New Applicant',
      '',
      `${name} applied for ${position} on the career page.`,
      '',
      `Email: ${candidate.email || 'N/A'}`,
      `Phone: ${candidate.phone || 'N/A'}`,
      `Location: ${candidate.location || 'N/A'}`,
      `Expected Pay: ${candidate.expected_compensation || 'N/A'}`,
      candidate.resume_url ? `Resume: ${candidate.resume_url}` : 'Resume: Not attached',
      candidatesLink ? `\nReview Applicant: ${candidatesLink}` : '',
      '',
      `Automated notification from ${COMPANY_FULL_NAME}`
    ].filter(Boolean).join('\n')

    console.log("Sending new applicant notification to:", COMPANY_HR_EMAIL)
    const sendRes = await sendEmail({
      from: buildFromHeader(DEFAULT_FROM_EMAIL),
      to: testTo || COMPANY_HR_EMAIL,
      subject: `${testTo ? '[TEST] ' : ''}New applicant: ${name} for ${position}`,
      html: htmlBody,
      text: textBody
    })
    console.log("Resend response:", sendRes.status, sendRes.body)

    return new Response(
      JSON.stringify({ emailSent: sendRes.ok, sentTo: testTo || COMPANY_HR_EMAIL, providerStatus: sendRes.status, providerBody: sendRes.ok ? undefined : sendRes.body }),
      { headers, status: sendRes.ok ? 200 : 502 }
    )
  } catch (e) {
    console.error("ERROR:", e)
    const msg = e instanceof Error ? e.message : String(e)
    return new Response(JSON.stringify({ error: msg }), { headers, status: 500 })
  }
})
