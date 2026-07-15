import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { BRAND_COLOR, COMPANY_FULL_NAME, COMPANY_NAME, COMPANY_OPS_EMAIL, DEFAULT_FROM_EMAIL } from '../_shared/companyConfig.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface JobData {
  id: string;
  title: string;
  job_number: string;
  customer_name?: string;
  customer_company?: string;
  fireteam_lead?: string;
  created_at: string;
  updated_at: string;
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

    // Get job ID from request body
    let { jobId } = await req.json()
    
    // If no jobId provided, find a ready_to_bill job for testing
    if (!jobId) {
      console.log('No jobId provided, searching for a ready_to_bill job...')
      const { data: testJobs, error: searchError } = await supabase
        .schema('neta_ops')
        .from('jobs')
        .select('id, job_number, title')
        .eq('status', 'ready_to_bill')
        .limit(1)
      
      if (searchError) throw searchError
      
      if (!testJobs || testJobs.length === 0) {
        return new Response(
          JSON.stringify({
            success: false,
            error: 'No jobId provided and no jobs found with ready_to_bill status',
            hint: 'Either provide a jobId in the request body or create a job with ready_to_bill status'
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
        )
      }
      
      jobId = testJobs[0].id
      console.log(`Found test job: ${testJobs[0].job_number || 'No number'} (${testJobs[0].title})`)
    }

    console.log('Processing ready-to-bill notification for job:', jobId)

    // Fetch job details
    const { data: jobData, error: jobError } = await supabase
      .schema('neta_ops')
      .from('jobs')
      .select('id, title, job_number, customer_id, fireteam_lead, created_at, updated_at')
      .eq('id', jobId)
      .eq('status', 'ready_to_bill') // Only process if still ready_to_bill
      .single()

    if (jobError) throw jobError

    if (!jobData) {
      return new Response(
        JSON.stringify({
          success: true,
          message: 'Job not found or not in ready_to_bill status',
          emailSent: false
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      )
    }

    // Fetch customer information
    let customerInfo = null
    if (jobData.customer_id) {
      const { data: customerData, error: customerError } = await supabase
        .schema('common')
        .from('customers')
        .select('name, company_name, address')
        .eq('id', jobData.customer_id)
        .single()

      if (!customerError && customerData) {
        customerInfo = customerData
      }
    }

    const customerName = customerInfo?.company_name || customerInfo?.name || 'Unknown Customer'
    const jobTitle = jobData.title || 'Untitled Job'
    const jobNumber = jobData.job_number || jobData.id.substring(0, 8)
    const fireteamLead = jobData.fireteam_lead || 'Not assigned'

    // Email content
    const emailSubject = `Job Ready to Bill: ${jobNumber} - ${jobTitle}`
    
    const emailHtml = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background-color: ${BRAND_COLOR}; color: white; padding: 20px; text-align: center;">
          <h1 style="margin: 0; font-size: 24px;">Job Ready for Billing</h1>
        </div>
        
        <div style="padding: 20px; background-color: #f9f9f9;">
          <h2 style="color: #333; margin-top: 0;">Job Details</h2>
          
          <table style="width: 100%; border-collapse: collapse; background-color: white; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
            <tr>
              <td style="padding: 12px; border-bottom: 1px solid #eee; font-weight: bold; background-color: #f8f9fa;">Job Number:</td>
              <td style="padding: 12px; border-bottom: 1px solid #eee;">${jobNumber}</td>
            </tr>
            <tr>
              <td style="padding: 12px; border-bottom: 1px solid #eee; font-weight: bold; background-color: #f8f9fa;">Job Title:</td>
              <td style="padding: 12px; border-bottom: 1px solid #eee;">${jobTitle}</td>
            </tr>
            <tr>
              <td style="padding: 12px; border-bottom: 1px solid #eee; font-weight: bold; background-color: #f8f9fa;">Customer:</td>
              <td style="padding: 12px; border-bottom: 1px solid #eee;">${customerName}</td>
            </tr>
            <tr>
              <td style="padding: 12px; border-bottom: 1px solid #eee; font-weight: bold; background-color: #f8f9fa;">Fireteam Lead:</td>
              <td style="padding: 12px; border-bottom: 1px solid #eee;">${fireteamLead}</td>
            </tr>
            <tr>
              <td style="padding: 12px; border-bottom: 1px solid #eee; font-weight: bold; background-color: #f8f9fa;">Status Changed:</td>
              <td style="padding: 12px; border-bottom: 1px solid #eee;">${new Date().toLocaleString()}</td>
            </tr>
          </table>
          
          <div style="margin-top: 20px; padding: 15px; background-color: #e8f5e8; border-left: 4px solid #28a745; border-radius: 4px;">
            <p style="margin: 0; color: #155724;"><strong>Action Required:</strong> This job is now ready for billing and invoicing.</p>
          </div>
          
          <div style="margin-top: 20px; text-align: center;">
            <a href="${supabaseUrl.replace('/rest/v1', '')}/jobs/${jobData.id}" 
               style="background-color: ${BRAND_COLOR}; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block; font-weight: bold;">
              View Job Details
            </a>
          </div>
        </div>
        
        <div style="padding: 20px; text-align: center; color: #666; font-size: 14px; border-top: 1px solid #eee;">
          <p style="margin: 0;">This is an automated notification from ${COMPANY_FULL_NAME}</p>
          <p style="margin: 5px 0 0 0;">Generated on ${new Date().toLocaleString()}</p>
        </div>
      </div>
    `

    const emailText = `
Job Ready for Billing

Job Details:
- Job Number: ${jobNumber}
- Job Title: ${jobTitle}
- Customer: ${customerName}
- Fireteam Lead: ${fireteamLead}
- Status Changed: ${new Date().toLocaleString()}

Action Required: This job is now ready for billing and invoicing.

View Job Details: ${supabaseUrl.replace('/rest/v1', '')}/jobs/${jobData.id}

This is an automated notification from ${COMPANY_FULL_NAME}
Generated on ${new Date().toLocaleString()}
    `

    // Send via Postmark
    const postmarkApiKey = Deno.env.get('POSTMARK_API_KEY')
    if (!postmarkApiKey) {
      return new Response(
        JSON.stringify({
          success: true,
          message: 'Email not sent: POSTMARK_API_KEY not configured',
          jobId: jobData.id,
          emailSent: false
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      )
    }

    // Verified sender in Postmark
    const fromEmail = DEFAULT_FROM_EMAIL
    const fromHeader = fromEmail.includes('<') ? fromEmail : `${COMPANY_NAME} System <${fromEmail}>`
    const toEmail = COMPANY_OPS_EMAIL // TESTING: Changed from accounting@ampqes.com

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

    console.log('Ready-to-bill notification sent successfully for job:', jobId)

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Ready-to-bill notification sent successfully',
        jobId: jobData.id,
        jobNumber: jobNumber,
        customer: customerName,
        emailSent: true,
        sentTo: toEmail
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    )

  } catch (error: unknown) {
    console.error('Error in ready-to-bill notification:', error)
    const message = error instanceof Error ? error.message : String(error)
    return new Response(
      JSON.stringify({ success: false, error: message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    )
  }
})
