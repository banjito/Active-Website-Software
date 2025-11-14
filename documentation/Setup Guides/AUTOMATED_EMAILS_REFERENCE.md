# Automated Emails Reference Guide

Quick reference for all automated email notifications in the ampOS system.

---

## 📧 All Automated Emails

| Email Name | Trigger | Frequency | Time (CST) | Recipients | Status |
|------------|---------|-----------|------------|------------|--------|
| **Daily Review Notification** | Scheduled | Daily | 12:00 PM | REVIEW_NOTIFICATION_EMAIL | ✅ Active |
| **Daily Ready-to-Bill Report** | Scheduled | Daily | 8:00 AM | accounting@ampqes.com | 🆕 New |
| **Ready to Bill Notification** | Event (status change) | Immediate | On trigger | accounting@ampqes.com | ✅ Active |
| **Weekly PO Report** | Scheduled | Monday | 8:00 AM | WEEKLY_REPORT_EMAIL | 🆕 New |
| **Weekly Jobs Status Report** | Scheduled | Monday | 8:00 AM | WEEKLY_REPORT_EMAIL | 🆕 New |

---

## 📊 Email Details

### 1. Daily Review Notification
**Purpose:** Notify team when reports are ready for review

**Content:**
- List of reports with status "ready_for_review"
- Job details (number, title, customer)
- Count of reports per job

**Tech Details:**
- Function: `supabase/functions/daily-review-notification/index.ts`
- Schedule: GitHub Actions `.github/workflows/daily-review-notification.yml`
- Cron: `0 18 * * *` (Daily at 6:00 PM UTC / 12:00 PM CST)

**Setup Guide:** `DAILY_EMAIL_SETUP.md`

---

### 2. Ready to Bill Notification
**Purpose:** Alert accounting when a job is marked ready for billing

**Content:**
- Job number and title
- Customer information
- Fireteam lead
- Direct link to job details

**Tech Details:**
- Function: `supabase/functions/ready-to-bill-notification/index.ts`
- Trigger: Called from frontend when job status changes to "ready_to_bill"
- Recipient: Hardcoded to accounting@ampqes.com

**Setup Guide:** `READY_TO_BILL_EMAIL_SETUP.md`

---

### 3. Daily Ready-to-Bill Report (New!)
**Purpose:** Daily summary of all jobs currently ready for billing

**Content:**
- List of all jobs with status "ready_to_bill"
- Job number, title, customer
- Fireteam lead and last update date
- Direct links to each job
- Total count of ready-to-bill jobs

**Tech Details:**
- Function: `supabase/functions/daily-ready-to-bill-report/index.ts`
- Schedule: GitHub Actions `.github/workflows/daily-ready-to-bill-report.yml`
- Cron: `0 14 * * *` (Daily at 2:00 PM UTC / 8:00 AM CST)
- Recipient: accounting@ampqes.com

**Difference from Ready to Bill Notification:**
- Instant notification: Sent immediately when ONE job status changes
- Daily report: Sent once per day with ALL ready-to-bill jobs

**Test Script:** `scripts/test-daily-ready-to-bill-report.js`

---

### 4. Weekly PO Report
**Purpose:** Weekly summary of all purchase orders entered

**Content:**
- All POs entered in the past 7 days
- Job number, title, customer
- PO value and total value
- Upload date/time

**Tech Details:**
- Function: `supabase/functions/weekly-po-report/index.ts`
- Schedule: GitHub Actions `.github/workflows/weekly-reports.yml`
- Cron: `0 14 * * 1` (Monday at 2:00 PM UTC / 8:00 AM CST)

**Setup Guide:** `WEEKLY_REPORTS_SETUP.md`

---

### 5. Weekly Jobs Status Report
**Purpose:** Weekly summary of jobs by status

**Content:**
- All jobs with status: In Progress, Ready to Bill, or Billed
- Grouped by status with color-coded badges
- Job details, customer, fireteam lead
- Summary statistics

**Tech Details:**
- Function: `supabase/functions/weekly-jobs-status-report/index.ts`
- Schedule: GitHub Actions `.github/workflows/weekly-reports.yml`
- Cron: `0 14 * * 1` (Monday at 2:00 PM UTC / 8:00 AM CST)
- Runs after Weekly PO Report

**Setup Guide:** `WEEKLY_REPORTS_SETUP.md`

---

## 🔧 Environment Variables

All email functions use these shared environment variables:

| Variable | Purpose | Required | Default |
|----------|---------|----------|---------|
| `POSTMARK_API_KEY` | Postmark email service API key | ✅ Yes | - |
| `POSTMARK_FROM` | Sender email address | No | john.chambers@ampqes.com |
| `REVIEW_NOTIFICATION_EMAIL` | Daily review recipient | Yes | - |
| `WEEKLY_REPORT_EMAIL` | Weekly reports recipient | No | Falls back to REVIEW_NOTIFICATION_EMAIL |
| `SUPABASE_URL` | Supabase project URL | ✅ Yes | - |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key | ✅ Yes | - |

**Where to set these:**
- Supabase: Dashboard → Project Settings → Edge Functions → Environment Variables
- GitHub Actions: Repository → Settings → Secrets and Variables → Actions

---

## 🧪 Testing Commands

