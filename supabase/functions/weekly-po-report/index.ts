// Weekly Purchase Order Report Email
// Sends a report of all POs entered in the past week
// Scheduled to run every Monday at 8:00 AM CST

// @ts-ignore deno: remote module types resolved at runtime
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface POData {
  id: string;
  name: string;
  job_id: string;
  value: number | null;
  uploaded_date: string;
  job_number?: string;
  job_title?: string;
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

    console.log('Initializing Supabase client...')
    
    // @ts-ignore deno: remote module types resolved at runtime
    const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2?target=deno')
    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    })

    console.log('Starting weekly PO report...')

    // Calculate date range (last 7 days)
    const endDate = new Date()
    const startDate = new Date()
    startDate.setDate(startDate.getDate() - 7)

    console.log(`Fetching POs from ${startDate.toISOString()} to ${endDate.toISOString()}`)

    // Fetch POs entered in the past week
    const { data: posData, error: posError } = await supabase
      .schema('neta_ops')
      .from('job_contracts')
      .select('id, name, job_id, value, uploaded_date')
      .eq('type', 'purchase_order')
      .gte('uploaded_date', startDate.toISOString())
      .lte('uploaded_date', endDate.toISOString())
      .order('uploaded_date', { ascending: false })

    if (posError) {
      console.error('Error fetching POs:', posError)
      throw new Error(`Failed to fetch POs: ${posError.message}`)
    }

    if (!posData || posData.length === 0) {
      return new Response(
        JSON.stringify({
          success: true,
          message: 'No POs entered in the past week',
          poCount: 0,
          emailSent: false
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      )
    }

    console.log(`Found ${posData.length} POs entered in the past week`)

    // Get job and customer information for each PO
    const jobIds = [...new Set(posData.map(po => po.job_id))]
    console.log(`Fetching ${jobIds.length} jobs...`)
    
    const { data: jobsData, error: jobsError } = await supabase
      .schema('neta_ops')
      .from('jobs')
      .select('id, job_number, title, customer_id')
      .in('id', jobIds)

    if (jobsError) {
      console.error('Error fetching jobs:', jobsError)
      throw new Error(`Failed to fetch jobs: ${jobsError.message}`)
    }

    // Get customer information
    const customerIds = [...new Set(jobsData?.map(j => j.customer_id).filter(Boolean) || [])]
    console.log(`Fetching ${customerIds.length} customers...`)
    
    const { data: customersData, error: customersError } = await supabase
      .schema('common')
      .from('customers')
      .select('id, name, company_name')
      .in('id', customerIds)

    if (customersError) {
      console.error('Error fetching customers:', customersError)
      throw new Error(`Failed to fetch customers: ${customersError.message}`)
    }

    // Build lookup maps
    const jobMap = new Map(jobsData?.map(j => [j.id, j]) || [])
    const customerMap = new Map(customersData?.map(c => [c.id, c]) || [])

    // Enrich PO data with job and customer info
    const enrichedPOs: POData[] = posData.map(po => {
      const job = jobMap.get(po.job_id)
      const customer = job?.customer_id ? customerMap.get(job.customer_id) : null
      return {
        ...po,
        job_number: job?.job_number || 'N/A',
        job_title: job?.title || 'N/A',
        customer_name: customer?.company_name || customer?.name || 'N/A'
      }
    })

    // Calculate total value
    const totalValue = enrichedPOs.reduce((sum, po) => sum + (po.value || 0), 0)

    // Build email content
    const notificationEmail = Deno.env.get('WEEKLY_REPORT_EMAIL') || Deno.env.get('REVIEW_NOTIFICATION_EMAIL') || 'john.chambers@ampqes.com'
    const emailSubject = `Weekly PO Report - ${enrichedPOs.length} POs Entered (${startDate.toLocaleDateString()} - ${endDate.toLocaleDateString()})`

    const emailHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 800px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #f26722 0%, #e55611 100%); color: white; padding: 30px; border-radius: 8px 8px 0 0; }
          .content { background: white; padding: 30px; border: 1px solid #ddd; border-top: none; }
          .summary { background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0; }
          .summary-stat { display: inline-block; margin: 10px 20px 10px 0; }
          .summary-label { font-size: 14px; color: #666; }
          .summary-value { font-size: 28px; font-weight: bold; color: #f26722; }
          .po-item { background: white; border: 1px solid #e0e0e0; padding: 15px; margin: 10px 0; border-radius: 6px; }
          .po-header { font-weight: bold; color: #f26722; margin-bottom: 8px; }
          .po-detail { font-size: 14px; color: #555; margin: 4px 0; }
          .footer { text-align: center; color: #777; font-size: 12px; margin-top: 30px; padding-top: 20px; border-top: 1px solid #ddd; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1 style="margin: 0;">📋 Weekly Purchase Order Report</h1>
            <p style="margin: 10px 0 0 0; opacity: 0.9;">Week of ${startDate.toLocaleDateString()} - ${endDate.toLocaleDateString()}</p>
          </div>
          <div class="content">
            <div class="summary">
              <div class="summary-stat">
                <div class="summary-label">Total POs Entered</div>
                <div class="summary-value">${enrichedPOs.length}</div>
              </div>
              <div class="summary-stat">
                <div class="summary-label">Total Value</div>
                <div class="summary-value">$${totalValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
              </div>
            </div>

            <h2>Purchase Orders</h2>
            ${enrichedPOs.map(po => `
              <div class="po-item">
                <div class="po-header">${po.name}</div>
                <div class="po-detail"><strong>Job Number:</strong> ${po.job_number}</div>
                <div class="po-detail"><strong>Job Title:</strong> ${po.job_title}</div>
                <div class="po-detail"><strong>Customer:</strong> ${po.customer_name}</div>
                <div class="po-detail"><strong>Value:</strong> $${(po.value || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                <div class="po-detail"><strong>Uploaded:</strong> ${new Date(po.uploaded_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</div>
              </div>
            `).join('')}
          </div>
          <div class="footer">
            <p>This is an automated weekly report from AMP Quality Energy Services</p>
            <p>Generated on ${new Date().toLocaleString()}</p>
          </div>
        </div>
      </body>
      </html>
    `

    const emailText = `
Weekly Purchase Order Report
Week of ${startDate.toLocaleDateString()} - ${endDate.toLocaleDateString()}

Summary:
- Total POs Entered: ${enrichedPOs.length}
- Total Value: $${totalValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}

Purchase Orders:

${enrichedPOs.map(po => `
${po.name}
Job Number: ${po.job_number}
Job Title: ${po.job_title}
Customer: ${po.customer_name}
Value: $${(po.value || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
Uploaded: ${new Date(po.uploaded_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
---
`).join('\n')}

This is an automated weekly report from AMP Quality Energy Services
Generated on ${new Date().toLocaleString()}
    `

    // Send via Postmark
    const postmarkApiKey = Deno.env.get('POSTMARK_API_KEY')
    if (!postmarkApiKey) {
      console.log('POSTMARK_API_KEY not configured, skipping email send')
      return new Response(
        JSON.stringify({
          success: true,
          message: 'Email not sent: POSTMARK_API_KEY not configured',
          poCount: enrichedPOs.length,
          emailSent: false
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      )
    }

    console.log('Sending email to:', notificationEmail)
    
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
      console.error('Postmark error:', errText)
      throw new Error(`Postmark API failed: ${pmRes.status} - ${errText}`)
    }

    console.log('Weekly PO report sent successfully')

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Weekly PO report sent successfully',
        poCount: enrichedPOs.length,
        totalValue: totalValue,
        emailSent: true
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    )

  } catch (error: unknown) {
    console.error('Error in weekly PO report:', error)
    const message = error instanceof Error ? error.message : String(error)
    const stack = error instanceof Error ? error.stack : undefined
    
    console.error('Error details:', { message, stack })
    
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: message,
        details: stack
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    )
  }
})

