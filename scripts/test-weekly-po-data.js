// Test script to check what data would be included in the Weekly PO Report
// Run this before setting up the email to see what data you have

const { createClient } = require('@supabase/supabase-js');

async function testWeeklyPOData() {
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

  console.log('📊 Testing Weekly PO Report Data...\n');

  // Calculate date range (last 7 days)
  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - 7);

  console.log(`Date Range: ${startDate.toLocaleDateString()} - ${endDate.toLocaleDateString()}\n`);

  // Fetch POs from the past week
  const { data: posData, error: posError } = await supabase
    .schema('neta_ops')
    .from('job_contracts')
    .select('id, name, job_id, value, uploaded_date')
    .eq('type', 'purchase_order')
    .gte('uploaded_date', startDate.toISOString())
    .lte('uploaded_date', endDate.toISOString())
    .order('uploaded_date', { ascending: false });

  if (posError) {
    console.error('❌ Error fetching POs:', posError);
    process.exit(1);
  }

  if (!posData || posData.length === 0) {
    console.log('ℹ️  No POs found in the past week');
    console.log('   This is normal if no POs were entered recently');
    console.log('   The email will not be sent if there are no POs\n');
    
    // Show total PO count for reference
    const { count } = await supabase
      .schema('neta_ops')
      .from('job_contracts')
      .select('*', { count: 'exact', head: true })
      .eq('type', 'purchase_order');
    
    console.log(`   Total POs in system: ${count || 0}`);
    return;
  }

  console.log(`✅ Found ${posData.length} PO(s) entered in the past week\n`);

  // Get job and customer information
  const jobIds = [...new Set(posData.map(po => po.job_id))];
  const { data: jobsData } = await supabase
    .schema('neta_ops')
    .from('jobs')
    .select('id, job_number, title, customer_id')
    .in('id', jobIds);

  const customerIds = [...new Set(jobsData?.map(j => j.customer_id).filter(Boolean) || [])];
  const { data: customersData } = await supabase
    .schema('common')
    .from('customers')
    .select('id, name, company_name')
    .in('id', customerIds);

  // Build lookup maps
  const jobMap = new Map(jobsData?.map(j => [j.id, j]) || []);
  const customerMap = new Map(customersData?.map(c => [c.id, c]) || []);

  // Display PO details
  let totalValue = 0;
  console.log('═══════════════════════════════════════════════════════════════\n');
  
  posData.forEach((po, index) => {
    const job = jobMap.get(po.job_id);
    const customer = job?.customer_id ? customerMap.get(job.customer_id) : null;
    const customerName = customer?.company_name || customer?.name || 'N/A';
    const value = po.value || 0;
    totalValue += value;

    console.log(`PO ${index + 1}:`);
    console.log(`  Name: ${po.name}`);
    console.log(`  Job Number: ${job?.job_number || 'N/A'}`);
    console.log(`  Job Title: ${job?.title || 'N/A'}`);
    console.log(`  Customer: ${customerName}`);
    console.log(`  Value: $${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
    console.log(`  Uploaded: ${new Date(po.uploaded_date).toLocaleString()}`);
    console.log('');
  });

  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`\n📈 Summary:`);
  console.log(`   Total POs: ${posData.length}`);
  console.log(`   Total Value: $${totalValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
  console.log('\n✅ This data would be included in the weekly PO report email\n');
}

// Run the test
testWeeklyPOData().catch(console.error);

