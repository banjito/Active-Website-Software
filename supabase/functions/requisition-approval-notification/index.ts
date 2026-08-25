import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { BRAND_COLOR, COMPANY_FULL_NAME, COMPANY_HR_EMAIL, DEFAULT_FROM_EMAIL } from '../_shared/companyConfig.ts'
import { buildFromHeader, getEmailApiKey, sendEmail } from '../_shared/email.ts'

console.log("requisition-approval-notification: function loaded")

/**
 * Emails about a job requisition's approval chain.
 *
 * Actions fall into two groups by who gets the mail:
 *   submitted / advanced / reminder -> the approver whose turn it is
 *   approved / rejected             -> whoever raised the requisition
 * HR is copied on all of them so the department keeps visibility even when
 * nobody there sits in the chain.
 */
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

    const body = await req.json().catch(() => ({}))
    console.log("Request body:", JSON.stringify(body))

    const { requisitionId, approverUserId, stepNumber, totalSteps, action, reason, actorUserId } = body
    if (!requisitionId) {
      return new Response(JSON.stringify({ error: 'requisitionId required' }), { headers, status: 400 })
    }

    // Outcome mails go to the requisition's author, so they don't need an approver.
    const isOutcome = action === 'approved' || action === 'rejected'
    if (!isOutcome && !approverUserId) {
      return new Response(JSON.stringify({ error: 'approverUserId required for this action' }), { headers, status: 400 })
    }

    const restHeaders = {
      'Authorization': `Bearer ${key}`,
      'apikey': key,
      'Accept': 'application/json',
      'Accept-Profile': 'common'
    }

    // 1. Get the requisition details
    const reqRes = await fetch(
      `${url}/rest/v1/job_requisitions?id=eq.${requisitionId}&select=id,title,department,location,employment_type,pay_type,salary_range_min,salary_range_max,created_by`,
      { headers: restHeaders }
    )
    const reqData = await reqRes.json()
    const requisition = Array.isArray(reqData) ? reqData[0] : null
    if (!requisition) {
      return new Response(JSON.stringify({ error: 'requisition not found' }), { headers, status: 404 })
    }
    console.log("Requisition:", requisition.title)

    /** Look up one auth user's email and display name. */
    const lookupUser = async (userId: string): Promise<{ email: string; name: string }> => {
      if (!userId) return { email: '', name: 'there' }
      try {
        const userRes = await fetch(`${url}/auth/v1/admin/users/${userId}`, {
          headers: { 'Authorization': `Bearer ${key}`, 'apikey': key }
        })
        if (!userRes.ok) {
          console.warn("Auth lookup failed for", userId, userRes.status, (await userRes.text()).slice(0, 200))
          return { email: '', name: 'there' }
        }
        const userData = await userRes.json()
        return {
          email: userData?.email || '',
          name: userData?.user_metadata?.name || userData?.email?.split('@')[0] || 'there'
        }
      } catch (e) {
        console.warn("Auth lookup threw for", userId, e instanceof Error ? e.message : String(e))
        return { email: '', name: 'there' }
      }
    }

    // 2. Resolve the recipient for this action
    const recipientId = isOutcome ? requisition.created_by : approverUserId
    const { email: recipientEmail, name: recipientName } = await lookupUser(recipientId)
    const actorName = actorUserId ? (await lookupUser(actorUserId)).name : ''

    // HR still wants the mail even when the intended recipient can't be resolved.
    if (!recipientEmail && !COMPANY_HR_EMAIL) {
      return new Response(JSON.stringify({ emailSent: false, message: 'no recipient email found' }), { headers })
    }
    console.log("Recipient:", recipientName, recipientEmail || '(unresolved, HR only)')

    // 3. Build the email
    if (!getEmailApiKey()) {
      console.error("RESEND_API_KEY is not set on this function - no mail can be sent")
      return new Response(JSON.stringify({ emailSent: false, message: 'no RESEND_API_KEY' }), { headers })
    }

    const fromHeader = buildFromHeader(DEFAULT_FROM_EMAIL)
    const appUrl = (Deno.env.get('APP_URL') || Deno.env.get('SITE_URL') || '').replace(/\/$/, '')
    const approvalLink = appUrl ? `${appUrl}/hr/recruiting/requisition-approvals` : ''
    const requisitionLink = appUrl ? `${appUrl}/hr/recruiting/job-requisitions` : ''
    const escape = (v: unknown) => String(v ?? '').replace(/</g, '&lt;')
    const safeTitle = escape(requisition.title)

    const money = (value: unknown, hourly: boolean) => {
      const n = Number(value)
      if (!Number.isFinite(n)) return ''
      return hourly
        ? `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
        : `$${n.toLocaleString('en-US', { maximumFractionDigits: 0 })}`
    }
    const hourly = requisition.pay_type === 'hourly'
    const min = money(requisition.salary_range_min, hourly)
    const max = money(requisition.salary_range_max, hourly)
    const unit = hourly ? '/hr' : '/yr'
    const payRange = min && max ? `${min} - ${max} ${unit}` : min ? `${min}+ ${unit}` : max ? `Up to ${max} ${unit}` : 'Not specified'

    let emailSubject: string
    let heading: string
    let bodyText: string
    let ctaLink = approvalLink
    let ctaLabel = 'Review Requisition'
    let ctaPath = 'HR Portal &rarr; Recruiting &rarr; Requisition Approvals'
    let accent = BRAND_COLOR

    if (action === 'submitted') {
      emailSubject = `Requisition awaiting your approval: ${requisition.title}`
      heading = 'Requisition Approval Required'
      bodyText = `Hi ${recipientName},<br><br>A job requisition has been submitted and requires your approval. You are approver <strong>${stepNumber} of ${totalSteps}</strong> in the approval chain.`
    } else if (action === 'advanced') {
      emailSubject = `Requisition ready for your review: ${requisition.title}`
      heading = 'Your Turn to Approve'
      bodyText = `Hi ${recipientName},<br><br>The previous approver has approved this requisition and it's now your turn to review. You are approver <strong>${stepNumber} of ${totalSteps}</strong>.`
    } else if (action === 'reminder') {
      emailSubject = `Still awaiting your approval: ${requisition.title}`
      heading = 'Approval Still Pending'
      bodyText = `Hi ${recipientName},<br><br>This requisition has been waiting on your approval and has not been actioned yet. You are approver <strong>${stepNumber} of ${totalSteps}</strong>.`
    } else if (action === 'approved') {
      emailSubject = `Requisition approved: ${requisition.title}`
      heading = 'Requisition Approved'
      bodyText = `Hi ${recipientName},<br><br>Your job requisition has cleared every step of its approval chain${actorName ? `, with final approval from <strong>${escape(actorName)}</strong>` : ''}. You can now post it to the career page.`
      ctaLink = requisitionLink
      ctaLabel = 'Open Job Requisitions'
      ctaPath = 'HR Portal &rarr; Recruiting &rarr; Job Requisitions'
      accent = '#16a34a'
    } else if (action === 'rejected') {
      emailSubject = `Requisition rejected: ${requisition.title}`
      heading = 'Requisition Rejected'
      bodyText = `Hi ${recipientName},<br><br>Your job requisition was rejected${actorName ? ` by <strong>${escape(actorName)}</strong>` : ''} and has been closed.`
      ctaLink = requisitionLink
      ctaLabel = 'Open Job Requisitions'
      ctaPath = 'HR Portal &rarr; Recruiting &rarr; Job Requisitions'
      accent = '#dc2626'
    } else {
      emailSubject = `Requisition approval notification: ${requisition.title}`
      heading = 'Requisition Approval Update'
      bodyText = `Hi ${recipientName},<br><br>A requisition requires your attention.`
    }

    const detailRows = `
      <tr><td style="padding:12px;border-bottom:1px solid #eee;font-weight:bold;background:#f8f9fa;width:140px">Title</td><td style="padding:12px;border-bottom:1px solid #eee">${safeTitle}</td></tr>
      <tr><td style="padding:12px;border-bottom:1px solid #eee;font-weight:bold;background:#f8f9fa">Department</td><td style="padding:12px;border-bottom:1px solid #eee">${escape(requisition.department) || 'N/A'}</td></tr>
      <tr><td style="padding:12px;border-bottom:1px solid #eee;font-weight:bold;background:#f8f9fa">Location</td><td style="padding:12px;border-bottom:1px solid #eee">${escape(requisition.location) || 'N/A'}</td></tr>
      <tr><td style="padding:12px;border-bottom:1px solid #eee;font-weight:bold;background:#f8f9fa">Type</td><td style="padding:12px;border-bottom:1px solid #eee">${escape(requisition.employment_type) || 'N/A'}</td></tr>
      <tr><td style="padding:12px;font-weight:bold;background:#f8f9fa">${hourly ? 'Hourly Rate' : 'Salary Range'}</td><td style="padding:12px">${payRange}</td></tr>
    `

    const reasonBlock = action === 'rejected' && reason
      ? `<div style="margin:8px 0 0;padding:12px 16px;background:#fef2f2;border-left:4px solid #dc2626;border-radius:4px">
           <p style="margin:0 0 4px;font-size:13px;font-weight:bold;color:#991b1b">Reason given</p>
           <p style="margin:0;font-size:13px;color:#991b1b">${escape(reason)}</p>
         </div>`
      : ''

    const stepBlock = isOutcome ? '' : `
      <div style="margin:8px 0 0;padding:12px 16px;background:#fff8f0;border-left:4px solid ${BRAND_COLOR};border-radius:4px">
        <p style="margin:0;font-size:13px;color:#92400e">
          <strong>Step ${stepNumber} of ${totalSteps}</strong> &mdash; ${totalSteps - (stepNumber as number) > 0 ? `${totalSteps - (stepNumber as number)} more approver${totalSteps - (stepNumber as number) > 1 ? 's' : ''} after you` : 'You are the final approver'}
        </p>
      </div>`

    const htmlBody = `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">
        <div style="background:${accent};color:#fff;padding:20px;text-align:center">
          <h1 style="margin:0;font-size:24px">${heading}</h1>
        </div>
        <div style="padding:20px;background:#f9f9f9">
          <p style="font-size:15px;line-height:1.6">${bodyText}</p>
          <table style="width:100%;border-collapse:collapse;background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 2px 4px rgba(0,0,0,.1);margin:16px 0">
            ${detailRows}
          </table>
          ${reasonBlock}
          ${stepBlock}
          ${ctaLink ? `
            <div style="margin-top:20px;text-align:center">
              <a href="${ctaLink}" style="background:${accent};color:#fff;padding:14px 28px;text-decoration:none;border-radius:6px;display:inline-block;font-weight:bold;font-size:15px">
                ${ctaLabel}
              </a>
            </div>
            <p style="text-align:center;margin-top:12px;font-size:12px;color:#888">
              ${ctaPath}
            </p>
          ` : ''}
        </div>
        <div style="padding:20px;text-align:center;color:#666;font-size:14px;border-top:1px solid #eee">
          <p style="margin:0">Automated notification from ${COMPANY_FULL_NAME}</p>
        </div>
      </div>
    `

    const textBody = [
      heading,
      '',
      bodyText.replace(/<br>/g, '\n').replace(/<[^>]+>/g, ''),
      '',
      `Title: ${requisition.title}`,
      `Department: ${requisition.department}`,
      `Location: ${requisition.location}`,
      `${hourly ? 'Hourly Rate' : 'Salary Range'}: ${payRange}`,
      isOutcome ? '' : `\nStep ${stepNumber} of ${totalSteps}`,
      action === 'rejected' && reason ? `\nReason: ${reason}` : '',
      ctaLink ? `\n${ctaLabel}: ${ctaLink}` : '',
      '',
      `Automated notification from ${COMPANY_FULL_NAME}`
    ].filter(Boolean).join('\n')

    // 4. Send the email. If the recipient could not be resolved, HR still gets it.
    const primary = recipientEmail || COMPANY_HR_EMAIL
    const copy = recipientEmail ? COMPANY_HR_EMAIL : ''
    console.log("Sending approval notification to:", primary, copy ? `(cc ${copy})` : '')
    const sendRes = await sendEmail({
      from: fromHeader,
      to: primary,
      cc: copy,
      subject: emailSubject,
      html: htmlBody,
      text: textBody
    })
    console.log("Resend response:", sendRes.status, sendRes.body)

    return new Response(
      JSON.stringify({ emailSent: sendRes.ok, sentTo: primary, cc: copy || undefined, providerStatus: sendRes.status, providerBody: sendRes.ok ? undefined : sendRes.body }),
      { headers, status: sendRes.ok ? 200 : 502 }
    )
  } catch (e) {
    console.error("ERROR:", e)
    const msg = e instanceof Error ? e.message : String(e)
    return new Response(JSON.stringify({ error: msg }), { headers, status: 500 })
  }
})
