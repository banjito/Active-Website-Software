---
title: Change orders
description: Extra scope, approved properly, without re-typing anything into QuickBooks.
keywords: [change order, extra work, scope change, additional, co]
---

Scope grows. A change order is how you capture that growth so it gets paid for.

## The rule

ampOS is the source of truth for change orders. You create them here, approve them here, and the approved ones push out to QuickBooks, not the other way around.

::: warning
Do not create a change order directly in QuickBooks. The sync runs one way, so a QuickBooks-side change order is invisible to the app and will not appear in job profitability.
:::

## Creating one

1. Open the job and find the **change orders** section.
2. Click **New change order**.
3. Describe the additional scope. Be specific; this text is what the customer reads.
4. Enter the amount.
5. Save it as **Pending**.

## Pending versus approved

This distinction is the whole point of the feature.

| State | In job totals? | In QuickBooks? |
|---|---|---|
| **Pending** | No | No |
| **Approved** | Yes | Yes, as an Accepted Estimate |
| **Rejected** | No | No |

A pending change order is a request. It does not touch the quoted amount, it does not affect margin, and it does not exist as far as billing is concerned.

That is deliberate. Counting unapproved work as revenue is how companies convince themselves a job is profitable right up until the customer declines to pay for the extra.

## Approving one

Someone with approval permission moves it from pending to approved. At that moment:

- The amount is added to the job's quoted total.
- Profitability recalculates.
- The change order pushes to QuickBooks as an Accepted Estimate on the linked project.

## What "approved" should mean

Approved should mean the customer agreed, not that you are confident they will. If you approve on optimism, the margin number goes back to lying to you.

Get it in writing. An email is enough. Attach it to the job.

## Change orders and profitability

A job with three pending change orders and a lot of logged cost looks like it is bleeding. That is correct and useful: it is telling you there is unbilled work sitting out there.

If that number is uncomfortable, the answer is to go get the change orders approved, not to approve them yourself.

## Rejected change orders

Keep them. A rejected change order is a record that you asked and they said no, which is exactly what you want when the same conversation comes up at the end of the job.

## Where they show up

- On the job, in the change orders section
- In the job's profitability totals, once approved
- In QuickBooks, once approved, against the linked project
- In deliverables, if the scope change affects what was tested
