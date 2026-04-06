# Ready-to-Bill Email Notification Setup

This guide will help you set up automatic email notifications that trigger when a job status is changed to "ready to bill". The email will be sent to accounting@ampqes.com.

## 🎯 How It Works

1. **Trigger**: When a job status is changed to "ready_to_bill" in the job details page
2. **Automatic**: Email is sent immediately after the status change
3. **Recipient**: accounting@ampqes.com (hardcoded for security)
4. **Content**: Job details, customer info, fireteam lead, and direct link to job

## 🚀 STEP 1: Deploy the Edge Function

### Option A: Using Supabase CLI (Recommended)

```bash
# Install Supabase CLI if you haven't already
brew install supabase/tap/supabase

# Login to Supabase
supabase login

# Deploy the new function
supabase functions deploy ready-to-bill-notification
```

### Option B: Manual Deployment via Dashboard

1. Go to your Supabase Dashboard
2. Navigate to **Edge Functions**
3. Click **Create Function**
4. Name: `ready-to-bill-notification`
5. Copy the contents from `supabase/functions/ready-to-bill-notification/index.ts`
6. Click **Deploy**

## 🔧 STEP 2: Environment Variables

The ready-to-bill notification uses the same environment variables as your existing daily email system:

### Required Variables (should already be set):
- **POSTMARK_API_KEY**: Your Postmark API key
- **POSTMARK_FROM**: Sender email (defaults to john.chambers@ampqes.com)
- **SUPABASE_URL**: Your Supabase project URL
- **SUPABASE_SERVICE_ROLE_KEY**: Your service role key

### To check/set variables:
1. Go to Supabase Dashboard
2. **Project Settings** → **Edge Functions** → **Environment Variables**
3. Verify these variables exist (they should from your daily email setup)

## 🧪 STEP 3: Test the System

### Method 1: Using the Test Script

```bash
# Set environment variables (if not already set)
export SUPABASE_URL="https://your-project.supabase.co"
export SUPABASE_SERVICE_ROLE_KEY="your-service-role-key"

# Test with any job that has ready_to_bill status
node scripts/test-ready-to-bill-notification.js

# Or test with a specific job ID
node scripts/test-ready-to-bill-notification.js "your-job-uuid-here"
```

### Method 2: Manual HTTP Test

```bash
curl -X POST \
  -H "Authorization: Bearer YOUR_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -d '{"jobId": "your-job-uuid-here"}' \
  "https://your-project.supabase.co/functions/v1/ready-to-bill-notification"
```

### Method 3: Test via UI (End-to-End)

1. Go to any job in your system
2. Change the status to "Ready to Bill"
3. Check that accounting@ampqes.com receives the email
4. Verify the email contains correct job details

## 📧 Email Content

The notification email includes:

### Subject Line:
```
Job Ready to Bill: [JOB-NUMBER] - [JOB-TITLE]
```

### Email Content:
- **Job Number**: The job's number or ID
- **Job Title**: Full job title
- **Customer**: Company name or customer name
- **Fireteam Lead**: Assigned fireteam leader
- **Status Changed**: Timestamp when status was changed
- **Direct Link**: Button to view job details
- **Professional Styling**: AMP-branded HTML email

## 🔍 Troubleshooting

### Email Not Received?

1. **Check Function Logs**:
   - Go to Supabase Dashboard → Edge Functions → ready-to-bill-notification
   - Check the logs for any errors

2. **Verify Environment Variables**:
   - Ensure POSTMARK_API_KEY is set and valid
   - Check POSTMARK_FROM is a verified sender

3. **Test the Function Directly**:
   ```bash
   node scripts/test-ready-to-bill-notification.js
   ```

### Function Not Triggering?

1. **Check Browser Console**:
   - Open browser dev tools when changing job status
   - Look for any JavaScript errors

2. **Verify Job Status**:
   - Make sure the job actually changed to "ready_to_bill"
   - Check database to confirm status was saved

3. **Check Network Tab**:
   - Verify the function call is being made
   - Look for any network errors

### Wrong Email Content?

1. **Verify Job Data**:
   - Check that job has correct title, customer, etc.
   - Ensure customer information is properly linked

2. **Test with Different Jobs**:
   - Try with jobs that have complete information
   - Check jobs with different customer types

## 🔒 Security Notes

- **Hardcoded Recipient**: accounting@ampqes.com is hardcoded in the function for security
- **Authentication**: Function requires service role key to execute
- **No User Input**: Email content is generated from database data only
- **Error Handling**: Errors are logged but don't affect job status updates

## 📋 Integration Details

### Frontend Integration:
- **File**: `src/components/jobs/JobDetail.tsx`
- **Function**: `handleQuickStatusSave`
- **Trigger**: When `newStatus === 'ready_to_bill'`
- **Method**: `supabase.functions.invoke('ready-to-bill-notification')`

### Backend Function:
- **File**: `supabase/functions/ready-to-bill-notification/index.ts`
- **Endpoint**: `/functions/v1/ready-to-bill-notification`
- **Method**: POST with `{ jobId: "uuid" }`
- **Response**: Success/failure status and email details

## 🎉 Success!

Once deployed and tested, the system will:

1. ✅ Automatically detect when jobs are marked "ready to bill"
2. ✅ Send immediate email notifications to accounting
3. ✅ Include all relevant job and customer information
4. ✅ Provide direct links to job details
5. ✅ Log all activity for troubleshooting

The accounting team will now be notified immediately when jobs are ready for billing, improving workflow efficiency and reducing delays in the billing process!
