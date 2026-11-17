---
title: Billing from the SOV
description: The month's pay application, the QuickBooks invoice, and sending it, all from the job page.
keywords: [billing, invoice, pay application, retainage, quickbooks, send bill, aia, g702, g703, po number]
---

Each month, the approved weekly updates become the bill. ampOS prints the pay application, makes the QuickBooks invoice, and emails both to the customer from accounting.

Open the job and pick the **Billing by month** tab.

## The month grid

The grid shows every SOV line by month: dollars, or units if you switch **Show as**. The last columns show what's been done or earned to date, and what's left.

## The pay application

**Print SOV** prints the month's pay application in the AIA G702/G703 style:

- The summary: original contract, approved Change Orders, work done to date, retainage, less previous bills, and the amount due this period.
- Every line, with Change Orders grouped under the original contract.

Save it as a PDF from the print window if you need a copy.

### Retainage

Retainage depends on the customer. Set it as a percent on the customer's page. ampOS holds that percent of each bill and shows it on the pay application and the invoice.

## The invoice

The invoice is built from the month:

- **One line for each SOV item** billed that month, then a minus line for retainage held.
- **Dated the day you bill.**
- **The customer's PO number** goes in QuickBooks' P.O. field. If your QuickBooks company has no P.O. field on invoices, it goes in the invoice message instead.
- The message says which pay application and month it is.

The invoice's look comes from your company's default invoice style in QuickBooks. Change the default there to change how it prints.

::: warning
Billing from the SOV currently runs on a QuickBooks **test company** only (Admin, then Integrations, then **Connect test company**). Real invoices are still made in QuickBooks by hand until it's switched on.
:::

### Making a test bill

1. Pick the month and click **Test bill**.
2. Check the lines, retainage, and **This bill** total against the pay application.
3. Click **Make test invoice**.

The bill is saved to the job and listed at the bottom of the tab. A month can only be billed once. If the bill was a test, **Clear this test bill** removes it so you can try again.

## Sending it

Click **Send** on a bill in the list.

- **To.** The customer's billing contacts. Tick **Use these for this customer next time** to save them.
- **CC.** Accounting is always copied.
- **Subject.** `PO 12345 - Invoice #1041`, or the invoice and job if there's no PO.
- **Message.** The standard message, filled in for this job. Admins can change the standard message with **Edit standard message**.
- **Attachments.** The invoice PDF straight from QuickBooks, so any edits accounting made are included. The SOV PDF is built and attached for you. Add other files, like a lien waiver, up to 15 MB.

The email comes from accounting, and replies go back to accounting. Once it's sent, the bill shows the date and who it went to.

::: tip
If the SOV changed after the invoice was made, the Send box warns you that the two don't match. Fix one or the other before sending.
:::
