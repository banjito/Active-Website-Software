---
title: Core concepts
description: The eight words that explain how everything in ampOS is wired together.
keywords: [glossary, concepts, vocabulary, terms, model]
---

ampOS uses a handful of words in very specific ways. Learn these eight and the rest of the app stops being confusing.

## Job

The container for a piece of work. It has a job number, a customer, a site, a scope, dates, and a status. Reports, photos, costs, deliverables, and change orders all attach to a job.

Job numbers are generated automatically when the job is created. You do not pick them.

## Customer

The company paying the bill. A customer has contacts (people), an address, and a history of jobs and opportunities.

## Site

The physical place the work happens. A plant, a hospital, a substation.

::: note
A site belongs to a **customer relationship**, not permanently to one customer. The same building can be worked for different customers over time: a property manager one year, a tenant the next. That is why the customer lives on the job, and the site lives on its own.
:::

## Asset

A single piece of equipment you tested, listed on a job. `Transformer T-1`. `Panel LP-2A`. `Breaker 52-1`.

Each asset carries the report written against it. When people say "there are 40 reports on this job," they mean 40 assets each with a report.

## Report

A filled-out test form for one asset. Reports are typed forms, not documents. The app knows what each number means, so it can flag a failing insulation resistance reading before a customer does.

Reports move through three states: `In progress` → `Ready for review` → `Approved`.

## Deliverable

The package the customer actually receives. A deliverable pulls in approved reports, adds a cover letter and an executive summary, and produces one combined PDF with consistent page numbering.

A job can have several deliverables, for example one per building or one per phase.

## Division

A part of the company with its own dashboard and its own slice of the work. Field Tech, Lab, Calibration, Engineering, and regional divisions like North Alabama or Tennessee.

Your division controls what you see by default. It does not usually restrict what you *can* see; that is roles.

## Role

What you are allowed to do. Roles control which portals appear, whether you can approve reports, whether you can see money, and whether you can change other people's accounts.

Read [Roles and permissions](/docs/admin/roles-and-permissions) for the full breakdown.

---

## How they connect

```text
Customer
   └── Opportunity ──(won)──> Job
                                ├── Site
                                ├── Assets ──> Reports
                                ├── Costs, T&M expenses, change orders
                                └── Deliverables ──> the customer
```

Read that top to bottom and you have the whole app.

## Two ideas that trip people up

**Reports live on assets, not on jobs directly.** If you are hunting for a report, find the asset first.

**Approval is a state, not a signature field.** Typing a name into the "reviewed by" box does not approve anything. Someone with review permission has to actually click approve. See [Review and approval](/docs/reports/review-and-approval).
