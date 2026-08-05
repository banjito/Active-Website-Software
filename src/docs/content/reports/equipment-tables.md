---
title: Equipment tables
description: The test equipment section, why it matters, and how to stop typing serial numbers.
keywords: [test equipment, instruments, calibration, meter, megger]
---

Every report has a section listing the instruments used to take the readings. It is the section most often left blank and the one most often asked about.

## Why it matters

A measurement is only as good as the instrument that took it. If the megohmmeter was out of calibration, the readings on that report are not defensible. And if a customer or an auditor asks, "which meter took this reading and when was it last calibrated?", the report has to answer.

## What goes in it

For each instrument:

- Type: megohmmeter, low-resistance ohmmeter, hipot set, primary injection set
- Manufacturer and model
- Serial number
- Calibration date, and calibration due date

## Pulling from the equipment catalog

Rather than typing serial numbers from memory, ampOS can pull from your company's lab equipment records. Pick the instrument from the list and its serial and calibration dates fill in.

That is better for three reasons: no typos, calibration dates are always current, and an instrument that has gone out of calibration is visible before you use it on a job.

Lab equipment records are managed under **Lab → Equipment calibration**. See [Equipment calibration](/docs/lab/equipment-calibration).

## Equipment on the job

The job's **Equipment assets** tab tracks which company instruments went out on which job. If that is filled in for a job, the reports on it can draw from that shorter list rather than the whole catalog.

## Equipment categories

Instruments are grouped into categories so a transformer report offers megohmmeters and a breaker report offers primary injection sets, instead of every report offering everything.

Categories are configured once by an administrator. If the instrument you used is not offered on a form you are filling out, its category assignment probably needs fixing. Tell an administrator rather than typing it in as free text.

## The rule to follow

::: warning
If the instrument's calibration is expired on the date the test was performed, do not put the reading in a report you intend to send. Re-test with a calibrated instrument. A report that carries an expired calibration date is worse than no report, because it documents the problem in writing.
:::

## Filling it in once per job

On a job where the same three instruments did everything, fill the section in on the first report and it can be carried to the rest rather than re-entered on all forty.
