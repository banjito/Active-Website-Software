import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

console.log("offer-approval-notification: function loaded")

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

    const { offerId, approverUserId, stepNumber, totalSteps, action } = body
    if (!offerId || !approverUserId) {
      return new Response(JSON.stringify({ error: 'offerId and approverUserId required' }), { headers, status: 400 })
    }

    const restHeaders = {
      'Authorization': `Bearer ${key}`,
      'apikey': key,
      'Accept': 'application/json',
      'Accept-Profile': 'common'
    }

    // 1. Get the offer + candidate details
    const offerRes = await fetch(
      `${url}/rest/v1/offers?id=eq.${offerId}&select=id,position_title,department,employment_type,base_salary,pay_frequency,salary_currency,expiration_date,candidate_id,start_date`,
      { headers: restHeaders }
    )
    const offerRawText = await offerRes.text()
    console.log("Offer fetch status:", offerRes.status)
    let offerData: any = null
    try { offerData = JSON.parse(offerRawText) } catch { /* ignore */ }
    const offer = Array.isArray(offerData) ? offerData[0] : null
    if (!offer) {
      console.warn("Offer lookup returned no row. Body was:", offerRawText.slice(0, 400))
      return new Response(JSON.stringify({ error: 'offer not found', status: offerRes.status, body: offerRawText.slice(0, 400) }), { headers, status: 404 })
    }
    console.log("Offer:", offer.position_title)

    let candidateName = 'Candidate'
    if (offer.candidate_id) {
      const candRes = await fetch(
        `${url}/rest/v1/candidates?id=eq.${offer.candidate_id}&select=first_name,last_name`,
        { headers: restHeaders }
      )
      const candData = await candRes.json()
      const cand = Array.isArray(candData) ? candData[0] : null
      if (cand) candidateName = `${cand.first_name || ''} ${cand.last_name || ''}`.trim() || candidateName
    }

    // 2. Get the approver's email (try auth.admin first, fall back to profiles)
    let approverEmail = ''
    let approverName = 'there'
    try {
      const userRes = await fetch(`${url}/auth/v1/admin/users/${approverUserId}`, {
        headers: { 'Authorization': `Bearer ${key}`, 'apikey': key }
      })
      const userText = await userRes.text()
      console.log("Auth admin user lookup:", userRes.status, userText.slice(0, 300))
      if (userRes.ok) {
        const userData = JSON.parse(userText)
        approverEmail = userData?.email || ''
        approverName = userData?.user_metadata?.name
          || userData?.user_metadata?.full_name
          || userData?.email?.split('@')[0]
          || 'there'
      }
    } catch (lookupErr) {
      console.warn("Auth admin lookup threw:", lookupErr)
    }

    // Fallback: common.profiles table (some projects use that instead)
    if (!approverEmail) {
      try {
        const profRes = await fetch(
          `${url}/rest/v1/profiles?id=eq.${approverUserId}&select=email,full_name,name`,
          { headers: restHeaders }
        )
        const profText = await profRes.text()
        console.log("profiles fallback:", profRes.status, profText.slice(0, 200))
        if (profRes.ok) {
          const profs = JSON.parse(profText)
          const prof = Array.isArray(profs) ? profs[0] : null
          if (prof?.email) {
            approverEmail = prof.email
            approverName = prof.full_name || prof.name || prof.email.split('@')[0]
          }
        }
      } catch (profErr) {
        console.warn("profiles fallback threw:", profErr)
      }
    }

    if (!approverEmail) {
      console.warn("No email found for approverUserId:", approverUserId)
      return new Response(JSON.stringify({ emailSent: false, message: 'no approver email found', approverUserId }), { headers })
    }
    console.log("Approver:", approverName, approverEmail)

    // 3. Build the email
    const pmKey = Deno.env.get('POSTMARK_API_KEY')
    if (!pmKey) {
      return new Response(JSON.stringify({ emailSent: false, message: 'no POSTMARK_API_KEY' }), { headers })
    }

    const from = (Deno.env.get('POSTMARK_FROM') ?? 'john.chambers@ampqes.com').trim()
    const fromHeader = from.includes('<') ? from : `AMP System <${from}>`
    const appUrl = (Deno.env.get('APP_URL') || Deno.env.get('SITE_URL') || '').replace(/\/$/, '')
    const approvalLink = appUrl ? `${appUrl}/hr/offers/approvals` : ''

    const safeTitle = (offer.position_title || '').replace(/</g, '&lt;')
    const safeCandidate = candidateName.replace(/</g, '&lt;')

    let emailSubject: string
    let heading: string
    let bodyText: string

    if (action === 'submitted') {
      emailSubject = `Offer letter awaiting your approval: ${candidateName} - ${offer.position_title}`
      heading = 'Offer Letter Approval Required'
      bodyText = `Hi ${approverName},<br><br>An offer letter for <strong>${safeCandidate}</strong> has been submitted and requires your approval. You are approver <strong>${stepNumber} of ${totalSteps}</strong> in the approval chain.`
    } else if (action === 'advanced') {
      emailSubject = `Offer letter ready for your review: ${candidateName} - ${offer.position_title}`
      heading = 'Your Turn to Approve'
      bodyText = `Hi ${approverName},<br><br>The previous approver has approved the offer letter for <strong>${safeCandidate}</strong> and it's now your turn to review. You are approver <strong>${stepNumber} of ${totalSteps}</strong>.`
    } else {
      emailSubject = `Offer letter approval notification: ${candidateName}`
      heading = 'Offer Letter Approval Update'
      bodyText = `Hi ${approverName},<br><br>An offer letter requires your attention.`
    }

    const salaryDisplay = offer.base_salary
      ? `${(offer.salary_currency || 'USD')} ${Number(offer.base_salary).toLocaleString()}${offer.pay_frequency ? ' / ' + offer.pay_frequency : ''}`
      : 'N/A'
    const expirationDisplay = offer.expiration_date
      ? new Date(offer.expiration_date).toLocaleDateString()
      : 'N/A'
    const startDateDisplay = offer.start_date
      ? new Date(offer.start_date).toLocaleDateString()
      : 'TBD'

    const detailRows = `
      <tr><td style="padding:12px;border-bottom:1px solid #eee;font-weight:bold;background:#f8f9fa;width:160px">Candidate</td><td style="padding:12px;border-bottom:1px solid #eee">${safeCandidate}</td></tr>
      <tr><td style="padding:12px;border-bottom:1px solid #eee;font-weight:bold;background:#f8f9fa">Position</td><td style="padding:12px;border-bottom:1px solid #eee">${safeTitle}</td></tr>
      <tr><td style="padding:12px;border-bottom:1px solid #eee;font-weight:bold;background:#f8f9fa">Department</td><td style="padding:12px;border-bottom:1px solid #eee">${offer.department || 'N/A'}</td></tr>
      <tr><td style="padding:12px;border-bottom:1px solid #eee;font-weight:bold;background:#f8f9fa">Employment Type</td><td style="padding:12px;border-bottom:1px solid #eee">${offer.employment_type || 'N/A'}</td></tr>
      <tr><td style="padding:12px;border-bottom:1px solid #eee;font-weight:bold;background:#f8f9fa">Base Salary</td><td style="padding:12px;border-bottom:1px solid #eee">${salaryDisplay}</td></tr>
      <tr><td style="padding:12px;border-bottom:1px solid #eee;font-weight:bold;background:#f8f9fa">Start Date</td><td style="padding:12px;border-bottom:1px solid #eee">${startDateDisplay}</td></tr>
      <tr><td style="padding:12px;font-weight:bold;background:#f8f9fa">Offer Expires</td><td style="padding:12px">${expirationDisplay}</td></tr>
    `

    const htmlBody = `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">
        <div style="background:#f26722;color:#fff;padding:20px;text-align:center">
          <h1 style="margin:0;font-size:24px">${heading}</h1>
        </div>
        <div style="padding:20px;background:#f9f9f9">
          <p style="font-size:15px;line-height:1.6">${bodyText}</p>
          <table style="width:100%;border-collapse:collapse;background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 2px 4px rgba(0,0,0,.1);margin:16px 0">
            ${detailRows}
          </table>
          <div style="margin:8px 0 0;padding:12px 16px;background:#fff8f0;border-left:4px solid #f26722;border-radius:4px">
            <p style="margin:0;font-size:13px;color:#92400e">
              <strong>Step ${stepNumber} of ${totalSteps}</strong> — ${totalSteps - (stepNumber as number) > 0 ? `${totalSteps - (stepNumber as number)} more approver${totalSteps - (stepNumber as number) > 1 ? 's' : ''} after you` : 'You are the final approver'}
            </p>
          </div>
          ${approvalLink ? `
            <div style="margin-top:20px;text-align:center">
              <a href="${approvalLink}" style="background:#f26722;color:#fff;padding:14px 28px;text-decoration:none;border-radius:6px;display:inline-block;font-weight:bold;font-size:15px">
                Review Offer Letter
              </a>
            </div>
            <p style="text-align:center;margin-top:12px;font-size:12px;color:#888">
              HR Portal → Offers → Offer Approvals
            </p>
          ` : ''}
        </div>
        <div style="padding:20px;text-align:center;color:#666;font-size:14px;border-top:1px solid #eee">
          <p style="margin:0">Automated notification from AMP Quality Energy Services</p>
        </div>
      </div>
    `

    const textBody = `${heading}\n\n${bodyText.replace(/<br>/g, '\n').replace(/<[^>]+>/g, '')}\n\nCandidate: ${candidateName}\nPosition: ${offer.position_title}\nDepartment: ${offer.department}\nBase Salary: ${salaryDisplay}\nStart Date: ${startDateDisplay}\nOffer Expires: ${expirationDisplay}\n\nStep ${stepNumber} of ${totalSteps}\n${approvalLink ? '\nReview: ' + approvalLink : ''}\n\nAutomated notification from AMP Quality Energy Services`

    // 4. Send the email
    console.log("Sending offer approval notification to:", approverEmail)
    const pmRes = await fetch('https://api.postmarkapp.com/email', {
      method: 'POST',
      headers: { 'Accept': 'application/json', 'Content-Type': 'application/json', 'X-Postmark-Server-Token': pmKey },
      body: JSON.stringify({
        From: fromHeader,
        To: approverEmail,
        Subject: emailSubject,
        HtmlBody: htmlBody,
        TextBody: textBody,
        MessageStream: 'outbound'
      })
    })
    const pmText = await pmRes.text()
    console.log("Postmark response:", pmRes.status, pmText)

    return new Response(JSON.stringify({ emailSent: pmRes.ok, sentTo: approverEmail }), { headers })
  } catch (e) {
    console.error("ERROR:", e)
    const msg = e instanceof Error ? e.message : String(e)
    return new Response(JSON.stringify({ error: msg }), { headers, status: 500 })
  }
})
