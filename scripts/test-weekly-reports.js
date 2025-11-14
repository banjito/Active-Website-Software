// Test script to trigger the weekly report edge functions
// Use this to test that the functions work and emails are sent

const https = require('https');

async function testWeeklyReports() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    console.error('❌ Missing environment variables!');
    console.log('Please set:');
    console.log('  export SUPABASE_URL="https://your-project.supabase.co"');
    console.log('  export SUPABASE_SERVICE_ROLE_KEY="your-service-role-key"');
    process.exit(1);
  }

  // Extract base URL
  const baseUrl = supabaseUrl.replace('https://', '').replace('/rest/v1', '');

  console.log('🧪 Testing Weekly Reports Edge Functions...\n');
  console.log('═══════════════════════════════════════════════════════════════\n');

  // Test Weekly PO Report
  console.log('📧 Testing Weekly PO Report...');
  const poResult = await callEdgeFunction(baseUrl, supabaseKey, 'weekly-po-report');
  console.log('Response:', JSON.stringify(poResult, null, 2));
  console.log('');

  // Wait a bit before testing the second function
  await new Promise(resolve => setTimeout(resolve, 2000));

  // Test Weekly Jobs Status Report
  console.log('📧 Testing Weekly Jobs Status Report...');
  const jobsResult = await callEdgeFunction(baseUrl, supabaseKey, 'weekly-jobs-status-report');
  console.log('Response:', JSON.stringify(jobsResult, null, 2));
  console.log('');

  console.log('═══════════════════════════════════════════════════════════════\n');
  
  if (poResult.emailSent && jobsResult.emailSent) {
    console.log('✅ Both emails sent successfully!');
    console.log('   Check your inbox for the reports\n');
  } else if (poResult.emailSent || jobsResult.emailSent) {
    console.log('⚠️  One email was sent, but the other was not');
    console.log('   Check the responses above for details\n');
  } else {
    console.log('ℹ️  No emails were sent');
    console.log('   This could be because:');
    console.log('   - No data matches the criteria (normal)');
    console.log('   - POSTMARK_API_KEY is not configured\n');
  }
}

function callEdgeFunction(baseUrl, authKey, functionName) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: baseUrl,
      path: `/functions/v1/${functionName}`,
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${authKey}`,
        'Content-Type': 'application/json'
      }
    };

    const req = https.request(options, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          resolve({ error: 'Failed to parse response', raw: data });
        }
      });
    });

    req.on('error', (error) => {
      reject(error);
    });

    req.write(JSON.stringify({}));
    req.end();
  });
}

// Run the test
testWeeklyReports().catch(console.error);

