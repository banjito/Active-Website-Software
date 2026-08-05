---
title: Glossary
description: Every term ampOS uses, defined once.
keywords: [glossary, terms, definitions, vocabulary, meaning]
---

Words this app uses in specific ways.

## Application terms

**Asset.** One piece of equipment on a job, carrying the report written against it. `Transformer T-1`. Reports live on assets, not directly on jobs.

**Change order.** Additional scope added to a job after it started. Pending ones count for nothing; approved ones add to the quoted amount and push to QuickBooks. See [Change orders](/docs/jobs/change-orders).

**Contact.** A person at a customer.

**Customer.** A company you bill. Lives on the job, not on the site.

**Deliverable.** The package the customer receives: cover letter, executive summary, and approved reports as one PDF.

**Division.** A part of the company with its own dashboard. Field Tech, Lab, Calibration, Engineering, and regional divisions. Sets your default filters, not your permissions.

**Instance** *(custom forms)*. One filled-out copy of a custom form template.

**Job.** The container for a piece of work. Everything attaches to it.

**Opportunity.** A deal you are chasing. Becomes a job when awarded.

**Portal.** A work area with its own sidebar. Sales, HR, Lab, Office, Admin, and others.

**Preset** *(estimating)*. Saved rates and line items so every estimate starts from the same numbers.

**Resource.** A person or piece of equipment booked to a job for a window of time.

**Role.** A bundle of permissions. What you are allowed to do.

**Signature profile.** A saved signature block reused on customer documents. Not the same as your account profile.

**Site.** A physical location. Belongs to the place, not permanently to one customer.

**SLA.** A time commitment, either response or resolution, tracked against a job.

**Template** *(custom forms)*. The blank form you designed. Instances are filled-out copies of it.

**Territory.** A sales area with reps assigned and a revenue target.

## Testing terms

**ATS.** Acceptance Testing Specifications. New equipment, first energization.

**MTS.** Maintenance Testing Specifications. Existing equipment on a periodic cycle.

**ATS 25.** The 2025 edition of the acceptance testing specifications.

**NETA section.** The clause in the standard a form corresponds to. `ATS 7.3.3`.

**Temperature correction.** Adjusting insulation resistance readings to a common reference temperature so they can be compared. Driven by the ambient temperature you enter.

**TCF.** Temperature correction factor.

**As found / as left.** Device settings before and after adjustment.

**Primary injection.** Testing a breaker by injecting current through the primary circuit.

**Secondary injection.** Testing the trip unit directly, without primary current.

**VLF.** Very low frequency, a cable testing method.

**Tan delta.** Dissipation factor measurement, used to assess cable insulation.

**PI.** Polarization index.

**DA.** Dielectric absorption ratio.

## Status values

### Job

`Pending` · `In progress` · `Ready to bill` · `Billed` · `Completed` · `On hold` · `Cancelled`

See [Job statuses](/docs/jobs/job-statuses).

### Report

`In progress` · `Ready for review` · `Approved`

See [Review and approval](/docs/reports/review-and-approval).

### Deliverable

`Draft` · `In review` · `Approved` · `Rejected` · `Delivered`

### Opportunity

`Awareness` · `Interest` · `Quote` · `Decision` · `Decision - Forecasted Win` · `Decision - Forecast Lose` · `Awarded` · `Lost` · `No Quote`

### Purchase order

`Pending` · `Approved` · `Ordered` · `Received` · `Cancelled`

### Resource allocation

`Planned` · `Scheduled` · `Confirmed` · `In progress` · `Completed` · `Cancelled`

### SLA

`Compliant` · `At risk` · `Violated`

## Roles

`NETA Technician` · `Lab Technician` · `Engineer` · `Sales Representative` · `Office Admin` · `HR Rep` · `Operations Manager` · `Scav` · `Admin`

Plus custom roles. See [Roles and permissions](/docs/admin/roles-and-permissions).

## Permissions

**Resource.** The thing being acted on: `jobs`, `reports`, `customers`, `users`, and others.

**Action.** What can be done: `view`, `create`, `edit`, `delete`, `approve`, `assign`, `import`, `export`, `share`, `revoke`, `manage`, `configure`.

A permission is a resource plus an action. "Can approve reports" is `reports` + `approve`.
