# Weekly Reports Email Setup Guide

This guide will walk you through setting up two automated weekly reports:
1. **Weekly PO Report**: All purchase orders entered in the past week
2. **Weekly Jobs Status Report**: All jobs that are In-Progress, Ready for Billing, or Billed

Both reports are scheduled to send every Monday at 8:00 AM Central Time.

---

## 🎯 What You'll Get

### Weekly PO Report
- Lists all purchase orders entered in the past 7 days
- Includes job number, title, customer, value, and upload date
- Shows total count and total value
- Professional HTML email with AMP branding

### Weekly Jobs Status Report  
- Lists all active jobs grouped by status:
  - In Progress
  - Ready for Billing
  - Billed
- Shows job number, title, customer, fireteam lead, and last update date
- Summary statistics at the top
- Professional HTML email with AMP branding

---

## 🚀 STEP 1: Deploy the Edge Functions

Deploy manually through the Supabase Dashboard (same process as your daily email function).

### Deploy Weekly PO Report Function:

1. Go to your Supabase Dashboard
2. Navigate to **Edge Functions**
3. Click **Create a new function** (or **New Function**)
4. Function name: `weekly-po-report`
5. Open the file `supabase/functions/weekly-po-report/index.ts` in your code editor
6. Copy the entire contents
7. Paste into the Supabase function editor
8. Click **Deploy**

### Deploy Weekly Jobs Status Report Function:

1. In Edge Functions, click **Create a new function**
2. Function name: `weekly-jobs-status-report`
3. Open the file `supabase/functions/weekly-jobs-status-report/index.ts` in your code editor
4. Copy the entire contents
5. Paste into the Supabase function editor
6. Click **Deploy**

---

## 🔧 STEP 2: Environment Variables

The weekly reports use the **same environment variables** as your existing daily email system, so if those are already set up, you're good to go!

### Required Variables (should already be set):
- **POSTMARK_API_KEY**: Your Postmark API key for sending emails
- **POSTMARK_FROM**: Sender email (defaults to john.chambers@ampqes.com)
- **SUPABASE_URL**: Your Supabase project URL
- **SUPABASE_SERVICE_ROLE_KEY**: Your service role key

### Optional New Variable:
- **WEEKLY_REPORT_EMAIL**: Email address to receive the reports
  - If not set, falls back to `REVIEW_NOTIFICATION_EMAIL`
  - If that's not set either, defaults to john.chambers@ampqes.com

### To add the new variable (optional):
1. Go to your Supabase Dashboard
2. **Project Settings** → **Edge Functions** → **Environment Variables**
3. Add:
   - **Name:** `WEEKLY_REPORT_EMAIL`
   - **Value:** `your-email@company.com` (e.g., accounting@ampqes.com)

---

## 🧪 STEP 3: Test the Functions

Before setting up the schedule, let's test that both functions work correctly.

### Method 1: Test from Supabase Dashboard (Easiest)

1. Go to **Edge Functions** in your Supabase Dashboard
2. Click on `weekly-po-report`
3. Click the **Invoke** or **Run** button
4. Check your email - you should receive the PO report!
5. Go back and repeat for `weekly-jobs-status-report`

### Method 2: Use the Test Script

```bash
# Set your environment variables
export SUPABASE_URL="https://your-project.supabase.co"
export SUPABASE_SERVICE_ROLE_KEY="your-service-role-key"

# Run the combined test
node scripts/test-weekly-reports.js
```

### Method 3: Use curl Commands

```bash
# Test Weekly PO Report
curl -X POST \
  -H "Authorization: Bearer YOUR_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -d '{}' \
  "https://your-project.supabase.co/functions/v1/weekly-po-report"

# Test Weekly Jobs Status Report
curl -X POST \
  -H "Authorization: Bearer YOUR_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -d '{}' \
  "https://your-project.supabase.co/functions/v1/weekly-jobs-status-report"
```

**Expected Response:**
```json
{
  "success": true,
  "message": "Weekly PO report sent successfully",
  "poCount": 5,
  "emailSent": true
}
```

---

## ⏰ STEP 4: Set Up Weekly Scheduling

We'll use GitHub Actions to automatically trigger these reports every Monday at 8:00 AM CST.

### Option A: GitHub Actions (Recommended)

The workflow file has already been created at `.github/workflows/weekly-reports.yml`

**Setup Steps:**

1. **Add Repository Secrets (if not already added):**
   - Go to your GitHub repository
   - **Settings** → **Secrets and Variables** → **Actions**
   - Verify these secrets exist (they should from your daily email setup):
     - `SUPABASE_URL`: `https://your-project.supabase.co`
     - `SUPABASE_SERVICE_ROLE_KEY`: Your service role key

2. **Test the Workflow Manually:**
   - Go to **Actions** tab in GitHub
   - Click **"Weekly Reports"**
   - Click **"Run workflow"** dropdown
   - Click the green **"Run workflow"** button
   - Wait a minute and check your email!

3. **Schedule Details:**
   - Runs every Monday at 8:00 AM CST (14:00 UTC)
   - PO Report runs first
   - Jobs Status Report runs after PO Report completes
   - Both reports sent to the same email address

### Option B: External Cron Service

If you prefer using cron-job.org or similar:

1. **For Weekly PO Report:**
   - **URL:** `https://your-project.supabase.co/functions/v1/weekly-po-report`
   - **Schedule:** `0 14 * * 1` (Every Monday at 14:00 UTC / 8:00 AM CST)
   - **Method:** POST
   - **Headers:**
     - `Authorization: Bearer YOUR_SERVICE_ROLE_KEY`
     - `Content-Type: application/json`
   - **Body:** `{}`

