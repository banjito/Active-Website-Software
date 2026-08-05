---
title: SLA tracking
description: Define response and resolution commitments, then find out before you miss them.
keywords: [sla, service level, deadline, violation, at risk, response time]
---

An SLA is a promise about time. "We respond within four hours." "Reports delivered within ten business days." SLA tracking in ampOS turns those promises into something the system watches for you.

## The pieces

There are three, and they stack:

1. **SLA definitions.** The templates. "Emergency response, 4 hours."
2. **SLA tracking.** A definition applied to a specific job, with a real target date calculated from it.
3. **SLA violations.** Recorded when a target is missed.

## Defining an SLA

An SLA definition holds:

| Field | What it does |
|---|---|
| **Name** | What you call it. `Emergency response, 4 hour`. |
| **Priority** | Low, medium, high, or critical. |
| **Metric type** | Response time, resolution time, uptime percentage, or custom. |
| **Target value** | The number. |
| **Time period** | Hours, days, weeks, or months. |
| **Customer** | Optional. Scope this SLA to one customer's contract. |
| **Job type** | Optional. Scope it to a kind of work. |
| **Notifications** | Whether to alert when this SLA is at risk or violated. |
| **Status** | Active, inactive, or archived. |

Customer-specific SLAs are the common case: a contract with a hospital that promises faster response than your standard terms.

## Applying an SLA to a job

Open the job, go to **Tracking**, and apply an SLA. ampOS calculates the target time from the definition and the job's start.

From then on, the job carries a live compliance status.

## The three states

| State | Means | Shows as |
|---|---|---|
| **Compliant** | Inside the target, with room. | Green |
| **At risk** | Approaching the target. | Amber |
| **Violated** | Target passed. | Red |

The point of the system is the amber state. A red SLA is a report on something that already went wrong; an amber one is a chance to fix it.

## Notifications

When notifications are enabled on an SLA definition, ampOS generates an alert as jobs approach and cross their targets. Those show up in the notification bell and, depending on your company's setup, by email.

## Violations

A violation is recorded automatically when a target passes. Violations can be **acknowledged**, meaning someone confirms they have seen it and, ideally, writes down why it happened.

Acknowledging does not make the violation go away. It stays on the record. That is the point: the compliance percentage on the performance summary only means something if misses stay counted.

## Performance summaries

The SLA views roll up compliance percentages across jobs, customers, and time periods. Use these for contract reviews. "We hit 96% of our four-hour response commitments this quarter" is a much better conversation than a shrug.

::: note
An SLA violation caused by the customer, through no site access, no approval, or no parts, is still a violation in the data. Put the job **on hold** while you are waiting on them, so the clock reflects what actually happened. See [Job statuses](/docs/jobs/job-statuses).
:::
