#!/usr/bin/env node

/**
 * Test script to check what data would be included in the daily review notification
 * This tests the database queries without needing to deploy the Edge Function
 */

import { createClient } from '@supabase/supabase-js';

// You'll need to set these environment variables
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('❌ Missing environment variables:');
  console.log('Set these environment variables:');
  console.log('export SUPABASE_URL="https://your-project.supabase.co"');
  console.log('export SUPABASE_SERVICE_ROLE_KEY="your-service-role-key"');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

async function testReviewData() {
  try {
    console.log('🔍 Testing Daily Review Notification Data...');
    console.log(`🕐 Current Time: ${new Date().toLocaleString('en-US', { timeZone: 'America/Chicago' })} (Central Time)`);
    console.log('');

    // Step 1: Get all assets that are marked as "ready_for_review"
    console.log('📋 Step 1: Checking for assets ready for review...');
    const { data: assetsData, error: assetsError } = await supabase
      .schema('neta_ops')
      .from('assets')
      .select('id, name, created_at')
      .eq('status', 'ready_for_review')
      .order('created_at', { ascending: true });

    if (assetsError) {
      console.error('❌ Error fetching assets:', assetsError);
      return;
    }

    console.log(`   Found ${assetsData?.length || 0} assets ready for review`);
    
    if (!assetsData || assetsData.length === 0) {
      console.log('');
      console.log('ℹ️  No assets are currently marked as "ready_for_review"');
      console.log('   To test this system:');
      console.log('   1. Go to a job in your system');
      console.log('   2. Change an asset status to "Ready for Review"');
      console.log('   3. Run this test again');
      return;
    }

    // Step 2: Get job_asset links
    console.log('🔗 Step 2: Finding job links...');
    const assetIds = assetsData.map(asset => asset.id);
    const { data: jobAssetLinks, error: linksError } = await supabase
      .schema('neta_ops')
      .from('job_assets')
      .select('job_id, asset_id')
      .in('asset_id', assetIds);

    if (linksError) {
      console.error('❌ Error fetching job asset links:', linksError);
      return;
    }

    console.log(`   Found ${jobAssetLinks?.length || 0} job-asset links`);

    // Group assets by job
    const assetsByJob = {};
    jobAssetLinks?.forEach(link => {
      if (!assetsByJob[link.job_id]) {
        assetsByJob[link.job_id] = [];
      }
      const asset = assetsData.find(a => a.id === link.asset_id);
      if (asset) {
        assetsByJob[link.job_id].push(asset);
      }
    });

    const jobIds = Object.keys(assetsByJob);
    console.log(`   Assets are linked to ${jobIds.length} jobs`);

    if (jobIds.length === 0) {
      console.log('❌ No jobs found for the assets ready for review');
      return;
    }

    // Step 3: Get job details (only include jobs whitelisted for daily emails)
    console.log('📝 Step 3: Getting job details (checking email whitelist)...');
    const { data: jobsData, error: jobsError } = await supabase
      .schema('neta_ops')
      .from('jobs')
      .select('id, title, job_number, division, customer_id, include_in_daily_email')
      .in('id', jobIds)
      .eq('include_in_daily_email', true);

    if (jobsError) {
      console.error('❌ Error fetching jobs:', jobsError);
      return;
    }

    console.log(`   Found ${jobsData?.length || 0} job records`);

    // Step 4: Get customer details and prepare final data
    console.log('👥 Step 4: Getting customer information...');
    const jobsWithReports = [];

    for (const job of jobsData || []) {
      let customerData = null;
      
      if (job.customer_id) {
        try {
          const { data: customer, error: customerError } = await supabase
            .schema('common')
            .from('customers')
            .select('name, company_name')
            .eq('id', job.customer_id)
            .single();

          if (!customerError && customer) {
            customerData = customer;
          }
        } catch (err) {
          console.warn(`   ⚠️  Could not fetch customer for job ${job.job_number}`);
        }
      }

      const jobAssets = assetsByJob[job.id] || [];
      
      jobsWithReports.push({
        id: job.id,
        job_number: job.job_number || 'N/A',
        title: job.title,
        division: job.division,
        customer_name: customerData?.name,
        company_name: customerData?.company_name,
        reports_count: jobAssets.length,
        assets: jobAssets.map(a => ({ name: a.name, created_at: a.created_at }))
      });
    }

    // Sort by job number
    jobsWithReports.sort((a, b) => a.job_number.localeCompare(b.job_number));

    // Step 5: Display results
    console.log('');
    console.log('📊 RESULTS - Jobs That Would Be Included in Daily Email:');
    console.log('='.repeat(60));

    const totalReports = jobsWithReports.reduce((sum, job) => sum + job.reports_count, 0);
    
    console.log(`📈 Summary: ${jobsWithReports.length} jobs with ${totalReports} reports ready for review`);
    console.log('');

    jobsWithReports.forEach((job, index) => {
      console.log(`${index + 1}. Job #${job.job_number} - ${job.title}`);
      console.log(`   📍 Division: ${job.division}`);
      if (job.company_name) {
        console.log(`   🏢 Customer: ${job.company_name}${job.customer_name ? ` (${job.customer_name})` : ''}`);
      }
      console.log(`   📝 Reports Ready: ${job.reports_count}`);
      
      // Show asset details
      job.assets.forEach((asset, i) => {
        console.log(`      ${i + 1}. ${asset.name} (created: ${new Date(asset.created_at).toLocaleDateString()})`);
      });
      console.log('');
    });

    if (jobsWithReports.length === 0) {
      console.log('ℹ️  No jobs found with reports ready for review.');
      console.log('   This means the daily email would show "No reports ready for review".');
    } else {
      console.log('✅ This data would be included in the daily email notification!');
    }

    console.log('');
    console.log('🎯 Next Steps:');
    console.log('1. Deploy the Edge Function to Supabase');
    console.log('2. Set up Resend API key');
    console.log('3. Configure the notification email address');
    console.log('4. Set up daily scheduling (GitHub Actions or cron)');

  } catch (error) {
    console.error('❌ Unexpected error:', error);
  }
}

// Run the test
testReviewData();