2. **For Weekly Jobs Status Report:**
   - Same as above, but use URL: `...weekly-jobs-status-report`
   - Set to run 5 minutes after the PO report

---

## 📊 Email Content Preview

### Weekly PO Report Email Includes:
- **Header:** Week date range
- **Summary:**
  - Total POs entered
  - Total value of all POs
- **Detailed List:** For each PO:
  - PO name
  - Job number and title
  - Customer name
  - PO value
  - Upload date/time

### Weekly Jobs Status Report Email Includes:
- **Header:** Week ending date
- **Summary:**
  - Total active jobs
  - Count by status (In Progress, Ready to Bill, Billed)
- **Three Sections:**
  1. **In Progress Jobs** (blue badges)
  2. **Ready for Billing Jobs** (orange badges)
  3. **Billed Jobs** (green badges)
- **For Each Job:**
  - Job number and title
  - Customer name
  - Fireteam lead
  - Last update date

---

## 🔍 Troubleshooting

### No Email Received?
- ✅ Check that POSTMARK_API_KEY is set correctly
- ✅ Verify WEEKLY_REPORT_EMAIL or REVIEW_NOTIFICATION_EMAIL is set
- ✅ Check Postmark dashboard for delivery status
- ✅ Look at Supabase Edge Function logs for errors

### Empty Report?
- **For PO Report:** 
  - Make sure you have POs with type 'purchase_order' in the job_contracts table
  - Check that uploaded_date is within the last 7 days
- **For Jobs Status Report:**
  - Verify you have jobs with status 'in_progress', 'ready_to_bill', or 'billed'
  - Check that the jobs table is accessible

### Wrong Time?
The schedule is set for Monday 8:00 AM CST (14:00 UTC). To adjust:
- **7:00 AM CST:** Change cron to `0 13 * * 1`
- **9:00 AM CST:** Change cron to `0 15 * * 1`
- **Note:** During daylight saving time (CDT), times shift by 1 hour

### Function Not Working?
- Check Supabase Dashboard → Edge Functions → Logs
- Verify environment variables are set
- Test with curl commands first
- Check that your Postmark account is active

---

## 💡 Customization Tips

### Change Email Recipients
To send to different people or multiple recipients:

1. **Single Recipient:**
   - Set `WEEKLY_REPORT_EMAIL` environment variable in Supabase

2. **Multiple Recipients:**
   - Edit the edge function files
   - Change the `To:` field to include comma-separated emails:
     ```typescript
     To: 'email1@company.com, email2@company.com, email3@company.com',
     ```

### Change Report Time
Edit `.github/workflows/weekly-reports.yml`:
```yaml
schedule:
  - cron: '0 13 * * 1'  # Monday at 7:00 AM CST
```

### Change Report Frequency
Edit the cron schedule:
- **Daily:** `0 14 * * *`
- **Bi-weekly:** `0 14 * * 1/2`
- **Monthly (1st Monday):** `0 14 1-7 * 1`

### Customize Email Content
Edit the HTML/text templates in:
- `supabase/functions/weekly-po-report/index.ts`
- `supabase/functions/weekly-jobs-status-report/index.ts`

Then redeploy through the Supabase Dashboard:
1. Go to Edge Functions
2. Click on the function name
3. Click **Edit**
4. Paste the updated code
5. Click **Deploy**

---

## 📅 Summary of All Your Automated Emails

After completing this setup, you'll have:

| Report | Frequency | Time (CST) | Recipients |
|--------|-----------|------------|------------|
| Daily Review Notification | Daily | 12:00 PM | REVIEW_NOTIFICATION_EMAIL |
| Weekly PO Report | Monday | 8:00 AM | WEEKLY_REPORT_EMAIL |
| Weekly Jobs Status Report | Monday | 8:00 AM | WEEKLY_REPORT_EMAIL |
| Ready to Bill Notification | Event-triggered | Immediate | accounting@ampqes.com |

---

## 💰 Cost Breakdown

- **Supabase Edge Functions:** 500,000 invocations/month free (you'll use ~8/month)
- **Postmark:** 100 emails/month free tier (you'll use ~13/month)
- **GitHub Actions:** 2,000 minutes/month free (you'll use ~2 minutes/month)
- **Total:** $0/month

---

## ✅ Quick Start Checklist

- [ ] Deploy both edge functions to Supabase
- [ ] Verify environment variables are set (same as daily email)
- [ ] Test both functions manually with curl
- [ ] Verify GitHub Actions secrets are set
- [ ] Test the GitHub Actions workflow manually
- [ ] Wait for first Monday at 8am to verify automatic execution
- [ ] Check Postmark dashboard for delivery confirmation

---

## 🎉 Next Steps

1. **Monitor the first week** to ensure reports are sent correctly
2. **Adjust timing** if needed based on your workflow
3. **Customize email content** if you want different formatting
4. **Add more recipients** if others need to receive these reports
5. **Set up notifications** in GitHub if workflows fail

---

**Need Help?** Check the logs in:
- **Supabase Dashboard** → Edge Functions → Logs
- **GitHub Actions** → Workflow runs → Click on a run to see details
- **Postmark Dashboard** → Activity → Search for your emails

---

**Questions or Issues?**
- Review the daily email setup guide (DAILY_EMAIL_SETUP.md) for similar patterns
- Check Supabase function logs for detailed error messages
- Verify all environment variables are correctly set

