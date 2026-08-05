---
title: Job statuses
description: What each status means, who changes it, and what happens automatically when it changes.
keywords: [status, pending, in progress, ready to bill, billed, completed]
---

A job's status is the answer to "where is this?" It drives dashboards, filters, and several automatic emails, so keeping it honest matters more than it looks.

## The statuses

| Status | Means | Usually set by |
|---|---|---|
| **Pending** | Created, not started. | Set automatically on creation |
| **In progress** | Crew is working it, or reports are being written. | Project manager |
| **Ready to bill** | Work is done, deliverable is out, accounting can invoice. | Office admin or PM |
| **Billed** | Invoice sent. | Accounting |
| **Completed** | Fully closed out. | Accounting or PM |
| **On hold** | Paused, waiting on the customer, parts, or access. | Project manager |
| **Cancelled** | Not happening. | Project manager |

## Changing a status

Click the status in the job header and pick a new one. Your role decides which changes you are allowed to make.

## What happens automatically

Two status changes trigger real side effects.

### Moving to "Ready to bill"

An email goes out immediately to the billing group telling them the job is ready. This is the handoff from operations to accounting, and it is the reason "ready to bill" should mean it. A job marked ready with an unapproved report in it wastes somebody's morning.

The job also appears on the **daily ready-to-bill report** that goes out each morning.

### Moving to "Billed"

The job drops off the ready-to-bill list and stops appearing in open-work totals on dashboards.

## Status versus report status

These are different, and confusing them is the most common mistake in the app.

- **Job status** is about the whole job: pending, in progress, ready to bill.
- **Report status** is about one report: in progress, ready for review, approved.

A job can be `In progress` with every report already `Approved`. That just means the reports are done but the deliverable has not gone out. A job cannot honestly be `Ready to bill` while reports are still unapproved.

::: warning
Marking a job ready to bill does not check that its reports are approved. The system will let you do it. Run the **report audit** tab first.
:::

## On hold, and why to use it

Jobs stall. The customer will not give access, a part is on backorder, an engineer has not returned a drawing. Marking the job `On hold` instead of leaving it `In progress`:

- Takes it out of the crew's active work count so dashboards stay truthful.
- Stops it from silently aging into SLA violations for a delay that is not yours.

Add a note explaining why. Future you will not remember.

## Reopening a job

Change the status back. Nothing is deleted when a job is completed or billed. The reports, deliverables, and costs are all still there. Reopening is safe.
