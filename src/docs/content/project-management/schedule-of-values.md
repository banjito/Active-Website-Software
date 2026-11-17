---
title: Schedule of values
description: What the job is worth, line by line. Everything you bill comes from it.
keywords: [sov, schedule of values, contract, lines, general conditions, estimate, progress billing]
---

The schedule of values (SOV) breaks the contract into lines, like "Switchgear testing, 12 at $1,450". Weekly updates mark progress against those lines, and the monthly bill is built from that progress. Get the SOV right once and billing takes care of itself.

Open a job from the [PM dashboard](/docs/project-management/overview) and pick the **Schedule of values** tab. You can also get there from the **Schedule of values** button on the job's Change Orders card.

## Building it

**Copy from estimate** is the fast way. Tick the estimates that make up the job and their rows are added to the SOV. Rows with the same name combine into one line.

**Add line** adds a line by hand. Fill in the item, the quantity, and the price each.

Click any box to change it. Nothing saves until you click **Save** in the bar at the bottom of the screen.

::: tip
If the job has no estimate to copy from, build it with **Add line**. The SOV works the same either way.
:::

## SOV setup

The **SOV setup** button holds settings for the whole job:

- **Billing.** How often the job bills.
- **General conditions.** A set amount billed every month: the dollars a month, how many months, and the start month. It stops when the months run out, even if the job runs long. Tick **Take it out of the other lines** if the general conditions were baked into the line prices and should come back out.

General conditions don't show in weekly updates. They bill on their own each month.

## Change Orders on the SOV

When a Change Order is approved, its lines join the SOV in their own group, under the original contract. They're scaled to the approved amount. If the Change Order had no estimate, it comes in as one line.

The **Original contract** total counts the original lines only. Change Order groups show their own totals.

If a Change Order is no longer approved, its group says so. Approve it again or remove its lines. See [Change orders](/docs/jobs/change-orders).

## Reports that count toward a line

A line can count sent reports as finished work. Click a line's report picker and tick the report types that belong to it. Each sent report of a ticked type counts as one finished unit.

A report type can count toward one line only. **Make a line for each** adds a line for every report type on the job that doesn't have one yet.

## Printing it

**Print SOV** prints the pay application for the month you're looking at. See [Billing from the SOV](/docs/project-management/billing-from-the-sov).
