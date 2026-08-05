---
title: Scheduling
description: Getting a job onto a calendar and a crew onto a truck.
keywords: [schedule, calendar, crew, resource, allocation, dispatch]
---

Scheduling answers two questions: when is this happening, and who is going?

## The scheduling calendar

Each division has a scheduling page at **/&lt;division&gt;/scheduling**. It shows jobs on a calendar with day, week, and month views.

Drag a job to move it. Drag its edge to change how long it runs.

## Resource allocation

A **resource** is a person or a piece of equipment committed to a job for a window of time.

To allocate someone:

1. Open the job and go to **Tracking**.
2. In resource allocation, click **Add**.
3. Pick the person, the dates, and their role on the job.
4. Save.

Allocations carry a status of their own:

| Status | Means |
|---|---|
| **Planned** | Pencilled in. |
| **Scheduled** | On the calendar. |
| **Confirmed** | The person knows and has agreed. |
| **In progress** | They are on site now. |
| **Completed** | Their part is done. |
| **Cancelled** | Not happening. |

::: tip
`Planned` versus `Confirmed` is the difference between a schedule you can trust and one you cannot. Move an allocation to `Confirmed` only after the technician actually knows about it.
:::

## Seeing conflicts

The calendar shows a person's existing allocations, so double-booking is visible before it happens rather than at 6am on a Tuesday.

If someone is allocated to two jobs at once, both allocations still save. ampOS shows you the conflict rather than blocking you, because sometimes a half-day on each is exactly what you meant.

## Time off

Approved time off from HR shows on the scheduling calendar. A technician on PTO appears as unavailable, so you do not schedule around a vacation you forgot about.

See [Time and attendance](/docs/hr/time-and-attendance).

## Scheduling and due dates

The job's **due date** is when the customer expects the deliverable, not when the crew is on site. Those are different dates, and the gap between them is your report-writing and review time.

A job scheduled to finish field work the day before it is due has no slack for review. That is how deliverables go out late.

## The field tech view

Technicians see their own assignments on the Field Tech dashboard: what they are on today, what is coming, and which jobs still have reports waiting on them.

## Mobile

The scheduling calendar works on a tablet. Dragging is fiddly on a phone; on a phone, use the list view instead.
