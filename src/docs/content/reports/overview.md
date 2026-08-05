---
title: Reports overview
description: What a test report is in ampOS, and why it is a form rather than a document.
keywords: [report, test report, neta, ats, mts, forms]
---

A report is a filled-out test form for one piece of equipment. ampOS ships with over 60 of them, matching ATS and MTS standards across transformers, breakers, cables, switchgear, and more.

## Forms, not documents

This is the most important difference from how most companies do it.

A Word template is a picture of a report. The app cannot tell a 2.1 gigohm reading from a 2.1 milliohm one, because both are just text in a box.

An ampOS report is **typed data**. The app knows that field is an insulation resistance value, knows what the acceptable range is for that equipment at that voltage, and can tell you the reading fails before the customer's engineer does.

That gets you:

- Pass/fail evaluation as you type
- Temperature correction applied automatically
- Consistent output across every technician on every job
- Reports that can be searched, compared year over year, and rolled into a package
- No formatting to fix at the end

## ATS and MTS

Most equipment has two forms:

- **ATS.** Acceptance Testing Specifications. New equipment, first energization.
- **MTS.** Maintenance Testing Specifications. Existing equipment, periodic testing.

They test similar things against different limits. Pick the one matching the work you were hired to do. If a customer asks for "acceptance testing" on twelve-year-old switchgear, ask. They usually mean maintenance testing, and the limits are not the same.

## Where reports live

Reports attach to **assets**, and assets attach to **jobs**.

```text
Job
 └── Asset  (Transformer T-1)
       └── Report  (Liquid-Filled Transformer ATS)
```

So the path to any report is: open the job → **Assets** tab → click the asset.

## The three states

| State | Means | Who moves it |
|---|---|---|
| **In progress** | Being written. Fully editable. | The technician |
| **Ready for review** | Submitted. Mostly locked. | The technician submits |
| **Approved** | Signed off. Can go into a deliverable. | A reviewer, never the author |

You cannot approve your own report. That is enforced by the system.

## What is in a report

Most report types share the same skeleton:

1. **Job information.** Customer, site, job number, date, technician. Mostly pre-filled from the job.
2. **Nameplate data.** Manufacturer, model, serial, ratings, from the equipment itself.
3. **Visual and mechanical inspection.** A checklist of NETA inspection items.
4. **Electrical tests.** The measurements, in grids.
5. **Test equipment used.** Which instruments, and their calibration dates.
6. **Comments.** What you found, in words.

## What to read next

- [Creating a report](/docs/reports/creating-a-report)
- [Filling out a report](/docs/reports/filling-out-a-report)
- [Report catalog](/docs/reports/catalog): every form, and when to use it
