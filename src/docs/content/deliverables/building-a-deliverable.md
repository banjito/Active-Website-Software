---
title: Building a deliverable
description: Step by step, from an empty package to a generated PDF.
keywords: [create deliverable, build, assemble, generate pdf, select reports]
---

## Before you start

Every report going into the package must be **approved**. Not written. Approved.

Open the job's **report audit** tab first. It lists everything unfinished across the whole job in one view, so you find the half-empty report now rather than after you have assembled the package.

## Step by step

1. Open the job and go to the **Deliverables** tab.
2. Click **New deliverable**.
3. Give it a **name**. If the job produces one package, the job title is fine. If it produces several, name them so they can be told apart: `Building 4 - Switchgear`, `Phase 2 - Feeders`.
4. Add a **description** if it needs one. Internal, not customer-facing.
5. Create or select the **cover letter**. Report selection happens here. See [Cover letters](/docs/deliverables/cover-letters).
6. Add an **executive summary** if the job warrants one. See [Executive summaries](/docs/deliverables/executive-summaries).
7. Click **Generate PDF**.

The combined document assembles: cover letter first, executive summary next, then every selected report in order, with continuous page numbering throughout.

## Choosing which reports go in

Selection happens on the cover letter. Pick the reports that belong to this package.

For a single-package job, that is all approved reports. For a job split across buildings or phases, select only that slice.

::: note
Reports are ordered following the asset structure on the job. If you linked sub-assets to their parents, so breakers sit under their switchgear lineup, the package reads in the order the equipment is physically laid out rather than alphabetically.
:::

## Reviewing before you send

Open the generated PDF and actually read it. Check:

- The customer name and address on the cover letter
- That every report you expected is present
- That no report you did not expect is present
- Page numbering is continuous
- Photos are right side up and legible
- No report has an obviously empty section

This takes five minutes and catches the things that are embarrassing to catch later.

## Regenerating

Changed something? Generate again. The new PDF replaces the old one.

Regenerating is safe while the deliverable is in **draft**. Once it is approved or delivered, the cover letter locks and you should not be regenerating at all. See [Delivering to the customer](/docs/deliverables/delivering).

## Submitting for review

When the package is right, submit it. Status moves to **In review** and it goes to whoever approves deliverables at your company.

See [Review and approval](/docs/deliverables/review-and-approval).

## Common problems

| Problem | Cause |
|---|---|
| A report is missing from the PDF | It is not approved, or it was not selected on the cover letter |
| Page numbers restart mid-document | Regenerate. Do not assemble PDFs by hand outside the app |
| Wrong customer on the cover | The job points at the wrong customer record |
| Reports in a strange order | Sub-assets are not linked to their parents. See [Assets](/docs/jobs/assets) |
| Photos missing | They were attached to the job but not included in the report itself |
