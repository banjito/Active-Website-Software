// Test script to check what data would be included in the Weekly Jobs Status Report
// Run this before setting up the email to see what data you have

const { createClient } = require('@supabase/supabase-js');

async function testWeeklyJobsData() {
  // Get environment variables
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    console.error('❌ Missing environment variables!');
    console.log('Please set:');
    console.log('  export SUPABASE_URL="https://your-project.supabase.co"');
    console.log('  export SUPABASE_SERVICE_ROLE_KEY="your-service-role-key"');
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false }
  });

  console.log('📊 Testing Weekly Jobs Status Report Data...\n');

  // Fetch jobs with the specified active statuses
  const { data: jobsData, error: jobsError } = await supabase
    .schema('neta_ops')
    .from('jobs')
    .select('id, job_number, title, status, customer_id, fireteam_lead, created_at, updated_at')
    .in('status', ['in_progress', 'ready_to_bill'])
    .order('status', { ascending: true })
    .order('job_number', { ascending: true });

  if (jobsError) {
    console.error('❌ Error fetching jobs:', jobsError);
    process.exit(1);
  }

  if (!jobsData || jobsData.length === 0) {
    console.log('ℹ️  No jobs found with status: in_progress or ready_to_bill');
    console.log('   This is normal if all jobs are in other statuses');
    console.log('   The email will not be sent if there are no matching jobs\n');
    
    // Show total job count for reference
    const { count } = await supabase
      .schema('neta_ops')
      .from('jobs')
      .select('*', { count: 'exact', head: true });
    
    console.log(`   Total jobs in system: ${count || 0}`);
    return;
  }

  console.log(`✅ Found ${jobsData.length} active job(s)\n`);

  // Get customer information
  const customerIds = [...new Set(jobsData.map(j => j.customer_id).filter(Boolean))];
  const { data: customersData } = await supabase
    .schema('common')
    .from('customers')
    .select('id, name, company_name')
    .in('id', customerIds);

  // Build customer lookup map
  const customerMap = new Map(customersData?.map(c => [c.id, c]) || []);

  // Group jobs by status
  const inProgressJobs = jobsData.filter(j => j.status === 'in_progress');
  const readyToBillJobs = jobsData.filter(j => j.status === 'ready_to_bill');
  const displayJobList = (jobs, statusLabel) => {
    if (jobs.length === 0) {
      console.log(`  (No jobs in this status)\n`);
      return;
    }

    jobs.forEach((job, index) => {
      const customer = customerMap.get(job.customer_id);
      const customerName = customer?.company_name || customer?.name || 'N/A';

      console.log(`  ${index + 1}. ${job.job_number} - ${job.title}`);
      console.log(`     Customer: ${customerName}`);
      console.log(`     Fireteam Lead: ${job.fireteam_lead || 'Not assigned'}`);
      console.log(`     Last Updated: ${new Date(job.updated_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`);
      console.log('');
    });
  };

  console.log('═══════════════════════════════════════════════════════════════\n');
  
  console.log(`🔨 IN PROGRESS (${inProgressJobs.length}):`);
  displayJobList(inProgressJobs, 'IN PROGRESS');

  console.log(`💰 READY FOR BILLING (${readyToBillJobs.length}):`);
  displayJobList(readyToBillJobs, 'READY TO BILL');

  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`\n📈 Summary:`);
  console.log(`   Total Active Jobs: ${jobsData.length}`);
  console.log(`   - In Progress: ${inProgressJobs.length}`);
  console.log(`   - Ready to Bill: ${readyToBillJobs.length}`);
  console.log('\n✅ This data would be included in the weekly jobs status report email\n');
}

// Run the test
testWeeklyJobsData().catch(console.error);
