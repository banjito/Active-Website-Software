#!/usr/bin/env node

/**
 * Test script for ready-to-bill notification
 * Automatically finds a job with ready_to_bill status and sends test notification
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables
dotenv.config({ path: join(__dirname, '..', '.env') });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceKey) {
  console.error('❌ Missing required environment variables:');
  console.error('   VITE_SUPABASE_URL:', supabaseUrl ? '✅' : '❌');
  console.error('   SUPABASE_SERVICE_ROLE_KEY:', serviceKey ? '✅' : '❌');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceKey);

async function testReadyToBillNotification() {
  try {
    console.log('\n🔍 Looking for jobs with "ready_to_bill" status...\n');

    // Find a job with ready_to_bill status
    const { data: jobs, error: jobsError } = await supabase
      .schema('neta_ops')
      .from('jobs')
      .select('id, job_number, title, customer_id, status')
      .eq('status', 'ready_to_bill')
      .limit(5);

    if (jobsError) {
      console.error('❌ Error fetching jobs:', jobsError);
      process.exit(1);
    }

    if (!jobs || jobs.length === 0) {
      console.log('⚠️  No jobs found with "ready_to_bill" status');
      console.log('\nTo test this function:');
      console.log('1. Go to a job in your app');
      console.log('2. Change its status to "Ready to Bill"');
      console.log('3. The notification will be sent automatically\n');
      
      // Check for any jobs to suggest
      const { data: anyJobs } = await supabase
        .schema('neta_ops')
        .from('jobs')
        .select('id, job_number, title, status')
        .limit(5);
      
      if (anyJobs && anyJobs.length > 0) {
        console.log('Available jobs you could test with:');
        anyJobs.forEach(job => {
          console.log(`  - ${job.job_number || 'No number'} | ${job.title} | Status: ${job.status}`);
        });
      }
      
      process.exit(0);
    }

    console.log(`✅ Found ${jobs.length} job(s) with ready_to_bill status:\n`);
    jobs.forEach((job, idx) => {
      console.log(`${idx + 1}. Job: ${job.job_number || 'No number'}`);
      console.log(`   Title: ${job.title}`);
      console.log(`   ID: ${job.id}\n`);
    });

    // Test with the first job
    const testJob = jobs[0];
    console.log(`📧 Sending test notification for job: ${testJob.job_number || 'No number'}\n`);

    const { data, error } = await supabase.functions.invoke('ready-to-bill-notification', {
      body: { jobId: testJob.id }
    });

    if (error) {
      console.error('❌ Error invoking function:', error);
      process.exit(1);
    }

    console.log('✅ Function Response:', JSON.stringify(data, null, 2));
    
    if (data?.emailSent) {
      console.log('\n🎉 Success! Email notification sent to:', data.sentTo);
      console.log('\nEmail details:');
      console.log('  Job Number:', data.jobNumber);
      console.log('  Customer:', data.customer);
    } else {
      console.log('\n⚠️  Function executed but email was not sent');
      console.log('Reason:', data?.message);
    }

  } catch (err) {
    console.error('❌ Unexpected error:', err);
    process.exit(1);
  }
}

// Run the test
console.log('🚀 Testing Ready-to-Bill Notification Function');
console.log('================================================\n');
testReadyToBillNotification();
