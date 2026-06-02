import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import {
  getAccountingDigestEmail,
  getDigestRecipientEmails,
} from '../_shared/digestRecipients.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    if (!supabaseUrl) throw new Error('SUPABASE_URL is not set')

    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    if (!supabaseServiceKey) throw new Error('SUPABASE_SERVICE_ROLE_KEY is not set')

    // @ts-ignore deno: remote module types resolved at runtime
    const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2?target=deno')
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    console.log('Fetching ready-to-bill jobs for daily report...')

    // Fetch all jobs with ready_to_bill status
    const { data: jobs, error: jobsError } = await supabase
      .schema('neta_ops')
      .from('jobs')
      .select('id, title, job_number, customer_id, fireteam_lead, created_at, updated_at')
      .eq('status', 'ready_to_bill')
      .order('updated_at', { ascending: false })

    if (jobsError) throw jobsError

    // If no ready-to-bill jobs, send a "no jobs" email
    if (!jobs || jobs.length === 0) {
      console.log('No ready-to-bill jobs found')
      
      const postmarkApiKey = Deno.env.get('POSTMARK_API_KEY')
      if (!postmarkApiKey) {
        return new Response(
          JSON.stringify({
            success: true,
            message: 'No jobs to report and POSTMARK_API_KEY not configured',
            jobCount: 0,
            emailSent: false
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
        )
      }

      const recipientEmails = await getDigestRecipientEmails(supabase, 'dailyReadyToBill', {
        alwaysInclude: [getAccountingDigestEmail()],
      })
      if (recipientEmails.length === 0) {
        return new Response(
          JSON.stringify({
            success: true,
            message: 'No digest subscribers for daily ready-to-bill',
            jobCount: 0,
            emailSent: false,
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
        )
      }

      const fromEmail = (Deno.env.get('POSTMARK_FROM') ?? 'john.chambers@ampqes.com').trim()
      const fromHeader = fromEmail.includes('<') ? fromEmail : `AMP System <${fromEmail}>`
      const toEmail = recipientEmails.join(', ')

      const emailSubject = 'Daily Ready-to-Bill Report - No Jobs'
      const emailHtml = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background-color: #f26722; color: white; padding: 20px; text-align: center;">
            <h1 style="margin: 0; font-size: 24px;">Daily Ready-to-Bill Report</h1>
          </div>
          
          <div style="padding: 20px; background-color: #f9f9f9;">
            <div style="padding: 20px; background-color: #e8f4f8; border-left: 4px solid #17a2b8; border-radius: 4px; text-align: center;">
              <p style="margin: 0; color: #0c5460; font-size: 16px;">✅ No jobs are currently ready for billing</p>
            </div>
          </div>
          
          <div style="padding: 20px; text-align: center; color: #666; font-size: 14px; border-top: 1px solid #eee;">
            <p style="margin: 0;">Daily Ready-to-Bill Report from AMP Quality Energy Services</p>
            <p style="margin: 5px 0 0 0;">Generated on ${new Date().toLocaleString()}</p>
          </div>
        </div>
      `

      const emailText = `
Daily Ready-to-Bill Report

No jobs are currently ready for billing.

Generated on ${new Date().toLocaleString()}
      `

      await fetch('https://api.postmarkapp.com/email', {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
          'X-Postmark-Server-Token': postmarkApiKey
        },
        body: JSON.stringify({
          From: fromHeader,
          To: toEmail,
          Subject: emailSubject,
          HtmlBody: emailHtml,
          TextBody: emailText,
          MessageStream: 'outbound'
        })
      })

      return new Response(
        JSON.stringify({
          success: true,
          message: 'No jobs ready for billing',
          jobCount: 0,
          emailSent: true
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      )
    }

    // Fetch customer information for all jobs
    const customerIds = [...new Set(jobs.map(j => j.customer_id).filter(Boolean))]
    const customersMap = new Map()

    if (customerIds.length > 0) {
      const { data: customers, error: customersError } = await supabase
        .schema('common')
        .from('customers')
        .select('id, name, company_name')
        .in('id', customerIds)

      if (!customersError && customers) {
        customers.forEach(c => customersMap.set(c.id, c))
      }
    }

    // Build job list for email
    const jobRows = jobs.map(job => {
      const customer = customersMap.get(job.customer_id)
      const customerName = customer?.company_name || customer?.name || 'Unknown Customer'
      const jobNumber = job.job_number || job.id.substring(0, 8)
      const jobTitle = job.title || 'Untitled Job'
      const fireteamLead = job.fireteam_lead || 'Not assigned'
      const updatedDate = new Date(job.updated_at).toLocaleDateString()

      return {
        jobNumber,
        jobTitle,
        customerName,
        fireteamLead,
        updatedDate,
        jobId: job.id
      }
    })

    // Email content
    const emailSubject = `Daily Ready-to-Bill Report - ${jobs.length} Job${jobs.length !== 1 ? 's' : ''}`
    
    const jobRowsHtml = jobRows.map((job, index) => `
      <tr style="${index % 2 === 0 ? 'background-color: #f9f9f9;' : 'background-color: white;'}">
        <td style="padding: 12px; border-bottom: 1px solid #ddd;">${job.jobNumber}</td>
        <td style="padding: 12px; border-bottom: 1px solid #ddd;">${job.jobTitle}</td>
        <td style="padding: 12px; border-bottom: 1px solid #ddd;">${job.customerName}</td>
        <td style="padding: 12px; border-bottom: 1px solid #ddd;">${job.fireteamLead}</td>
        <td style="padding: 12px; border-bottom: 1px solid #ddd;">${job.updatedDate}</td>
        <td style="padding: 12px; border-bottom: 1px solid #ddd;">
          <a href="${supabaseUrl.replace('/rest/v1', '')}/jobs/${job.jobId}" 
             style="color: #f26722; text-decoration: none; font-weight: 500;">View</a>
        </td>
      </tr>
    `).join('')

    const emailHtml = `
      <div style="font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto;">
        <div style="background-color: #f26722; color: white; padding: 20px; text-align: center;">
          <h1 style="margin: 0; font-size: 24px;">Daily Ready-to-Bill Report</h1>
          <p style="margin: 10px 0 0 0; font-size: 16px;">${jobs.length} Job${jobs.length !== 1 ? 's' : ''} Ready for Billing</p>
        </div>
        
        <div style="padding: 20px; background-color: #f9f9f9;">
          <div style="margin-bottom: 20px; padding: 15px; background-color: #fff3cd; border-left: 4px solid #ffc107; border-radius: 4px;">
            <p style="margin: 0; color: #856404;">
              <strong>Action Required:</strong> The following ${jobs.length} job${jobs.length !== 1 ? 's are' : ' is'} ready for billing and invoicing.
            </p>
          </div>

          <div style="overflow-x: auto;">
            <table style="width: 100%; border-collapse: collapse; background-color: white; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
              <thead>
                <tr style="background-color: #f26722; color: white;">
                  <th style="padding: 12px; text-align: left; font-weight: bold;">Job Number</th>
                  <th style="padding: 12px; text-align: left; font-weight: bold;">Title</th>
                  <th style="padding: 12px; text-align: left; font-weight: bold;">Customer</th>
                  <th style="padding: 12px; text-align: left; font-weight: bold;">Fireteam Lead</th>
                  <th style="padding: 12px; text-align: left; font-weight: bold;">Updated</th>
                  <th style="padding: 12px; text-align: left; font-weight: bold;">Action</th>
                </tr>
              </thead>
              <tbody>
                ${jobRowsHtml}
              </tbody>
            </table>
          </div>
        </div>
        
        <div style="padding: 20px; text-align: center; color: #666; font-size: 14px; border-top: 1px solid #eee;">
          <p style="margin: 0;">Daily Ready-to-Bill Report from AMP Quality Energy Services</p>
          <p style="margin: 5px 0 0 0;">Generated on ${new Date().toLocaleString()}</p>
        </div>
      </div>
    `

    const jobRowsText = jobRows.map(job => 
      `- ${job.jobNumber} | ${job.jobTitle} | ${job.customerName} | ${job.fireteamLead} | Updated: ${job.updatedDate}`
    ).join('\n')

    const emailText = `
Daily Ready-to-Bill Report
${jobs.length} Job${jobs.length !== 1 ? 's' : ''} Ready for Billing

Action Required: The following ${jobs.length} job${jobs.length !== 1 ? 's are' : ' is'} ready for billing and invoicing.

${jobRowsText}

Generated on ${new Date().toLocaleString()}
    `

    // Send via Postmark
    const postmarkApiKey = Deno.env.get('POSTMARK_API_KEY')
    if (!postmarkApiKey) {
      return new Response(
        JSON.stringify({
          success: true,
          message: 'Email not sent: POSTMARK_API_KEY not configured',
          jobCount: jobs.length,
          emailSent: false
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      )
    }

    const recipientEmails = await getDigestRecipientEmails(supabase, 'dailyReadyToBill', {
      alwaysInclude: [getAccountingDigestEmail()],
    })
    if (recipientEmails.length === 0) {
      return new Response(
        JSON.stringify({
          success: true,
          message: 'No digest subscribers for daily ready-to-bill',
          jobCount: jobs.length,
          emailSent: false,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      )
    }

    const fromEmail = (Deno.env.get('POSTMARK_FROM') ?? 'john.chambers@ampqes.com').trim()
    const fromHeader = fromEmail.includes('<') ? fromEmail : `AMP System <${fromEmail}>`
    const toEmail = recipientEmails.join(', ')

    const pmRes = await fetch('https://api.postmarkapp.com/email', {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'X-Postmark-Server-Token': postmarkApiKey
      },
      body: JSON.stringify({
        From: fromHeader,
        To: toEmail,
        Subject: emailSubject,
        HtmlBody: emailHtml,
        TextBody: emailText,
        MessageStream: 'outbound'
      })
    })

    if (!pmRes.ok) {
      const errText = await pmRes.text()
      throw new Error(`Postmark API failed: ${pmRes.status} - ${errText}`)
    }

    console.log(`Daily ready-to-bill report sent successfully: ${jobs.length} jobs`)

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Daily ready-to-bill report sent successfully',
        jobCount: jobs.length,
        emailSent: true,
        sentTo: toEmail
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    )

  } catch (error: unknown) {
    console.error('Error in daily ready-to-bill report:', error)
    const message = error instanceof Error ? error.message : String(error)
    return new Response(
      JSON.stringify({ success: false, error: message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    )
  }
})

