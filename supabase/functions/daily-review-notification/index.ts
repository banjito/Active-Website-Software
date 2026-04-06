/// <reference lib="dom" />
// @ts-ignore deno: types are resolved at runtime
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
// Local TS linting shim (for non-Deno editors)
declare const Deno: {
  env: { get: (name: string) => string | undefined }
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface JobWithReports {
  id: string;
  job_number: string;
  title: string;
  division: string;
  customer_name?: string;
  company_name?: string;
  reports_count: number;
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

    console.log('Starting daily review notification job...')

    // Fetch assets ready for review
    const { data: assetsData, error: assetsError } = await supabase
      .schema('neta_ops')
      .from('assets')
      .select('id, name, created_at')
      .eq('status', 'ready_for_review')
      .order('created_at', { ascending: true })

    if (assetsError) throw assetsError

    if (!assetsData || assetsData.length === 0) {
      return new Response(
        JSON.stringify({
          success: true,
          message: 'No reports ready for review',
          jobsCount: 0,
          reportsCount: 0
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      )
    }

    console.log(`Found ${assetsData.length} assets ready for review`)

    // Get job links for these assets
    const assetIds = assetsData.map(a => a.id)
    const { data: jobAssetLinks, error: linksError } = await supabase
      .schema('neta_ops')
      .from('job_assets')
      .select('job_id, asset_id')
      .in('asset_id', assetIds)

    if (linksError) throw linksError

    if (!jobAssetLinks || jobAssetLinks.length === 0) {
      return new Response(
        JSON.stringify({
          success: true,
          message: 'No job links found for assets',
          jobsCount: 0,
          reportsCount: 0
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      )
    }

    // Group assets by job id
    const assetsByJob = jobAssetLinks.reduce((acc, link) => {
      if (!acc[link.job_id]) acc[link.job_id] = []
      const asset = assetsData.find(a => a.id === link.asset_id)
      if (asset) acc[link.job_id].push(asset)
      return acc
    }, {} as Record<string, typeof assetsData>)

    const jobIds = Object.keys(assetsByJob)
    console.log(`Found ${jobIds.length} jobs with assets ready for review`)

    if (jobIds.length === 0) {
      return new Response(
        JSON.stringify({
          success: true,
          message: 'No jobs found with assets ready for review',
          jobsCount: 0,
          reportsCount: 0
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      )
    }

    // Fetch job details (only include jobs that are whitelisted for daily emails)
    const { data: jobsData, error: jobsError } = await supabase
      .schema('neta_ops')
      .from('jobs')
      .select('id, title, job_number, division, customer_id, include_in_daily_email')
      .in('id', jobIds)
      .eq('include_in_daily_email', true)

    if (jobsError) throw jobsError
    if (!jobsData) throw new Error('No job data returned')

    // Batch-fetch all customers in one query (avoids N+1)
    const customerIds = [...new Set(jobsData.filter(j => j.customer_id).map(j => j.customer_id))]
    let customerMap: Record<string, { name?: string; company_name?: string }> = {}
    if (customerIds.length > 0) {
      try {
        const { data: customersData } = await supabase
          .schema('common')
          .from('customers')
          .select('id, name, company_name')
          .in('id', customerIds)
        if (customersData) {
          customersData.forEach((c: any) => { customerMap[c.id] = c })
        }
      } catch {
        // ignore customer lookup errors
      }
    }

    const jobsWithReports: JobWithReports[] = jobsData.map((job) => {
      const customerData = job.customer_id ? (customerMap[job.customer_id] || null) : null
      const jobAssets = assetsByJob[job.id] || []
      return {
        id: job.id,
        job_number: job.job_number || 'N/A',
        title: job.title,
        division: job.division,
        customer_name: customerData?.name,
        company_name: customerData?.company_name,
        reports_count: jobAssets.length
      }
    })

    jobsWithReports.sort((a, b) => a.job_number.localeCompare(b.job_number))

    console.log(`Prepared ${jobsWithReports.length} jobs for email notification`)

    // Recipient
    const notificationEmail = Deno.env.get('REVIEW_NOTIFICATION_EMAIL')
    if (!notificationEmail) throw new Error('REVIEW_NOTIFICATION_EMAIL environment variable not set')

    // Email content
    const totalReports = jobsWithReports.reduce((sum, j) => sum + j.reports_count, 0)
    const currentDate = new Date().toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      timeZone: 'America/Chicago'
    })

    const emailSubject = `Daily Review Report - ${jobsWithReports.length} Jobs with ${totalReports} Reports Ready for Review`

    const emailHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Daily Review Report</title>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 800px; margin: 0 auto; padding: 20px; }
    .header { background-color: #f26722; color: white; padding: 20px; border-radius: 8px; margin-bottom: 20px; }
    .summary { background-color: #f8f9fa; padding: 15px; border-radius: 8px; margin-bottom: 20px; }
    .job-item { background-color: white; border: 1px solid #ddd; border-radius: 8px; padding: 15px; margin-bottom: 10px; }
    .job-header { font-weight: bold; color: #f26722; margin-bottom: 5px; }
    .job-details { color: #666; font-size: 14px; }
    .report-count { background-color: #e3f2fd; color: #1976d2; padding: 4px 8px; border-radius: 4px; font-weight: bold; }
    .footer { text-align: center; color: #666; margin-top: 30px; padding-top: 20px; border-top: 1px solid #ddd; }
    .no-reports { text-align: center; color: #666; font-style: italic; padding: 40px; }
  </style>
</head>
<body>
  <div class="header">
    <h1>Daily Review Report</h1>
    <p>${currentDate}</p>
  </div>
  <div class="summary">
    <h2>Summary</h2>
    <p><strong>${jobsWithReports.length}</strong> jobs have reports ready for review</p>
    <p><strong>${totalReports}</strong> total reports awaiting review</p>
  </div>
  <h2>Jobs Requiring Review</h2>
  ${jobsWithReports.length === 0
    ? '<div class="no-reports">No reports are currently ready for review.</div>'
    : jobsWithReports.map(job => `
      <div class="job-item">
        <div class="job-header">Job #${job.job_number} - ${job.title}</div>
        <div class="job-details">
          <div><strong>Division:</strong> ${job.division}</div>
          ${job.company_name ? `<div><strong>Customer:</strong> ${job.company_name}${job.customer_name ? ` (${job.customer_name})` : ''}</div>` : ''}
          <div><strong>Reports Ready:</strong> <span class="report-count">${job.reports_count}</span></div>
        </div>
      </div>
    `).join('')}
  <div class="footer">
    <p>This is an automated daily report generated at 12:00 PM Central Time.</p>
    <p>To review these reports, log in to the AMP system and check the Review Shortcuts on the portal page.</p>
  </div>
</body>
</html>
    `

    const emailText = `
Daily Review Report - ${currentDate}

Summary:
- ${jobsWithReports.length} jobs have reports ready for review
- ${totalReports} total reports awaiting review

${jobsWithReports.length === 0
  ? 'No reports are currently ready for review.'
  : jobsWithReports.map(job =>
`Job #${job.job_number} - ${job.title}
Division: ${job.division}
${job.company_name ? `Customer: ${job.company_name}${job.customer_name ? ` (${job.customer_name})` : ''}` : ''}
Reports Ready: ${job.reports_count}
`).join('\n')
}
Reports Ready: \${job.reports_count}
\`).join('\n')
}

This is an automated daily report generated at 12:00 PM Central Time.
To review these reports, log in to the AMP system and check the Review Shortcuts on the portal page.
    `

    // Send via Postmark (single, reliable path)
    const postmarkApiKey = Deno.env.get('POSTMARK_API_KEY')
    if (!postmarkApiKey) {
      return new Response(
        JSON.stringify({
          success: true,
          message: 'Email not sent: POSTMARK_API_KEY not configured',
          jobsCount: jobsWithReports.length,
          reportsCount: totalReports,
          emailSent: false
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      )
    }

    // Verified sender in Postmark (set POSTMARK_FROM or defaults to your verified address)
    const fromEmail = (Deno.env.get('POSTMARK_FROM') ?? 'john.chambers@ampqes.com').trim()
    const fromHeader = fromEmail.includes('<') ? fromEmail : `AMP System <${fromEmail}>`

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

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Daily review notification sent successfully',
        jobsCount: jobsWithReports.length,
        reportsCount: totalReports,
        emailSent: true
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    )

  } catch (error: unknown) {
    console.error('Error in daily review notification:', error)
    const message = error instanceof Error ? error.message : String(error)
    return new Response(
      JSON.stringify({ success: false, error: message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    )
  }
})