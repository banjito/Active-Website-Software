import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

console.log("requisition-approval-notification: function loaded")

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

    const { requisitionId, approverUserId, stepNumber, totalSteps, action } = body
    if (!requisitionId || !approverUserId) {
      return new Response(JSON.stringify({ error: 'requisitionId and approverUserId required' }), { headers, status: 400 })
    }

    const restHeaders = {
      'Authorization': `Bearer ${key}`,
      'apikey': key,
      'Accept': 'application/json',
      'Accept-Profile': 'common'
    }

    // 1. Get the requisition details
    const reqRes = await fetch(
      `${url}/rest/v1/job_requisitions?id=eq.${requisitionId}&select=id,title,department,location,employment_type,priority`,
      { headers: restHeaders }
    )
    const reqData = await reqRes.json()
    const requisition = Array.isArray(reqData) ? reqData[0] : null
    if (!requisition) {
      return new Response(JSON.stringify({ error: 'requisition not found' }), { headers, status: 404 })
    }
    console.log("Requisition:", requisition.title)

    // 2. Get the approver's email
    let approverEmail = ''
    let approverName = 'there'
    try {
      const userRes = await fetch(`${url}/auth/v1/admin/users/${approverUserId}`, {
        headers: { 'Authorization': `Bearer ${key}`, 'apikey': key }
      })
      if (userRes.ok) {
        const userData = await userRes.json()
        approverEmail = userData?.email || ''
        approverName = userData?.user_metadata?.name || userData?.email?.split('@')[0] || 'there'
      }
    } catch { /* skip */ }

    if (!approverEmail) {
      return new Response(JSON.stringify({ emailSent: false, message: 'no approver email found' }), { headers })
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
    const approvalLink = appUrl ? `${appUrl}/hr/recruiting/requisition-approvals` : ''
    const safeTitle = (requisition.title || '').replace(/</g, '&lt;')

    let emailSubject: string
    let heading: string
    let bodyText: string

    if (action === 'submitted') {
      emailSubject = `Requisition awaiting your approval: ${requisition.title}`
      heading = 'Requisition Approval Required'
      bodyText = `Hi ${approverName},<br><br>A job requisition has been submitted and requires your approval. You are approver <strong>${stepNumber} of ${totalSteps}</strong> in the approval chain.`
    } else if (action === 'advanced') {
      emailSubject = `Requisition ready for your review: ${requisition.title}`
      heading = 'Your Turn to Approve'
      bodyText = `Hi ${approverName},<br><br>The previous approver has approved this requisition and it's now your turn to review. You are approver <strong>${stepNumber} of ${totalSteps}</strong>.`
    } else {
      emailSubject = `Requisition approval notification: ${requisition.title}`
      heading = 'Requisition Approval Update'
      bodyText = `Hi ${approverName},<br><br>A requisition requires your attention.`
    }

    const priorityColor = requisition.priority === 'high' ? '#dc2626' : requisition.priority === 'medium' ? '#d97706' : '#6b7280'

    const detailRows = `
      <tr><td style="padding:12px;border-bottom:1px solid #eee;font-weight:bold;background:#f8f9fa;width:140px">Title</td><td style="padding:12px;border-bottom:1px solid #eee">${safeTitle}</td></tr>
      <tr><td style="padding:12px;border-bottom:1px solid #eee;font-weight:bold;background:#f8f9fa">Department</td><td style="padding:12px;border-bottom:1px solid #eee">${requisition.department || 'N/A'}</td></tr>
      <tr><td style="padding:12px;border-bottom:1px solid #eee;font-weight:bold;background:#f8f9fa">Location</td><td style="padding:12px;border-bottom:1px solid #eee">${requisition.location || 'N/A'}</td></tr>
      <tr><td style="padding:12px;border-bottom:1px solid #eee;font-weight:bold;background:#f8f9fa">Type</td><td style="padding:12px;border-bottom:1px solid #eee">${requisition.employment_type || 'N/A'}</td></tr>
      <tr><td style="padding:12px;font-weight:bold;background:#f8f9fa">Priority</td><td style="padding:12px"><span style="color:${priorityColor};font-weight:bold">${(requisition.priority || 'medium').charAt(0).toUpperCase() + (requisition.priority || 'medium').slice(1)}</span></td></tr>
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
                Review Requisition
              </a>
            </div>
            <p style="text-align:center;margin-top:12px;font-size:12px;color:#888">
              HR Portal → Recruiting → Requisition Approvals
            </p>
          ` : ''}
        </div>
        <div style="padding:20px;text-align:center;color:#666;font-size:14px;border-top:1px solid #eee">
          <p style="margin:0">Automated notification from AMP Quality Energy Services</p>
        </div>
      </div>
    `

    const textBody = `${heading}\n\n${bodyText.replace(/<br>/g, '\n').replace(/<[^>]+>/g, '')}\n\nTitle: ${requisition.title}\nDepartment: ${requisition.department}\nLocation: ${requisition.location}\nPriority: ${requisition.priority}\n\nStep ${stepNumber} of ${totalSteps}\n${approvalLink ? '\nReview: ' + approvalLink : ''}\n\nAutomated notification from AMP Quality Energy Services`

    // 4. Send the email
    console.log("Sending approval notification to:", approverEmail)
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
