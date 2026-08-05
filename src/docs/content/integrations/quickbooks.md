---
title: QuickBooks Online
description: Linking jobs to QuickBooks projects, pushing change orders, and pulling real numbers back.
keywords: [quickbooks, qbo, accounting, sync, project, estimate, invoice]
---

The QuickBooks integration connects an ampOS job to a QuickBooks **project**, so real invoiced and paid amounts flow back into job profitability, and approved change orders flow out.

## Connecting

1. Go to **Admin → Integrations** (or **Admin → QuickBooks**).
2. Click connect and sign in to QuickBooks.
3. Authorize the connection.

You are returned to ampOS with the connection active.

::: note
This is a real connection to your live accounting system. Anything pushed to QuickBooks lands in your actual books.
:::

## How jobs link to projects

QuickBooks projects are named with the job number first, then the title:

```text
0142 - Annual switchgear PM, Building 4
```

Because the job number leads the name, ampOS can match automatically.

### Automatic matching

ampOS matches by the leading job number. Follow the naming convention in QuickBooks and jobs link themselves.

::: warning
Automatic matching only works when the project name **starts** with the job number. `Acme 0142 switchgear` will not match. Get the convention right in QuickBooks and this whole feature works quietly forever.
:::

Matching pages through the full project list, so it works for companies with well over a thousand projects.

### Linking manually

When automatic matching cannot find it, as with a legacy project or an odd name, link by hand. Paste the QuickBooks project URL or its ID into the job, and ampOS connects the two.

## What flows out: change orders

Approved change orders push to QuickBooks as **Accepted Estimates** against the linked project.

Only approved ones. Pending change orders do not touch QuickBooks and do not count toward job totals. See [Change orders](/docs/jobs/change-orders).

::: danger
Do not create change orders in QuickBooks. The sync is one way. A QuickBooks-side change order is invisible to ampOS, will not appear in job profitability, and will make the two systems disagree in a way nobody notices until a reconciliation.
:::

## What flows back: actuals

Invoiced and paid amounts come back from QuickBooks and appear alongside ampOS's own cost figures on the job.

That is the difference between *what we think this job cost* and *what actually hit the books*, and it is what makes [profitability](/docs/jobs/costs-and-profitability) worth looking at.

Actuals are keyed by the QuickBooks **customer**, so a job whose customer is wrong on either side will not pick them up.

## The QuickBooks dashboard

**Admin → QuickBooks** pulls in customers, estimates, purchases, time activities, and profit-and-loss data for a company-level view.

Use it to spot mismatches: a customer that exists in one system and not the other, an estimate with no matching job.

## Troubleshooting

| Symptom | Cause |
|---|---|
| Actuals are stale | Connection token expired. Reconnect. |
| A job will not auto-match | Project name does not start with the job number. Rename it or link manually. |
| An approved change order did not appear in QB | The job is not linked to a project |
| Actuals show zero on a linked job | Customer mismatch between the two systems |
| Nothing syncs at all | Check **Admin → System health**, then reconnect |

## Reconnecting

Tokens expire on a schedule, regardless of activity. When they do, reconnect from the integration settings and sign in again. Nothing is lost; the links between jobs and projects survive.

Make this the first thing you try when numbers look stale.

## Before you go live

1. Agree the project naming convention with whoever manages QuickBooks, and write it down.
2. Confirm customers exist on both sides with matching names.
3. Link a test job and verify actuals come back.
4. Approve a small change order and confirm it appears as an accepted estimate.

Doing this on one job first is much cheaper than discovering a naming mismatch across two hundred.
