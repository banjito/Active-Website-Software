---
title: HR overview
description: An employee's whole time with the company, from requisition to exit survey.
keywords: [hr, human resources, employee, portal, people]
---

The HR portal covers an employee's entire time with the company, from the job requisition that created their role to the exit survey on their last day.

It is the largest portal in ampOS and the most permission-sensitive. Most people see only their own records.

## The employee lifecycle

```text
Requisition ──> Candidate ──> Offer ──> Onboarding ──> Employee
                                                          │
                        ┌─────────────────────────────────┤
                        │                                 │
                  Time off, reviews,              Offboarding ──> Exit survey
                  compensation changes
```

## What lives here

| Area | Covers |
|---|---|
| **Employee profiles** | The master record: details, title history, compensation history, documents |
| **Recruiting** | Requisitions, career page, candidates, interviews |
| **Offers** | Offer letters, approvals, e-signatures |
| **Onboarding** | Packets, checklists, IT and office tasks |
| **Time and attendance** | PTO, leave, accrual policies, timesheets |
| **Performance** | Review cycles, goals, feedback |
| **Announcements** | Messages to everyone or to selected people |
| **Compliance** | Acknowledgments, e-sign records, EEO reporting |
| **Offboarding** | Termination workflows, exit surveys, final documents |
| **Analytics** | Dashboards, custom reports, exports |
| **Self-service** | Employee and manager portals |

## Who sees what

This is stricter than the rest of ampOS.

| Role | Sees |
|---|---|
| **Employee** | Their own record, their own time off, their own tasks |
| **Manager** | Their own, plus their direct reports' time off and reviews |
| **HR Rep** | Everything |
| **Admin** | Everything |

::: danger
HR data includes compensation, medical-adjacent leave information, and personal details. Getting HR permissions wrong is materially worse than getting job permissions wrong. Check them deliberately rather than assuming a role is roughly right.
:::

## Where HR touches the rest of ampOS

Two connections matter day to day:

1. **Approved time off appears on the scheduling calendar.** That is what stops a crew being scheduled around a booked vacation. See [Scheduling](/docs/jobs/scheduling).
2. **Deactivating the ampOS account is part of offboarding.** It is easy to complete an HR offboarding checklist and leave the login active. See [User management](/docs/admin/user-management).

## Self-service

Most employees only ever need the employee portal: request time off, see their tasks, sign their forms, read announcements.

Managers get a manager portal for approving requests and completing reviews for their reports.

## What to read next

- [Employee profiles](/docs/hr/employee-profiles)
- [Onboarding](/docs/hr/onboarding): the most commonly used workflow
- [Time and attendance](/docs/hr/time-and-attendance)
