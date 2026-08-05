---
title: Jobs overview
description: The job is the center of ampOS. Here is what one holds and how to work the list.
keywords: [jobs, job list, work orders, projects]
---

Everything in ampOS attaches to a job. Reports, photos, costs, expenses, change orders, deliverables, and the invoice all hang off the same record.

## What a job holds

| Part | What it is |
|---|---|
| **Job number** | Auto-generated identifier like `JOB-0142`. Never edited by hand. |
| **Customer** | The company paying. |
| **Site** | The physical location the work happens. |
| **Scope** | What you agreed to do, in the description field. |
| **Dates** | Start date, due date. |
| **Division** | Which crew owns it. |
| **Priority** | Low, medium, or high. |
| **Status** | Where it is in the lifecycle. See [Job statuses](/docs/jobs/job-statuses). |
| **Assets** | The equipment tested, each with a report. |
| **Deliverables** | The packages sent to the customer. |
| **Money** | Quoted amount, costs, expenses, change orders, margin. |

## The jobs list

Two lists get you to any job:

- **Jobs** (`/jobs`) shows your division's jobs.
- **All jobs** (`/all-jobs`) shows every job in the company.

Both support the same tools.

### Filtering

Filter chips across the top narrow by status: `In progress`, `Pending`, `Completed`, `Billed`, or `All`. The totals above each chip show the dollar value sitting in that bucket, which is usually the fastest way to answer "how much work do we have out right now."

Below that you can filter by division, customer, and date range, and search by job number, title, or customer name.

::: tip
Your filters are saved and restored when you come back to the list, and they live in the URL. Paste that URL into a message and the other person sees the same filtered view.
:::

### Sorting

Click a column header to sort by it. Click again to reverse. Hold **Shift** and click a second header to sort by two columns at once, for example customer first, then due date.

## Creating a job

See [Creating a job](/docs/jobs/creating-a-job). The short version: click **New job**, pick a customer, give it a title, set the dates.

## Opening a job

Click any row. The job page opens on the **Overview** tab. See [The job page](/docs/jobs/the-job-page) for the tour.

## Jobs and opportunities

Jobs usually start life as sales opportunities. When an opportunity is won, it becomes a job and carries its quoted amount across, so profitability has something to measure against from day one.

You can also create a job directly. Do that for repeat maintenance work, warranty visits, and anything else that never went through the pipeline.

## What to read next

- [Creating a job](/docs/jobs/creating-a-job)
- [Job statuses](/docs/jobs/job-statuses): what each status means and who moves it
- [Costs and profitability](/docs/jobs/costs-and-profitability): where the money lives
