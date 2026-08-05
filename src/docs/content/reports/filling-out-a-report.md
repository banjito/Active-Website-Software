---
title: Filling out a report
description: Working down the form fast, and the fields people always get wrong.
keywords: [fill, complete, data entry, nameplate, inspection, test]
---

Every report follows the same shape. Learn it once and every form in the app feels familiar.

## 1. Job information

The header. Mostly pre-filled from the job: customer, site, job number, date, technician.

Check it rather than skipping it. Everything here is printed on the customer's copy.

Add the **temperature and humidity**. These are not decoration: insulation resistance readings get temperature-corrected, and the correction uses the number you type here. A wrong ambient temperature produces wrong corrected values on every row below it.

## 2. Nameplate data

Manufacturer, model, serial number, ratings, catalog number.

Copy these from the equipment, not from the drawing. Drawings are wrong constantly. Photograph the nameplate while you are standing there. See [Comments and photos](/docs/reports/comments-and-photos).

## 3. Visual and mechanical inspection

A checklist of NETA inspection items with a result dropdown on each.

The dropdown options follow the standard: satisfactory, unsatisfactory, cleaned, adjusted, see comments, not applicable.

::: warning
`Not applicable` means the item genuinely does not apply to this equipment. It does not mean "I did not do it." If an item was not performed, say so in the comments. A report full of N/A with no explanation is what a customer's engineer notices first.
:::

## 4. Electrical tests

The measurement grids. This is where the keyboard matters. See [Keyboard shortcuts](/docs/getting-started/keyboard-shortcuts).

Enter values in the units the column header asks for. Most insulation resistance columns want megohms or gigohms and the form tells you which.

Read [Test values and pass/fail](/docs/reports/test-values) for how limits and corrections work.

## 5. Test equipment used

Which instruments you used and their calibration dates.

This is the section technicians skip and auditors check. A test result from an out-of-calibration meter is not a test result. ampOS can pull your company's lab equipment records here so you are picking from a list rather than typing serial numbers from memory. See [Equipment calibration](/docs/lab/equipment-calibration).

## 6. Comments

Words. What you found, what you could not test, what the customer should do about it.

Good comments are specific:

- `Unit 3 could not be tested. Customer would not de-energize. Recommend testing at next outage.`
- `Bushing 2 shows evidence of tracking. Photographed. Recommend replacement before next season.`

Bad comments are `OK` and `see above`.

## Working fast

1. Click into the first field of a section.
2. Type, then use arrow keys to move: `→` across, `↓` down.
3. On dropdowns, type the first letter of the option.
4. Do not reach for the mouse until the section is done.

## Fields people get wrong

| Field | The mistake |
|---|---|
| **Ambient temperature** | Left at the default, so every corrected value is wrong |
| **Test voltage** | Entered as the equipment rating instead of the applied test voltage |
| **Units** | Megohms typed into a gigohm column, off by 1000 |
| **Serial number** | Copied from the drawing rather than the nameplate |
| **Test equipment** | Left blank |
| **N/A** | Used to mean "skipped" |

## Saving

You do not have to. Reports save as you type. See [Saving and autosave](/docs/reports/saving-and-autosave).

## When you are done

Click **Submit for review**. That moves the report to `Ready for review` and puts it in a reviewer's queue. See [Review and approval](/docs/reports/review-and-approval).