### Test Data (See what would be sent)
```bash
# Set environment variables
export SUPABASE_URL="https://your-project.supabase.co"
export SUPABASE_SERVICE_ROLE_KEY="your-service-role-key"

# Test daily review data
node scripts/test-review-data.js

# Test daily ready-to-bill report data
node scripts/test-daily-ready-to-bill-report.js

# Test weekly PO data
node scripts/test-weekly-po-data.js

# Test weekly jobs status data
node scripts/test-weekly-jobs-data.js
```

### Test Functions (Send actual emails)
```bash
# Test daily review notification
node scripts/test-review-notification.js

# Test daily ready-to-bill report (use --send flag to actually send)
node scripts/test-daily-ready-to-bill-report.js
node scripts/test-daily-ready-to-bill-report.js --send

# Test both weekly reports
node scripts/test-weekly-reports.js

# Or use curl
curl -X POST \
  -H "Authorization: Bearer YOUR_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -d '{}' \
  "https://your-project.supabase.co/functions/v1/daily-ready-to-bill-report"
```

---

## 🚀 Deployment

Deploy functions manually through the Supabase Dashboard:

1. Go to your Supabase Dashboard
2. Navigate to **Edge Functions**
3. Click **Create a new function** (or edit existing)
4. Name the function (e.g., `weekly-po-report`)
5. Copy the code from the corresponding file:
   - `supabase/functions/daily-review-notification/index.ts`
   - `supabase/functions/daily-ready-to-bill-report/index.ts`
   - `supabase/functions/ready-to-bill-notification/index.ts`
   - `supabase/functions/weekly-po-report/index.ts`
   - `supabase/functions/weekly-jobs-status-report/index.ts`
6. Paste into the editor
7. Click **Deploy**

---

## 📅 Schedule Overview

### Weekly View
```
Monday:
  8:00 AM CST - Weekly PO Report
  8:00 AM CST - Weekly Jobs Status Report

Daily:
  8:00 AM CST - Daily Ready-to-Bill Report
  12:00 PM CST - Daily Review Notification

As Needed:
  Immediate - Ready to Bill Notification (when job status changes)
```

### Monthly Email Count
- Daily Review: ~30 emails/month
- Daily Ready-to-Bill Report: ~30 emails/month
- Weekly Reports: ~8 emails/month (2 x 4 weeks)
- Ready to Bill (instant): Variable (based on job completions)
- **Total: ~70-80 emails/month** (within Postmark's 100/month free tier)

---

## 🔍 Monitoring & Logs

### Check Email Delivery
1. **Postmark Dashboard**
   - Go to https://account.postmarkapp.com
   - Activity → Search for emails
   - View delivery status, opens, bounces

2. **Supabase Function Logs**
   - Dashboard → Edge Functions
   - Click on function name
   - View logs tab

3. **GitHub Actions**
   - Repository → Actions tab
   - Click on workflow run
   - View job logs

---

## 🛠️ Common Modifications

### Change Email Recipients

**Single Recipient:**
Set environment variable in Supabase:
```
WEEKLY_REPORT_EMAIL=newemail@company.com
```

**Multiple Recipients:**
Edit the edge function file and change the `To:` line:
```typescript
To: 'email1@company.com, email2@company.com',
```

### Change Schedule Times

Edit `.github/workflows/[workflow-name].yml`:
```yaml
schedule:
  - cron: '0 15 * * 1'  # Monday at 9:00 AM CST
```

### Customize Email Content

1. Edit the function file in `supabase/functions/[function-name]/index.ts`
2. Modify the `emailHtml` and `emailText` variables
3. Redeploy: `supabase functions deploy [function-name]`

---

## 💡 Troubleshooting

### No Emails Received?
1. ✅ Check Postmark dashboard for delivery status
2. ✅ Verify environment variables are set correctly
3. ✅ Check Supabase function logs for errors
4. ✅ Confirm email address is correct and not blocking

### Empty Report?
1. ✅ Run test data scripts to see what data exists
2. ✅ Verify the criteria (date ranges, status values)
3. ✅ Check database permissions and RLS policies

### Wrong Schedule?
1. ✅ Check GitHub Actions workflow file
2. ✅ Remember: CST is UTC-6, CDT is UTC-5
3. ✅ Use https://crontab.guru to verify cron expressions

### Function Errors?
1. ✅ Check Supabase function logs for detailed errors
2. ✅ Test locally with test scripts first
3. ✅ Verify all required environment variables are set
4. ✅ Check that database tables are accessible

---

## 📚 Documentation Files

- `DAILY_EMAIL_SETUP.md` - Daily review notification setup
- `READY_TO_BILL_EMAIL_SETUP.md` - Ready to bill notification setup
- `WEEKLY_REPORTS_SETUP.md` - Weekly reports setup (new)
- `AUTOMATED_EMAILS_REFERENCE.md` - This file

---

## 💰 Cost Summary

| Service | Free Tier | Current Usage | Cost |
|---------|-----------|---------------|------|
| Supabase Edge Functions | 500K invocations/month | ~190/month | $0 |
| Postmark | 100 emails/month | ~70-80/month | $0 |
| GitHub Actions | 2,000 minutes/month | ~15 minutes/month | $0 |
| **Total** | - | - | **$0/month** |

---

**Last Updated:** October 21, 2025

For detailed setup instructions, see the individual setup guide files listed above.

