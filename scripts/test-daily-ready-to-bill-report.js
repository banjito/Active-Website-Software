#!/usr/bin/env node

/**
 * Test script for daily ready-to-bill report
 * Shows what data would be sent in the daily email
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
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceKey) {
  console.error('❌ Missing required environment variables:');
  console.error('   VITE_SUPABASE_URL:', supabaseUrl ? '✅' : '❌');
  console.error('   SUPABASE_SERVICE_ROLE_KEY:', serviceKey ? '✅' : '❌');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceKey);

async function testDailyReport() {
  try {
    console.log('\n🔍 Fetching jobs with "ready_to_bill" status...\n');

    // Fetch all ready-to-bill jobs
    const { data: jobs, error: jobsError } = await supabase
      .schema('neta_ops')
      .from('jobs')
      .select('id, title, job_number, customer_id, fireteam_lead, updated_at')
      .eq('status', 'ready_to_bill')
      .order('updated_at', { ascending: false });

    if (jobsError) {
      console.error('❌ Error fetching jobs:', jobsError);
      process.exit(1);
    }

    if (!jobs || jobs.length === 0) {
      console.log('📭 No jobs found with "ready_to_bill" status');
      console.log('\nThe daily report would contain: "No jobs are currently ready for billing"\n');
      return;
    }

    console.log(`✅ Found ${jobs.length} job(s) with ready_to_bill status:\n`);

    // Fetch customer information
    const customerIds = [...new Set(jobs.map(j => j.customer_id).filter(Boolean))];
    const customersMap = new Map();

    if (customerIds.length > 0) {
      const { data: customers } = await supabase
        .schema('common')
        .from('customers')
        .select('id, name, company_name')
        .in('id', customerIds);

      if (customers) {
        customers.forEach(c => customersMap.set(c.id, c));
      }
    }

    // Display jobs
    console.log('┌─────────────────────────────────────────────────────────────────────────────┐');
    console.log('│                      Daily Ready-to-Bill Report                             │');
    console.log('└─────────────────────────────────────────────────────────────────────────────┘\n');

    jobs.forEach((job, index) => {
      const customer = customersMap.get(job.customer_id);
      const customerName = customer?.company_name || customer?.name || 'Unknown Customer';
      const jobNumber = job.job_number || job.id.substring(0, 8);
      const fireteamLead = job.fireteam_lead || 'Not assigned';
      const updatedDate = new Date(job.updated_at).toLocaleDateString();

      console.log(`${index + 1}. Job Number: ${jobNumber}`);
      console.log(`   Title: ${job.title || 'Untitled Job'}`);
      console.log(`   Customer: ${customerName}`);
      console.log(`   Fireteam Lead: ${fireteamLead}`);
      console.log(`   Last Updated: ${updatedDate}`);
      console.log(`   Job ID: ${job.id}\n`);
    });

    console.log('─────────────────────────────────────────────────────────────────────────────');
    console.log(`\n📧 Email would be sent to: accounting@ampqes.com`);
    console.log(`📋 Subject: Daily Ready-to-Bill Report - ${jobs.length} Job${jobs.length !== 1 ? 's' : ''}\n`);

    console.log('💡 To send the actual email, run:');
    console.log('   node scripts/test-daily-ready-to-bill-report.js --send\n');

    // If --send flag is provided, actually send the email
    if (process.argv.includes('--send')) {
      console.log('📧 Sending email via Supabase Edge Function...\n');

      const { data, error } = await supabase.functions.invoke('daily-ready-to-bill-report', {
        body: {}
      });

      if (error) {
        console.error('❌ Error sending email:', error);
        process.exit(1);
      }

      console.log('✅ Email sent successfully!');
      console.log('Response:', JSON.stringify(data, null, 2));
    }

  } catch (err) {
    console.error('❌ Unexpected error:', err);
    process.exit(1);
  }
}

console.log('🚀 Daily Ready-to-Bill Report Test');
console.log('====================================\n');
testDailyReport();

