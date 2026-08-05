---
title: Portals and divisions
description: Why the app looks different for different people, and how to switch views.
keywords: [division, portal, field tech, lab, calibration, dashboard]
---

Two things decide what you see in ampOS: which **portal** you are in, and which **division** you belong to.

## Portals

A portal is a work area. Each one has its own sidebar and its own set of pages.

| Portal | What lives there |
|---|---|
| **Jobs** | Every job, across every division |
| **Sales** | Opportunities, estimates, customers, contacts, territories, goals |
| **Field Tech** | The field crew's dashboard, jobs, scheduling, field equipment |
| **Lab** | Calibration, testing procedures, certificates, quality metrics |
| **Engineering** | Designs, drawings, standards, engineering documentation |
| **Office** | Vendors, purchase orders, resources |
| **HR** | Hiring, onboarding, employee records, time off, reviews |
| **Admin** | Users, roles, notifications, system health, theming |

You only see portals your role gives you. If a portal is missing from your portal page, that is a permissions setting, not a bug. Ask an administrator.

## Divisions

A division is a part of the company. ampOS ships with:

- Field Tech
- Lab
- Calibration
- Engineering
- Armadillo
- Scavenger
- Regional divisions: North Alabama, Tennessee, Georgia, International

Each division gets its own dashboard at `/<division>/dashboard`, plus its own filtered views of jobs, sites, customers, contacts, scheduling, and field equipment.

### What a division actually changes

A division is a **default filter**, not a wall.

- Jobs created inside a division are tagged with it.
- Division pages show that division's work first.
- Division dashboards summarize that division's numbers.

It does not stop you from opening a job in another division if your role allows it. Use **All jobs** to see everything at once.

::: note
Division and role are different things. Your division is *where you work*. Your role is *what you are allowed to do*. A Field Tech division member with an admin role can still administer the system.
:::

## Division dashboards

Every division dashboard answers the same four questions for that crew:

1. What is open right now?
2. What is overdue or at risk?
3. What is waiting on review?
4. What is ready to bill?

Click any number on a dashboard to jump to the filtered list behind it.

## Choosing a division when creating a job

When you create a job from a division page, the job inherits that division. When you create one from the top-level jobs list, you pick the division on the form.

Getting this wrong is easy and mostly harmless, since an administrator can change a job's division later, but it means the job will not show up on the right crew's dashboard until it is fixed.
