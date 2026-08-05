---
title: Creating a report
description: Getting from "I tested this transformer" to an open report form.
keywords: [new report, add report, start report, pick form]
---

Reports are created against assets. So the first question is always: does the asset exist yet?

## If the asset already exists

1. Open the job.
2. Go to the **Assets** tab.
3. Click the asset.
4. Its report opens.

If the asset was created without a report type, you will be asked to pick one now.

## If the asset does not exist yet

1. Open the job and go to **Assets**.
2. Click **Add asset**.
3. Enter the name, matching the nameplate or the one-line. `Transformer T-1`.
4. Enter the identifier, if there is one.
5. Pick the **report type**.
6. Save. The report opens.

For a long list of equipment, use **bulk import** instead of adding them one at a time. See [Assets](/docs/jobs/assets).

## Picking the right report type

Two questions get you there:

**What is the equipment?** Transformer, breaker, cable, switchgear, relay, switch.

**Is this acceptance or maintenance testing?** ATS for new equipment being energized the first time. MTS for existing equipment on a periodic cycle.

Then narrow by voltage class and construction: dry type versus liquid filled, electronic trip versus thermal-magnetic, and so on.

The full list with guidance is in the [report catalog](/docs/reports/catalog).

::: warning
Changing the report type after you have entered data does not carry the data across, because the forms have different fields. If you picked wrong, catch it early.
:::

## Reports with multiple sets

Some forms cover several identical items at once. Low-voltage cable tests, for example, come in 3-set and 12-set versions. Use the one that fits the number of cables you actually tested rather than creating four separate 3-set reports.

## Reports tied to a substation

A few report types (grounding system, GFI trip test, applied voltage) can be scoped to a specific substation within the job. When the form asks for it, fill it in. It keeps the deliverable organized when a job covers several substations.

## What is pre-filled

When a report opens, ampOS fills in what it already knows from the job:

- Customer name and address
- Site
- Job number
- Date
- Your name as the technician

Check these rather than assuming. If the job's customer record has an old address, it lands in the report header and then in the customer's PDF.

## Starting from last year's report

For repeat maintenance work, previous reports for the same asset at the same site are available. Use them to compare readings and spot trends, not to copy values forward.

::: danger
Never carry forward last year's readings as this year's. It is the fastest way to destroy your company's credibility, and it is obvious to anyone who compares two reports.
:::
