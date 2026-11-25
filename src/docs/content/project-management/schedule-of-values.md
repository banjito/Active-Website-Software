---
title: Schedule of values
description: What the job is worth, line by line. Everything you bill comes from it.
keywords: [sov, schedule of values, contract, lines, general conditions, estimate, progress billing]
---

The schedule of values (SOV) breaks the contract into lines, like "Switchgear testing, 12 at $1,450". Weekly updates mark progress against those lines, and the monthly bill is built from that progress. Get the SOV right once and billing takes care of itself.

Open a job from the [PM dashboard](/docs/project-management/overview) and pick the **Schedule of values** tab. You can also get there from the **Schedule of values** button on the job's Change Orders card.

## Building it

**Copy from letter proposal** is the fast way. Tick the estimates that make up the job and their items are added to the SOV under the same area headings as the letter, one line per item per area. An item has the same price each in every area, and the total matches the letter.

- **Payment terms.** Pick NET 30, NET 60, or NET 90. Each shows its total, so you can check it against the letter.
- **Names to fix.** If two areas share a name, or an item is named like an area, the box says so. Fix the estimate, then copy.
- **Copying again.** Until the first weekly update, copying an estimate again can replace the lines it made before.

Text typed into the letter by hand doesn't carry over. Use **Line** on an area heading to add a line to that area.

**Add line** adds a line by hand. Fill in the item, the quantity, and the price each.

Click any box to change it. Nothing saves until you click **Save** in the bar at the bottom of the screen.

::: tip
If the job has no estimate to copy from, build it with **Add line**. The SOV works the same either way.
:::

## SOV setup

The **SOV setup** button holds settings for the whole job:

- **Billing.** How often the job bills.
- **General conditions.** Billed every month from the date the contract was signed, until the months run out, even if the job runs long. Pick **%** for a percent of the contract: it comes out of the testing lines, so the total stays the same. Pick **$** to type the dollars a month, and tick **Take it out of the other lines** if the total should stay the same.
- **Bond.** One line on top of the contract. General conditions never shrink it.

General conditions don't show in weekly updates. They bill on their own each month.

## Change Orders on the SOV

When a Change Order is approved, its lines join the SOV in their own group, under the original contract. They're scaled to the approved amount. If the Change Order had no estimate, it comes in as one line.

The **Original contract** total counts the original lines only. Change Order groups show their own totals.

If a Change Order is no longer approved, its group says so. Approve it again or remove its lines. See [Change orders](/docs/jobs/change-orders).

## Reports that count toward a line

A line can count sent reports as finished work. Click a line's report picker and tick the report types that belong to it. Each sent report of a ticked type counts as one finished unit.

A report type can count toward one line only. If the same item is in several areas, type its quantities in the weekly update instead. **Make a line for each** adds a line for every report type on the job that doesn't have one yet.

## Printing it

**Print SOV** prints the pay application for the month you're looking at. See [Billing from the SOV](/docs/project-management/billing-from-the-sov).
