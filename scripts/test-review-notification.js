#!/usr/bin/env node

/**
 * Test script for the daily review notification system
 * Run this to test the email notification functionality
 */

const https = require('https');

// Configuration - Update these values
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://your-project-ref.supabase.co';
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

if (!SERVICE_ROLE_KEY) {
  console.error('❌ Error: SUPABASE_SERVICE_ROLE_KEY environment variable is required');
  console.log('Usage: SUPABASE_SERVICE_ROLE_KEY=your_key node test-review-notification.js');
  process.exit(1);
}

const url = `${SUPABASE_URL}/functions/v1/daily-review-notification`;

console.log('🚀 Testing Daily Review Notification...');
console.log(`📡 URL: ${url}`);
console.log(`🕐 Time: ${new Date().toLocaleString('en-US', { timeZone: 'America/Chicago' })} (Central Time)`);
console.log('');

const postData = JSON.stringify({});

const options = {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(postData)
  }
};

const req = https.request(url, options, (res) => {
  let data = '';

  console.log(`📊 Status Code: ${res.statusCode}`);
  console.log(`📋 Headers:`, res.headers);
  console.log('');

  res.on('data', (chunk) => {
    data += chunk;
  });

  res.on('end', () => {
    try {
      const response = JSON.parse(data);
      
      if (res.statusCode === 200) {
        console.log('✅ Success!');
        console.log(`📧 Jobs with reports: ${response.jobsCount || 0}`);
        console.log(`📝 Total reports: ${response.reportsCount || 0}`);
        console.log(`📮 Email sent: ${response.emailSent ? 'Yes' : 'No (check RESEND_API_KEY)'}`);
        console.log(`💬 Message: ${response.message}`);
      } else {
        console.log('❌ Error!');
        console.log(`🚨 Error: ${response.error || 'Unknown error'}`);
      }
    } catch (e) {
      console.log('📄 Raw Response:');
      console.log(data);
    }
  });
});

req.on('error', (error) => {
  console.error('❌ Request Error:', error.message);
});

req.write(postData);
req.end();

// Provide usage instructions
console.log('');
console.log('📚 Setup Instructions:');
console.log('1. Deploy the Edge Function to Supabase');
console.log('2. Set environment variables in Supabase:');
console.log('   - REVIEW_NOTIFICATION_EMAIL=your-email@company.com');
console.log('   - RESEND_API_KEY=your_resend_api_key');
console.log('3. Set up GitHub Actions or cron job for daily execution');
console.log('');
console.log('🔧 Environment Variables Needed:');
console.log('   - SUPABASE_URL (current)');
console.log('   - SUPABASE_SERVICE_ROLE_KEY (current)');
console.log('   - REVIEW_NOTIFICATION_EMAIL (in Supabase)');
console.log('   - RESEND_API_KEY (in Supabase)');
console.log('');
