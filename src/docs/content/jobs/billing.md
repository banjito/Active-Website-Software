---
title: Billing a job
description: The handoff from operations to accounting, and how not to hand off a mess.
keywords: [billing, invoice, ready to bill, quickbooks, accounting]
---

Billing is a handoff. Operations says "this is done," accounting invoices it. The whole trick is making sure "done" is true.

## The checklist before you mark a job ready to bill

Run through this every time. It takes two minutes and it saves accounting from bouncing the job back.

1. **Every report is approved.** Not written. Approved. Use the **report audit** tab on the job; it lists anything unfinished.
2. **The deliverable has gone to the customer.** Or you know why it has not.
3. **All T&M expenses are logged.** Mileage, per diem, materials. Anything logged after invoicing is money you do not collect.
4. **Change orders are approved, not pending.** A pending change order is unbilled work. See [Change orders](/docs/jobs/change-orders).
5. **The quoted amount is right.** Including approved change orders.
6. **The PO number is on the job**, if the customer requires one. Many do, and an invoice without it gets rejected.

## Marking it ready to bill

Click the status in the job header and choose **Ready to bill**.

The moment you do:

- An email goes to the billing group.
- The job appears on tomorrow morning's daily ready-to-bill report.

::: warning
The system does not check that reports are approved before letting you mark a job ready to bill. That check is you. See the checklist above.
:::

## What accounting does

They invoice it, in QuickBooks if that is where your books live, and then move the job to **Billed**.

If QuickBooks is connected, the job's linked project pulls actual invoiced amounts back into ampOS, so profitability reflects reality rather than estimates. See [QuickBooks Online](/docs/integrations/quickbooks).

## The daily ready-to-bill report

Every morning, a summary of jobs sitting in `Ready to bill` goes out by email. It is a nag list, and it works: jobs do not sit unbilled for three weeks when they appear in someone's inbox daily.

See [Email schedule](/docs/reference/email-schedule).

## T&M jobs versus fixed price

**Fixed price.** You invoice the quoted amount plus approved change orders. Costs affect your margin, not the invoice.

**Time and materials.** The T&M expense entries *are* the invoice. Which means the notes on those entries get read by the customer's accounts payable department. Write them accordingly.

## Closing out

After billing, move the job to **Completed**. Nothing is deleted. Reports, deliverables, photos, and costs all stay. Completed jobs are still searchable and still count in customer history.

## If something was missed

Reopen the job by changing its status back. Add the missing expense or fix the report, then push it through again. This is normal and it is safe.
