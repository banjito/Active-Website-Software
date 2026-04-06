# Setup Guides

Configuration and setup instructions for automated systems and notifications.

**Last Updated**: December 2024

---

## 📧 Automated Email System

The ampOS system includes comprehensive automated email notifications. Start with the reference guide for an overview of all emails.

### Quick Reference
| Document | Purpose |
|----------|---------|
| **[AUTOMATED_EMAILS_REFERENCE.md](./AUTOMATED_EMAILS_REFERENCE.md)** | Complete reference for all automated emails |
| [DAILY_EMAIL_SETUP.md](./DAILY_EMAIL_SETUP.md) | Daily review notification |
| [DAILY_READY_TO_BILL_SETUP.md](./DAILY_READY_TO_BILL_SETUP.md) | Daily ready-to-bill report |
| [READY_TO_BILL_EMAIL_SETUP.md](./READY_TO_BILL_EMAIL_SETUP.md) | Instant billing notification |
| [WEEKLY_REPORTS_SETUP.md](./WEEKLY_REPORTS_SETUP.md) | Weekly PO and jobs reports |
| [WEEKLY_REPORTS_QUICK_START.md](./WEEKLY_REPORTS_QUICK_START.md) | Quick start for weekly reports |

---

## 📊 Email Schedule Overview

### Daily Emails
| Time (CST) | Email | Purpose |
|------------|-------|---------|
| 8:00 AM | Daily Ready-to-Bill Report | Summary of jobs ready for billing |
| 12:00 PM | Daily Review Notification | Reports ready for review |

### Weekly Emails (Monday)
| Time (CST) | Email | Purpose |
|------------|-------|---------|
| 8:00 AM | Weekly PO Report | Purchase orders summary |
| 8:00 AM | Weekly Jobs Status Report | Jobs grouped by status |

### Event-Triggered Emails
| Trigger | Email | Purpose |
|---------|-------|---------|
| Job status → ready_to_bill | Ready to Bill Notification | Instant alert to accounting |

---

## 🛠️ Required Components

### Supabase Edge Functions
Located in `/supabase/functions/`:

| Function | Email |
|----------|-------|
| `daily-review-notification` | Daily review |
| `daily-ready-to-bill-report` | Daily billing report |
| `ready-to-bill-notification` | Instant billing alert |
| `weekly-po-report` | Weekly PO |
| `weekly-jobs-status-report` | Weekly jobs status |

### GitHub Actions
Located in `/.github/workflows/`:

| Workflow | Schedule |
|----------|----------|
| `daily-review-notification.yml` | Daily at 6 PM UTC (12 PM CST) |
| `daily-ready-to-bill-report.yml` | Daily at 2 PM UTC (8 AM CST) |
| `weekly-reports.yml` | Monday at 2 PM UTC (8 AM CST) |

---

## 🔧 Environment Variables

### Supabase Edge Functions

Set in Supabase Dashboard → Project Settings → Edge Functions:

| Variable | Required | Purpose |
|----------|----------|---------|
| `POSTMARK_API_KEY` | ✅ | Postmark email API key |
| `POSTMARK_FROM` | No | Sender email (default: john.chambers@ampqes.com) |
| `REVIEW_NOTIFICATION_EMAIL` | ✅ | Daily review recipient |
| `WEEKLY_REPORT_EMAIL` | No | Weekly reports recipient |

### GitHub Actions

Set in Repository → Settings → Secrets → Actions:

| Secret | Purpose |
|--------|---------|
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key for API calls |

---

## 🧪 Testing

### Test Scripts
Located in `/scripts/`:

```bash
# Test data queries (no email sent)
node scripts/test-review-data.js
node scripts/test-daily-ready-to-bill-report.js
node scripts/test-weekly-po-data.js
node scripts/test-weekly-jobs-data.js

# Test actual email sending
node scripts/test-review-notification.js
node scripts/test-weekly-reports.js
```

### Environment Setup for Testing

```bash
export SUPABASE_URL="https://your-project.supabase.co"
export SUPABASE_SERVICE_ROLE_KEY="your-service-role-key"
```

---

## 🚀 Deployment Steps

### 1. Deploy Edge Functions

In Supabase Dashboard:
1. Go to Edge Functions
2. Create new function for each
3. Paste code from `/supabase/functions/[name]/index.ts`
4. Deploy

### 2. Set Environment Variables

In Supabase Dashboard:
1. Project Settings → Edge Functions
2. Add environment variables

### 3. Enable GitHub Actions

1. Ensure workflows are in `.github/workflows/`
2. Add repository secrets
3. Workflows run automatically on schedule

### 4. Verify

1. Check GitHub Actions tab for scheduled runs
2. Check Postmark dashboard for sent emails
3. Check Supabase function logs for errors

---

## 📝 Other Setup Guides

### Job Notifications
- **[job-notifications.md](./job-notifications.md)** - Job notification system setup

### QuickBooks Integration
- **[QUICKBOOKS_SETUP_CHECKLIST.md](./QUICKBOOKS_SETUP_CHECKLIST.md)** ⭐ **START HERE** - Step-by-step setup checklist
- **[QUICKBOOKS_SETUP.md](./QUICKBOOKS_SETUP.md)** - QuickBooks API integration setup and configuration
- **[SECURITY_GUIDE.md](./SECURITY_GUIDE.md)** - Security best practices for environment variables
- **[NETLIFY_SECRETS_EXPLAINED.md](./NETLIFY_SECRETS_EXPLAINED.md)** - Understanding Netlify environment variable security

---

## 💰 Cost Summary

All services stay within free tiers:

| Service | Free Tier | Expected Usage |
|---------|-----------|----------------|
| Supabase Edge Functions | 500K invocations/month | ~200/month |
| Postmark | 100 emails/month | ~80/month |
| GitHub Actions | 2,000 minutes/month | ~15 min/month |

---

## 🔍 Troubleshooting

### Emails Not Sending

1. ✅ Check Postmark dashboard for delivery status
2. ✅ Verify environment variables in Supabase
3. ✅ Check Supabase function logs
4. ✅ Verify recipient email addresses

### GitHub Actions Not Running

1. ✅ Check workflow file syntax
2. ✅ Verify secrets are set
3. ✅ Check Actions tab for error logs
4. ✅ Verify cron expression timing

### Empty Reports

1. ✅ Run test data scripts to verify data exists
2. ✅ Check query criteria (dates, statuses)
3. ✅ Verify RLS policies allow service role access

---

## 📚 Related Documentation

- `/supabase/functions/` - Edge function source code
- `/.github/workflows/` - GitHub Actions workflows
- `/scripts/` - Test scripts
- `/documentation/Feature Documentation/` - Feature docs
