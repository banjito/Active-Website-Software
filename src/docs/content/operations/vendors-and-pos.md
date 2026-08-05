---
title: Vendors and purchase orders
description: Buying things, and tying the cost back to the job that caused it.
keywords: [vendor, purchase order, po, buy, supplier, materials]
---

A purchase order records what you bought, from whom, and, most importantly, which job it belongs to.

## Adding a vendor

1. Go to **Office → Vendors**.
2. Click **New vendor**.
3. Enter the company name, address, and contact details.
4. Save.

Search before you create. Duplicate vendors split your spending history across two records that look identical in a dropdown.

## Raising a purchase order

1. From **Office → Vendors**, or from the job itself, click **New PO**.
2. Pick the **vendor**.
3. **Attach it to a job.** Do this now, not later.
4. Add line items: what you are buying, quantity, price.
5. Add the ship-to address. It defaults to your company's, so change it when material ships direct to site.
6. Save.

The generated PO carries your company branding, address, and the purchase-order email address vendors should reply to.

## Attach it to a job

::: danger
A PO with no job attached is a cost that vanishes. It leaves the bank account and appears in no job's margin. Every job then looks more profitable than it was, and you find out at year end.
:::

If a purchase genuinely spans several jobs, like a drum of cable serving three, split it across POs or allocate the cost explicitly. Do not leave it floating.

## PO statuses

| Status | Means |
|---|---|
| **Pending** | Raised, awaiting approval |
| **Approved** | Cleared to send to the vendor |
| **Ordered** | Sent. The vendor has it. |
| **Received** | Goods arrived |
| **Cancelled** | Not happening |

Move them as reality moves. A PO sitting in `Ordered` three months after delivery is why the weekly report is full of noise nobody reads.

## Approval

POs go through approval before being sent. Who approves, and above what value, is a permissions setting. See [Roles and permissions](/docs/admin/roles-and-permissions).

## The weekly PO report

Every Monday at 8:00 AM, a purchase order summary goes out to anyone opted in.

Read it. It is the cheapest way to catch a PO raised against the wrong job, a duplicate order, or something ordered and never received.

See [Email schedule](/docs/reference/email-schedule).

## Receiving

When material arrives, mark the PO **Received**. If what arrived does not match what was ordered, whether short shipment, wrong part, or damage, note it on the PO while you are standing next to the box. Nobody remembers three weeks later.

## POs and job costs

Approved and received POs flow into the job's cost total and therefore into margin.

Which is why the attach-it-to-a-job rule matters so much: profitability is only as good as the costs pointed at it.

## Vendor history

Open a vendor to see everything you have bought from them. Useful before negotiating terms, and useful when you are trying to remember who supplied that one part.
