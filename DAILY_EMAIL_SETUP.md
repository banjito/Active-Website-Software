# Daily Review Email Setup Guide

This guide will walk you through setting up daily email notifications for reports ready for review.

## 🧪 STEP 1: Test the Data First

Before setting up emails, let's see what data would be included:

```bash
# Set your Supabase credentials (replace with your actual values)
export SUPABASE_URL="https://your-project-ref.supabase.co"
export SUPABASE_SERVICE_ROLE_KEY="your-service-role-key-here"

# Run the test to see what data would be in the email
node scripts/test-review-data.js
```

This will show you:
- How many assets are marked "ready_for_review" 
- Which jobs they belong to
- What the email content would look like

## 📧 STEP 2: Set Up Email Service (Resend)

### Create Resend Account:
1. Go to https://resend.com
2. Sign up for free account (3,000 emails/month free)
3. Verify your email address

### Add Domain (Optional - can use test domain):
1. In Resend dashboard → "Domains"
2. Add your company domain OR use `onboarding@resend.dev` for testing

### Get API Key:
1. Go to "API Keys" in Resend dashboard
2. Click "Create API Key" 
3. Copy the key (starts with `re_`)

## 🚀 STEP 3: Deploy to Supabase

### Install Supabase CLI:
```bash
# Install via Homebrew (Mac)
brew install supabase/tap/supabase

# Or download from: https://github.com/supabase/cli/releases
```

### Deploy the Edge Function:
```bash
# Login to Supabase
supabase login

# Deploy the function
supabase functions deploy daily-review-notification
```

### Set Environment Variables in Supabase:
1. Go to your Supabase Dashboard
2. **Project Settings** → **Edge Functions** → **Environment Variables**
3. Add these variables:
   - **Name:** `REVIEW_NOTIFICATION_EMAIL`
   - **Value:** `your-email@company.com`
   
   - **Name:** `RESEND_API_KEY` 
   - **Value:** `re_your_api_key_here`

## 🧪 STEP 4: Test the Complete System

### Method 1: Manual HTTP Test
```bash
# Test the deployed function
curl -X POST \
  -H "Authorization: Bearer YOUR_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -d '{}' \
  "https://your-project.supabase.co/functions/v1/daily-review-notification"
```

### Method 2: Use the Test Script
```bash
# Set environment variables
export SUPABASE_URL="https://your-project.supabase.co"
export SUPABASE_SERVICE_ROLE_KEY="your-service-role-key"

# Run the test
node scripts/test-review-notification.js
```

## ⏰ STEP 5: Set Up Daily Scheduling

### Option A: GitHub Actions (Recommended)

1. **Add Repository Secrets:**
   - Go to your GitHub repository
   - Settings → Secrets and Variables → Actions
   - Add these secrets:
     - `SUPABASE_URL`: `https://your-project.supabase.co`
     - `SUPABASE_SERVICE_ROLE_KEY`: Your service role key

2. **The workflow file is already created:** `.github/workflows/daily-review-notification.yml`

3. **Test manually:**
   - Go to Actions tab in GitHub
   - Click "Daily Review Notification"
   - Click "Run workflow" to test

### Option B: External Cron Service

Use a service like cron-job.org:
1. Sign up at https://cron-job.org
2. Create new cron job:
   - **URL:** `https://your-project.supabase.co/functions/v1/daily-review-notification`
   - **Schedule:** Daily at 18:00 UTC (12 PM Central)
   - **Method:** POST
   - **Headers:** 
     - `Authorization: Bearer YOUR_SERVICE_ROLE_KEY`
     - `Content-Type: application/json`
   - **Body:** `{}`

## 🔍 Troubleshooting

### No Email Received?
- Check RESEND_API_KEY is correct
- Verify REVIEW_NOTIFICATION_EMAIL is set
- Check Resend dashboard for delivery status

### Function Not Working?
- Check Supabase Edge Function logs
- Verify environment variables are set
- Test with the data script first

### Wrong Time Zone?
- Current schedule: 18:00 UTC = 12:00 PM CST / 1:00 PM CDT
- Adjust cron schedule if needed:
  - `0 17 * * *` for 11 AM CST / 12 PM CDT
  - `0 19 * * *` for 1 PM CST / 2 PM CDT

### No Data in Email?
- Run `node scripts/test-review-data.js` to check database
- Make sure assets have status "ready_for_review"
- Verify job_assets table links assets to jobs

## 📊 What the Email Will Include

The daily email contains:
- **Summary:** Number of jobs and total reports
- **Job Details:** For each job with reports ready:
  - Job number and title
  - Division
  - Customer name (company and contact person)
  - Count of reports ready for review
- **Professional formatting** with AMP branding
- **Instructions** on how to access the review system

## 💰 Cost Breakdown

- **Supabase Edge Functions:** 500,000 invocations/month free
- **Resend:** 3,000 emails/month free
- **GitHub Actions:** 2,000 minutes/month free
- **Total:** $0/month for typical usage

## 🎯 Next Steps After Setup

1. **Test thoroughly** with the scripts provided
2. **Monitor for a few days** to ensure reliability
3. **Adjust timing** if needed for your workflow
4. **Add more recipients** by modifying the function
5. **Customize email template** if desired

---

**Need Help?** Check the logs in:
- Supabase Dashboard → Edge Functions → Logs
- GitHub Actions → Workflow runs
- Resend Dashboard → Logs

