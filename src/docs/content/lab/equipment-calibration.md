---
title: Equipment calibration
description: Tracking instruments, calibration dates, and what is coming due.
keywords: [calibration, instrument, due, expired, meter, megger, register]
---

Every instrument in the company has a record: what it is, when it was last calibrated, and when it is due again.

## The equipment register

**Lab → Equipment calibration.**

Each instrument carries:

- Type, manufacturer, model
- Serial number and asset tag
- Last calibration date
- Next due date
- Calibration certificate
- Who holds it
- Status: in service, due, overdue, out of service

## Adding an instrument

1. Open the register and click **Add**.
2. Enter type, manufacturer, model, and serial.
3. Set the **category**, which decides which report types offer it.
4. Enter the last calibration date and the interval.
5. Save.

::: note
Category is the field that matters most and gets least attention. It is what makes a transformer report offer megohmmeters rather than every instrument the company owns. Get it wrong and technicians type serials by hand instead of picking from a list.
:::

## Recording a calibration

When an instrument comes back from calibration:

1. Open its record.
2. Enter the new calibration date.
3. Set the next due date, from your interval.
4. Attach the calibration certificate.
5. Return it to **in service**.

Attach the certificate every time. When a customer's quality auditor asks for it, and eventually one will, you want it on the record rather than in somebody's email.

## Due and overdue

The register flags what is approaching due and what has passed it.

Work this list weekly. Calibration is the definition of work that is never urgent until it is catastrophic: an instrument goes overdue quietly, gets used on three jobs, and then somebody notices.

::: warning
An instrument that goes overdue does not just need calibrating. Every reading taken with it since the due date is questionable, and you have to decide job by job whether to re-test.
:::

## Taking one out of service

Mark it out of service when it is:

- Overdue for calibration
- Damaged or behaving oddly
- Away being calibrated

Out-of-service instruments do not appear as options on reports, which is the point. It stops the problem at the source instead of relying on a technician noticing a date.

## How this reaches reports

The test equipment section on every report pulls from this register. A technician picks the instrument, and its serial and calibration dates fill in automatically.

That gets you three things: no typos, always-current dates, and a lapsed instrument that is visible before it is used rather than after.

See [Equipment tables](/docs/reports/equipment-tables).

## Intervals

Set intervals by manufacturer recommendation and by how hard the instrument works. An instrument that lives in a truck year-round is not on the same schedule as one that stays in the lab.

Shorten the interval for anything that has drifted before.

## Planning around calibration

Instruments come back from calibration when they come back. Check due dates against the schedule before committing to a job that needs a specific set. A VLF unit away for two weeks is a job that does not happen.

See [Scheduling](/docs/jobs/scheduling).
