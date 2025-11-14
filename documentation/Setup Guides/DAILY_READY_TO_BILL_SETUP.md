# Daily Ready-to-Bill Report Setup

This guide will help you set up a daily email report that sends a summary of all jobs ready for billing at 8:00 AM CST to accounting@ampqes.com.

## 🎯 What It Does

- **Runs Daily** at 8:00 AM Central Time
- **Lists All Jobs** with status "ready_to_bill"
- **Sends to** accounting@ampqes.com
- **Includes** job details, customer info, fireteam lead, and direct links
- **Handles Empty Days** gracefully (sends "No jobs ready" message)

## 📊 Difference from Instant Notification

This is **complementary** to the instant ready-to-bill notification:

| Feature | Instant Notification | Daily Report |
|---------|---------------------|--------------|
| **When** | Immediately when status changes | Every day at 8 AM |
| **What** | Single job that just changed | All jobs currently ready to bill |
| **Purpose** | Alert of new ready-to-bill job | Daily summary of all pending jobs |

## 🚀 Step 1: Deploy the Edge Function

### Option A: Using Supabase Dashboard (Recommended)

1. Go to your **Supabase Dashboard**
2. Navigate to **Edge Functions**
3. Click **Create a new function**
4. Name: `daily-ready-to-bill-report`
5. Copy the contents from `supabase/functions/daily-ready-to-bill-report/index.ts`
6. Paste into the editor
7. Click **Deploy**

### Option B: Using Supabase CLI

```bash
# Install Supabase CLI if you haven't already
brew install supabase/tap/supabase

# Login to Supabase
supabase login

# Deploy the function
supabase functions deploy daily-ready-to-bill-report
```

## 🔧 Step 2: Environment Variables

The daily report uses the same environment variables as your other email functions:

### Required Variables (should already be set):
- **POSTMARK_API_KEY**: Your Postmark API key
- **POSTMARK_FROM**: Sender email (defaults to john.chambers@ampqes.com)
- **SUPABASE_URL**: Your Supabase project URL
- **SUPABASE_SERVICE_ROLE_KEY**: Your service role key

### To verify variables:
1. Go to **Supabase Dashboard**
2. **Project Settings** → **Edge Functions** → **Environment Variables**
3. Confirm these variables exist (they should from your other email setups)

## 🕐 Step 3: Set Up GitHub Actions Schedule

### Add GitHub Secrets (if not already set):

1. Go to your GitHub repository
2. **Settings** → **Secrets and Variables** → **Actions**
3. Add these secrets:
   - `SUPABASE_URL`: Your Supabase project URL
   - `SUPABASE_SERVICE_ROLE_KEY`: Your service role key

### Deploy the Workflow:

The workflow file is already created at `.github/workflows/daily-ready-to-bill-report.yml`

1. Commit and push the workflow file to GitHub
2. The workflow will automatically run daily at 8 AM CST
3. You can also trigger it manually from the **Actions** tab

```bash
# Commit the workflow
git add .github/workflows/daily-ready-to-bill-report.yml
git commit -m "Add daily ready-to-bill report workflow"
git push
```

## 🧪 Step 4: Test the System

### Method 1: View What Would Be Sent (No Email)

```bash
# Set environment variables
export SUPABASE_URL="https://your-project.supabase.co"
export SUPABASE_SERVICE_ROLE_KEY="your-service-role-key"

# See what would be included in the daily report
node scripts/test-daily-ready-to-bill-report.js
```

### Method 2: Send Test Email

```bash
# Actually send the email
node scripts/test-daily-ready-to-bill-report.js --send
```

### Method 3: Test via Supabase Dashboard

1. Go to **Edge Functions** → `daily-ready-to-bill-report`
2. Click **Invoke**
3. Use request body: `{}`
4. Click **Run**
5. Check accounting@ampqes.com for the email

### Method 4: Manual GitHub Actions Trigger

