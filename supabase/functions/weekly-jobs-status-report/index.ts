// Weekly Jobs Status Report Email
// Sends a report of all jobs that are In-Progress or Ready for Billing
// Scheduled to run every Monday at 8:00 AM CST

// @ts-ignore deno: remote module types resolved at runtime
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { getDigestRecipientEmails } from '../_shared/digestRecipients.ts'
import { BRAND_COLOR, COMPANY_FULL_NAME, COMPANY_NAME, DEFAULT_FROM_EMAIL } from '../_shared/companyConfig.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface JobData {
  id: string;
  job_number: string;
  title: string;
  status: string;
  customer_id: string;
  fireteam_lead: string | null;
  created_at: string;
  updated_at: string;
  customer_name?: string;
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

    console.log('Starting weekly jobs status report...')

    // Fetch active jobs (in_progress and ready_to_bill) - no date limit
    const { data: activeJobsData, error: activeJobsError } = await supabase
      .schema('neta_ops')
      .from('jobs')
      .select('id, job_number, title, status, customer_id, fireteam_lead, created_at, updated_at')
      .in('status', ['in_progress', 'ready_to_bill'])
      .order('status', { ascending: true })
      .order('job_number', { ascending: true })

    if (activeJobsError) throw activeJobsError
    const jobsData = activeJobsData || []

    if (jobsData.length === 0) {
      return new Response(
        JSON.stringify({
          success: true,
          message: 'No jobs found with specified statuses',
          jobCount: 0,
          emailSent: false
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      )
    }

    console.log(`Found ${jobsData.length} jobs with specified statuses`)

    // Get customer information
    const customerIds = [...new Set(jobsData.map(j => j.customer_id).filter(Boolean))]
    const { data: customersData, error: customersError } = await supabase
      .schema('common')
      .from('customers')
      .select('id, name, company_name')
      .in('id', customerIds)

    if (customersError) throw customersError

    // Build customer lookup map
    const customerMap = new Map(customersData?.map(c => [c.id, c]) || [])

    // Enrich job data with customer info
    const enrichedJobs: JobData[] = jobsData.map(job => {
      const customer = customerMap.get(job.customer_id)
      return {
        ...job,
        customer_name: customer?.company_name || customer?.name || 'N/A'
      }
    })

    // Group jobs by status
    const inProgressJobs = enrichedJobs.filter(j => j.status === 'in_progress')
    const readyToBillJobs = enrichedJobs.filter(j => j.status === 'ready_to_bill')
    const activeJobCount = inProgressJobs.length + readyToBillJobs.length
    const emailSubject = `Weekly Jobs Status Report - ${activeJobCount} Active Jobs`

    const renderJobList = (jobs: JobData[], statusLabel: string, statusColor: string) => {
      if (jobs.length === 0) {
        return `<p style="color: #666; font-style: italic;">No jobs in this status</p>`
      }
      return jobs.map(job => `
        <div class="job-item">
          <div class="job-header">
            <span class="status-badge" style="background-color: ${statusColor};">${statusLabel}</span>
            <span style="font-weight: bold;">${job.job_number}</span>
          </div>
          <div class="job-detail"><strong>Title:</strong> ${job.title}</div>
          <div class="job-detail"><strong>Customer:</strong> ${job.customer_name}</div>
          <div class="job-detail"><strong>Fireteam Lead:</strong> ${job.fireteam_lead || 'Not assigned'}</div>
          <div class="job-detail"><strong>Last Updated:</strong> ${new Date(job.updated_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</div>
        </div>
      `).join('')
    }

    const emailHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 900px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, ${BRAND_COLOR} 0%, #e55611 100%); color: white; padding: 30px; border-radius: 8px 8px 0 0; }
          .content { background: white; padding: 30px; border: 1px solid #ddd; border-top: none; }
          .summary { background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0; }
          .summary-stat { display: inline-block; margin: 10px 20px 10px 0; }
          .summary-label { font-size: 14px; color: #666; }
          .summary-value { font-size: 28px; font-weight: bold; color: ${BRAND_COLOR}; }
          .status-section { margin: 30px 0; }
          .status-section-title { font-size: 20px; font-weight: bold; color: #333; margin-bottom: 15px; padding-bottom: 10px; border-bottom: 2px solid ${BRAND_COLOR}; }
          .job-item { background: white; border: 1px solid #e0e0e0; padding: 15px; margin: 10px 0; border-radius: 6px; }
          .job-header { display: flex; align-items: center; margin-bottom: 10px; }
          .status-badge { padding: 4px 12px; border-radius: 12px; color: white; font-size: 12px; font-weight: bold; margin-right: 10px; }
          .job-detail { font-size: 14px; color: #555; margin: 4px 0; }
          .footer { text-align: center; color: #777; font-size: 12px; margin-top: 30px; padding-top: 20px; border-top: 1px solid #ddd; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1 style="margin: 0;">📊 Weekly Jobs Status Report</h1>
            <p style="margin: 10px 0 0 0; opacity: 0.9;">Week ending ${new Date().toLocaleDateString()}</p>
          </div>
          <div class="content">
            <div class="summary">
              <div class="summary-stat">
                <div class="summary-label">Active Jobs</div>
                <div class="summary-value">${inProgressJobs.length + readyToBillJobs.length}</div>
              </div>
              <div class="summary-stat">
                <div class="summary-label">In Progress</div>
                <div class="summary-value" style="color: #2196F3;">${inProgressJobs.length}</div>
              </div>
              <div class="summary-stat">
                <div class="summary-label">Ready to Bill</div>
                <div class="summary-value" style="color: #FF9800;">${readyToBillJobs.length}</div>
              </div>
            </div>

            <div class="status-section">
              <div class="status-section-title">🔨 In Progress (${inProgressJobs.length})</div>
              ${renderJobList(inProgressJobs, 'IN PROGRESS', '#2196F3')}
            </div>

            <div class="status-section">
              <div class="status-section-title">💰 Ready for Billing (${readyToBillJobs.length})</div>
              ${renderJobList(readyToBillJobs, 'READY TO BILL', '#FF9800')}
            </div>
          </div>
          <div class="footer">
            <p>This is an automated weekly report from ${COMPANY_FULL_NAME}</p>
            <p>Generated on ${new Date().toLocaleString()}</p>
          </div>
        </div>
      </body>
      </html>
    `

    const renderJobListText = (jobs: JobData[], statusLabel: string) => {
      if (jobs.length === 0) {
        return 'No jobs in this status\n'
      }
      return jobs.map(job => `
  ${job.job_number} - ${job.title}
  Customer: ${job.customer_name}
  Fireteam Lead: ${job.fireteam_lead || 'Not assigned'}
  Last Updated: ${new Date(job.updated_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
  ---`).join('\n')
    }

    const emailText = `
Weekly Jobs Status Report
Week ending ${new Date().toLocaleDateString()}

Summary:
- Active Jobs: ${activeJobCount}
- In Progress: ${inProgressJobs.length}
- Ready to Bill: ${readyToBillJobs.length}

IN PROGRESS (${inProgressJobs.length}):
${renderJobListText(inProgressJobs, 'IN PROGRESS')}

READY FOR BILLING (${readyToBillJobs.length}):
${renderJobListText(readyToBillJobs, 'READY TO BILL')}

This is an automated weekly report from ${COMPANY_FULL_NAME}
Generated on ${new Date().toLocaleString()}
    `

    const recipientEmails = await getDigestRecipientEmails(supabase, 'weeklyReports')
    if (recipientEmails.length === 0) {
      console.log('No subscribers for weekly reports digest; skipping email')
      return new Response(
        JSON.stringify({
          success: true,
          message: 'No digest subscribers configured for weekly reports',
          jobCount: enrichedJobs.length,
          emailSent: false
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      )
    }

    const notificationEmail = recipientEmails.join(', ')

    // Send via Postmark
    const postmarkApiKey = Deno.env.get('POSTMARK_API_KEY')
    if (!postmarkApiKey) {
      return new Response(
        JSON.stringify({
          success: true,
          message: 'Email not sent: POSTMARK_API_KEY not configured',
          jobCount: enrichedJobs.length,
          emailSent: false
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      )
    }

    const fromEmail = DEFAULT_FROM_EMAIL
    const fromHeader = fromEmail.includes('<') ? fromEmail : `${COMPANY_NAME} System <${fromEmail}>`

    const pmRes = await fetch('https://api.postmarkapp.com/email', {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'X-Postmark-Server-Token': postmarkApiKey
      },
      body: JSON.stringify({
        From: fromHeader,
        To: notificationEmail,
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

    console.log('Weekly jobs status report sent successfully')

    return new Response(
        JSON.stringify({
          success: true,
          message: 'Weekly jobs status report sent successfully',
          totalJobsInReport: enrichedJobs.length,
          activeJobCount,
          inProgressCount: inProgressJobs.length,
          readyToBillCount: readyToBillJobs.length,
          emailSent: true
        }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    )

  } catch (error: unknown) {
    console.error('Error in weekly jobs status report:', error)
    const message = error instanceof Error ? error.message : String(error)
    return new Response(
      JSON.stringify({ success: false, error: message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    )
  }
})
