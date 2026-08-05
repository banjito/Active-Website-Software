---
title: Creating a job
description: Every field on the new-job form, what it does, and which ones you cannot change later.
keywords: [new job, add job, create, job number]
---

## Before you start

You need the customer to already exist in ampOS. If they do not, create the customer first. See [Customers and contacts](/docs/jobs/customers-and-contacts).

## Creating one

1. Go to **Jobs**, or to your division's jobs page.
2. Click **New job**.
3. Fill in the form (fields below).
4. Click **Create job**.

The job opens immediately with its new job number.

## The fields

### Customer (required)

Pick from the dropdown. This drives billing, the customer portal, and which contacts are available.

::: warning
Changing the customer after reports exist is messy. Report headers and any generated documents carry the old customer name until they are regenerated. Get this right the first time.
:::

### Title (required)

A short description of the work. This is what shows in lists, on dashboards, and in the deliverable's cover letter.

Good titles say what and where:

- `Annual switchgear PM, Building 4`
- `Acceptance testing, new 2500kVA substation`
- `Emergency breaker replacement, MCC-2`

Bad titles are ones you cannot tell apart six months later: `Testing`, `Service call`, `PM`.

### Description

The scope. Write what you agreed to do. This is the text people read when they ask "wait, are we supposed to be testing the relays too?"

Paste the scope from the proposal if there is one. It costs you nothing and settles arguments later.

### Start date

Defaults to today. Change it if the work starts later.

### Due date

When the customer expects the deliverable. This drives SLA tracking and the overdue counts on dashboards. Leaving it blank means the job never shows up as late, which sounds convenient right up until it is not.

### Priority

`Low`, `Medium`, or `High`. Affects sort order and dashboard highlighting. It does not change any deadline math.

### Division

Which crew owns the job. If you created the job from a division page, this is already set. See [Portals and divisions](/docs/getting-started/portals-and-divisions).

## What happens automatically

When the job is created, ampOS:

- **Assigns the job number.** Sequential, like `JOB-0142`. You cannot pick or edit it.
- **Attaches default files.** Any documents your company has configured as job defaults (safety forms, JHA templates, standard checklists) are copied onto the new job.
- **Sets status to pending.**

::: note
If you see "Job created but some default files could not be added," the job is fine. One of the default file templates could not be copied. Tell an administrator; you do not need to redo anything.
:::

## Creating a job from a won opportunity

The better path when the work came through sales. Open the opportunity, mark it won, and choose to create a job from it. The customer, title, scope, and quoted amount all carry across, which means profitability works from the start.

See [Opportunities](/docs/sales/opportunities).

## After the job exists

Three things are worth doing right away:

1. **Set the site** so the crew knows where to go. See [Sites](/docs/jobs/sites).
2. **Add the assets** you expect to test, so reports can be created against them. See [Assets](/docs/jobs/assets).
3. **Schedule it** so it lands on someone's calendar. See [Scheduling](/docs/jobs/scheduling).
