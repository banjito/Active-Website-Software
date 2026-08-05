---
title: Integrations overview
description: What ampOS connects to, which way data flows, and what happens when a connection breaks.
keywords: [integration, connect, sync, external, api]
---

ampOS connects to a small number of outside systems on purpose. Every connection is somewhere data can drift out of step, so there are only as many as there need to be.

## What connects

| Integration | What it does | Direction |
|---|---|---|
| **QuickBooks Online** | Links jobs to QB projects; pushes approved change orders; pulls actual invoiced and paid amounts | Both, but different things each way |
| **Email (Resend)** | Sends automated notifications and customer emails | Out |
| **Customer portal** | Lets customers sign in and download their own reports | Read-only, out |
| **Offline reports app** | Desktop app for writing reports without a connection | Manual, both ways |

## Direction matters

Every integration question comes down to which system owns the data.

- **Change orders.** ampOS owns them. Approved ones push to QuickBooks. A change order created in QuickBooks is invisible here.
- **Invoiced and paid amounts.** QuickBooks owns them. They flow back into ampOS for job profitability.
- **Customer report access.** ampOS owns everything. The portal is read-only.

::: warning
The most expensive integration mistake is entering something on the wrong side. Create change orders in ampOS. Create invoices in QuickBooks. Doing it the other way round produces numbers that quietly disagree.
:::

## Where they are configured

**Admin → Integrations**, with QuickBooks having its own dashboard at **Admin → QuickBooks**.

## When one breaks

Integrations fail in ways that are quiet rather than loud. Nothing crashes; numbers just stop updating.

Signs to watch for:

1. **Job actuals stop moving** while invoices are definitely going out → QuickBooks connection has probably expired.
2. **Automated emails stop arriving** → check notification settings first, then system logs.
3. **A customer says they cannot see their reports** → portal access for that contact.

Check **Admin → System health** first. It shows whether configured integrations are responding.

## Re-authorizing

Connections to outside services use tokens that expire. When one does, the fix is to reconnect from the integration's settings page and sign in again.

::: tip
QuickBooks tokens expire on a schedule regardless of activity. If job actuals look stale, reconnecting is the first thing to try, not the last.
:::

## What to read next

- [QuickBooks Online](/docs/integrations/quickbooks): the one with the most moving parts
- [Automated emails](/docs/integrations/automated-emails)
- [Customer portal](/docs/integrations/customer-portal)
- [Offline reports app](/docs/integrations/offline-app)
