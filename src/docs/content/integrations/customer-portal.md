---
title: Customer portal
description: A read-only sign-in where customers download their own reports.
keywords: [customer portal, client access, invite, download, read only]
---

The customer portal is a separate, customer-facing sign-in. Customers see the jobs they gave you and download the reports for them.

It is **read-only**. Customers cannot change anything, and they cannot see anything belonging to another customer.

## What a customer can see

- Their own jobs
- The published reports for those jobs
- Downloads of those reports

## What they cannot see

- Any other customer's anything
- Your costs, margins, or internal notes
- Job notes, after-action reports, or internal discussion
- Reports that have not been published to the portal

::: note
Isolation between customers is enforced at the database level, not by hiding things in the interface. A customer cannot reach another customer's data even by manipulating a URL.
:::

## Inviting a customer

1. Make sure the person exists as a **contact** on the customer record. See [Customers and contacts](/docs/jobs/customers-and-contacts).
2. Send them a portal invite from the staff app.
3. They receive an email with a link.
4. They follow it, set a password, and their login is linked to that customer.

Invite **people**, not shared mailboxes. A login shared around a facilities department is a login nobody is accountable for and nobody can revoke cleanly.

## What gets published

Only reports published to the portal are visible. Approving a report does not automatically expose it; publishing is a separate, deliberate step.

::: warning
This is the control that matters. Approval means the report is correct; publishing means the customer should have it. Keep them separate, especially on jobs where some findings go through a conversation before they go through a portal.
:::

## The portal versus emailing a deliverable

Different things, and both have their place.

| | Portal | Emailed deliverable |
|---|---|---|
| **What they get** | Individual reports | The full package with cover letter and summary |
| **When** | Any time, self-service | When you send it |
| **Best for** | Repeat customers who want records on demand | The formal handover of a completed job |

The portal does not replace sending a deliverable. A finished job still gets a package and a covering conversation. The portal is for the customer who wants last year's transformer report at 4pm on a Friday without emailing anyone.

## Turning it on

Portal availability is instance-level configuration. If it is not enabled for your company, ask whoever handles deployment.

## Removing access

Revoke a customer user when someone leaves that company. Their access ends immediately; nothing they downloaded previously is affected.

Add this to the list of things you check when a customer contact changes jobs. It is easy to forget, and portal logins tend to outlive the people they were issued to.
