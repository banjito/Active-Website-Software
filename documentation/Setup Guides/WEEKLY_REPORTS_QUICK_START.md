# Weekly Reports - Quick Start Guide

Since you already have the daily email system working, setting up the weekly reports is super simple!

---

## ⚡ Quick Setup (5 Minutes)

### Step 1: Test the Data (Optional but Recommended)
See what data you have before sending emails:

```bash
# Set your environment variables (same ones you use for daily email)
export SUPABASE_URL="https://your-project.supabase.co"
export SUPABASE_SERVICE_ROLE_KEY="your-service-role-key"

# Test what POs would be in the report
node scripts/test-weekly-po-data.js

# Test what jobs would be in the report
node scripts/test-weekly-jobs-data.js
```

---

### Step 2: Deploy the Functions
Deploy manually through the Supabase Dashboard:

**For Weekly PO Report:**
1. Go to your Supabase Dashboard
2. Navigate to **Edge Functions**
3. Click **Create a new function**
4. Name: `weekly-po-report`
5. Copy the entire contents from `supabase/functions/weekly-po-report/index.ts`
6. Paste into the editor
7. Click **Deploy**

**For Weekly Jobs Status Report:**
1. In Edge Functions, click **Create a new function**
2. Name: `weekly-jobs-status-report`
3. Copy the entire contents from `supabase/functions/weekly-jobs-status-report/index.ts`
4. Paste into the editor
5. Click **Deploy**

That's it! The functions will use your existing Postmark and environment variables.

---

### Step 3: Test the Functions
Send test emails to make sure everything works:

**Option A: Use the Test Script**
```bash
# Set your environment variables
export SUPABASE_URL="https://your-project.supabase.co"
export SUPABASE_SERVICE_ROLE_KEY="your-service-role-key"

# Run the test
node scripts/test-weekly-reports.js
```

**Option B: Test from Supabase Dashboard**
1. Go to Edge Functions in Supabase
2. Click on `weekly-po-report`
3. Click the **Invoke** button to test
4. Check your email!
5. Repeat for `weekly-jobs-status-report`

**Option C: Use curl**
```bash
# Test PO Report
curl -X POST \
  -H "Authorization: Bearer YOUR_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -d '{}' \
  "https://your-project.supabase.co/functions/v1/weekly-po-report"

# Test Jobs Status Report  
curl -X POST \
  -H "Authorization: Bearer YOUR_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -d '{}' \
  "https://your-project.supabase.co/functions/v1/weekly-jobs-status-report"
```

✅ **Check your email!** You should receive both reports.

---

### Step 4: Set Who Receives the Reports (Optional)

By default, the reports go to the same email as your daily review notification. To change this:

1. Go to Supabase Dashboard
2. Project Settings → Edge Functions → Environment Variables
3. Add new variable:
   - **Name:** `WEEKLY_REPORT_EMAIL`
   - **Value:** `youremail@company.com` (e.g., accounting@ampqes.com)

---

### Step 5: Enable Automatic Scheduling

The GitHub Actions workflow is already created. Just verify your GitHub secrets:

1. Go to your GitHub repository
2. Settings → Secrets and Variables → Actions
3. Verify these exist (they should from your daily email):
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`

**Test the workflow manually:**
1. Go to Actions tab
2. Click "Weekly Reports"
3. Click "Run workflow" dropdown
4. Click green "Run workflow" button
5. Wait ~30 seconds, check your email

---

## 🎉 Done!

The reports will now automatically send every Monday at 8:00 AM CST.

---

## 📋 What You Get

### Weekly PO Report (Every Monday 8am)
- All purchase orders entered in the past 7 days
- Job details and customer info
- Total count and value

### Weekly Jobs Status Report (Every Monday 8am)  
- All jobs that are:
  - In Progress
  - Ready for Billing
  - Billed
- Grouped by status with summary stats

---

## 🔧 Quick Adjustments

### Change the Time
Edit `.github/workflows/weekly-reports.yml`:

```yaml
schedule:
  - cron: '0 13 * * 1'  # Monday 7am CST
  - cron: '0 15 * * 1'  # Monday 9am CST
```

### Change Recipients
Add environment variable `WEEKLY_REPORT_EMAIL` in Supabase

### Send to Multiple People
Edit the function files and change:
```typescript
To: 'email1@company.com, email2@company.com',
```

---

## 📊 Monitor

- **Postmark Dashboard:** See delivery status
- **Supabase Logs:** Edge Functions → Click function → Logs
- **GitHub Actions:** Actions tab → View workflow runs

---

## 🆘 Issues?

### "No data" emails?
- Normal if no POs entered or no jobs in those statuses
- Run test scripts to see what data exists

### Emails not sending?
- Check Postmark dashboard for errors
- Verify environment variables in Supabase
- Check function logs for errors

### Wrong schedule?
- Remember CST is UTC-6
- Cron runs at 14:00 UTC = 8:00 AM CST

---

## 📚 Full Documentation

For complete details, see:
- `WEEKLY_REPORTS_SETUP.md` - Complete setup guide
- `docs/AUTOMATED_EMAILS_REFERENCE.md` - All email systems reference
- `DAILY_EMAIL_SETUP.md` - Your working daily email reference

---

**That's it!** 🚀

You now have 4 automated email systems:
1. ✅ Daily Review Notification (12pm daily)
2. ✅ Ready to Bill Notification (instant)  
3. 🆕 Weekly PO Report (Monday 8am)
4. 🆕 Weekly Jobs Status Report (Monday 8am)

All running automatically, all free tier, all using the same infrastructure you already have working.