1. Go to your GitHub repository
2. Click the **Actions** tab
3. Select "Daily Ready-to-Bill Report"
4. Click **Run workflow**
5. Check email for results

## 📧 Email Content

The daily report includes:

### When Jobs Exist:
- **Header**: Count of ready-to-bill jobs
- **Table** with columns:
  - Job Number
  - Title
  - Customer
  - Fireteam Lead
  - Last Updated
  - View Link
- **Action Required** message
- Professional AMP branding

### When No Jobs Exist:
- Clean message: "No jobs are currently ready for billing"
- Still sent daily so you know the system is working

## 📅 Schedule Details

### Timing:
- **Cron Expression**: `0 14 * * *`
- **UTC Time**: 2:00 PM (14:00)
- **CST Time**: 8:00 AM
- **CDT Time**: 9:00 AM (during daylight saving)

### Frequency:
- Runs **every day** at the scheduled time
- ~30 emails per month
- Well within Postmark's free tier

## 🔍 Troubleshooting

### No Email Received?

1. **Check Function Logs**:
   - Supabase Dashboard → Edge Functions → daily-ready-to-bill-report
   - View the logs tab

2. **Check GitHub Actions**:
   - Repository → Actions tab
   - View the workflow run logs

3. **Verify Environment Variables**:
   ```bash
   # Test the function directly
   node scripts/test-daily-ready-to-bill-report.js
   ```

4. **Check Postmark Dashboard**:
   - Go to https://account.postmarkapp.com
   - View activity to see if email was sent

### Empty Report Even Though Jobs Exist?

1. **Verify Job Status**:
   - Make sure jobs have `status = 'ready_to_bill'` (exact spelling)
   - Check the `neta_ops.jobs` table

2. **Test Data Query**:
   ```bash
   # Run test script to see what data is found
   node scripts/test-daily-ready-to-bill-report.js
   ```

3. **Check Permissions**:
   - Ensure service role key has access to `neta_ops.jobs`
   - Verify RLS policies allow reading

### Wrong Schedule Time?

1. **Remember Time Zones**:
   - The cron uses UTC time
   - CST is UTC-6, CDT is UTC-5
   
2. **Adjust Workflow**:
   ```yaml
   # Edit .github/workflows/daily-ready-to-bill-report.yml
   schedule:
     - cron: '0 15 * * *'  # For 9 AM CST
   ```

3. **Use Cron Tools**:
   - https://crontab.guru to verify expressions

## 🎛️ Customization

### Change Email Time:

Edit `.github/workflows/daily-ready-to-bill-report.yml`:

```yaml
schedule:
  # 7 AM CST = 1 PM UTC
  - cron: '0 13 * * *'
  
  # 9 AM CST = 3 PM UTC
  - cron: '0 15 * * *'
```

### Change Recipient:

Edit `supabase/functions/daily-ready-to-bill-report/index.ts`:

```typescript
const toEmail = 'newemail@company.com'
```

Then redeploy the function.

### Add Multiple Recipients:

```typescript
const toEmail = 'accounting@ampqes.com, manager@ampqes.com'
```

### Customize Email Content:

Edit the `emailHtml` and `emailText` variables in the function file, then redeploy.

## ✅ Success Checklist

Once everything is set up correctly:

- [ ] Edge function deployed to Supabase
- [ ] Environment variables configured
- [ ] GitHub secrets added
- [ ] Workflow file committed and pushed
- [ ] Test email sent successfully
- [ ] accounting@ampqes.com receives the email
- [ ] Email content looks correct
- [ ] Schedule is running automatically

## 📚 Related Documentation

- `READY_TO_BILL_EMAIL_SETUP.md` - Instant notification setup
- `AUTOMATED_EMAILS_REFERENCE.md` - Complete email system reference
- `WEEKLY_REPORTS_SETUP.md` - Weekly reports setup

---

**Setup Complete!** 🎉

Your accounting team will now receive a daily summary of all ready-to-bill jobs every morning at 8 AM Central Time.

---

**Last Updated:** October 21, 2025

