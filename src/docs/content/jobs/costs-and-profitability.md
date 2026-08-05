---
title: Costs and profitability
description: What a job was quoted at, what it actually cost, and where the difference went.
keywords: [profit, margin, cost, labor, budget, actuals, tm, expenses]
---

The profitability tab answers one question: are we making money on this job?

## Quoted versus actual

Two numbers drive everything.

- **Quoted.** What you told the customer. It comes across from the won opportunity, or you enter it on the job.
- **Actual.** What the job has cost so far.

Margin is the gap. It updates as costs are logged, so you can see a job going sideways while there is still time to do something about it.

::: warning
A job with no quoted amount shows infinite margin, which is meaningless. If the quoted amount is blank, profitability is not telling you anything. Fill it in.
:::

## Where costs come from

| Source | What it captures |
|---|---|
| **Labor** | Technician hours against the job |
| **T&M expenses** | Mileage, per diem, lodging, purchased materials |
| **Purchase orders** | Vendor costs tied to the job |
| **Change orders** | Approved additional scope, added to both sides |

## Logging T&M expenses

Open the job's **T&M expenses** tab and add entries as they happen, not at the end of the month.

Each entry has a date, a type, an amount, and a note. For time and materials jobs, these entries are what gets billed, so the note matters: "2 techs, 6 hrs, breaker retest after customer repair" is billable; "labor" invites an argument.

## The profitability dashboard

Beyond a single job, the profitability dashboard rolls up across jobs, customers, and divisions. Use it to find:

- Which customers are consistently unprofitable
- Which kinds of work you underquote
- Which divisions are carrying which

## How change orders affect margin

Approved change orders add to both the quoted amount and the expected cost, so the margin stays honest as scope grows.

Pending change orders **do not** count toward anything. Work you have done but not gotten approved shows as pure cost with no revenue against it, and the job looks like it is losing money. Until that change order is approved, it is.

See [Change orders](/docs/jobs/change-orders).

## QuickBooks actuals

If QuickBooks is connected, real invoiced and paid amounts flow back in and appear alongside the app's numbers. That is the difference between "what we think this job cost" and "what actually hit the books."

See [QuickBooks Online](/docs/integrations/quickbooks).

## Who can see this

Cost and margin data is permission-gated. Field technicians typically cannot see it. If the profitability tab is missing for you, that is a role setting.

## Reading the numbers honestly

A few things that make profitability lie:

- **Labor not logged.** A job with no hours against it looks wildly profitable.
- **Expenses logged late.** End-of-month batches make a job look great for three weeks and terrible on the last day.
- **Blank quoted amount.** See above.
- **Unapproved change orders.** Cost without revenue.

The tab is only as good as what goes into it, and the fix is habit, not software.
