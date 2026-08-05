---
title: Roles and permissions
description: The role list, how permissions are built, and how to grant access without breaking things.
keywords: [role, permission, access, grant, revoke, portal, admin]
---

A role is a bundle of permissions. Getting roles right is the highest-leverage administration task in ampOS, because it decides what every person sees on every page.

## The built-in roles

| Role | Typically does |
|---|---|
| **NETA Technician** | Writes and submits test reports, uploads photos |
| **Lab Technician** | Calibration, procedures, certificates |
| **Engineer** | Designs, drawings, standards, engineering documentation |
| **Sales Representative** | Opportunities, estimates, customers, territories |
| **Office Admin** | Deliverables, vendors, purchase orders, billing handoff |
| **HR Rep** | Hiring, onboarding, employee records |
| **Operations Manager** | Jobs, scheduling, costs, approvals across divisions |
| **Scav** | The Scavenger division's work |
| **Admin** | Users, roles, system settings, integrations |

Custom roles can be created on top of these.

## How a permission is built

Every permission is a **resource** plus an **action**.

**Resources** are the things in the system: `jobs`, `reports`, `customers`, `opportunities`, `users`, `roles`, `documents`, `equipment`, `lab`, `engineering`, `hr`, `office`, `sales`, `settings`, `system`, and others.

**Actions** are what can be done to them: `view`, `create`, `edit`, `delete`, `approve`, `assign`, `import`, `export`, `share`, `revoke`, `manage`, `configure`.

So "can approve reports" is `reports` + `approve`. "Can configure the system" is `settings` + `configure`.

::: tip
Read a permission out loud as a sentence: "jobs, edit" becomes "can edit jobs." If the sentence sounds like something the person should be able to do, grant it. If it sounds broader than you meant, it is.
:::

## Portals

Separately from resource permissions, a role grants access to **portals**: sales, neta, lab, hr, office, engineering, scavenger, meetings, field tech, and admin.

Portal access controls what appears on the portal page. A missing portal is almost always this, not a bug.

## Role permissions versus direct grants

Two ways someone gets a permission:

1. **Through their role.** Everyone with that role gets it.
2. **Directly on their account.** Just that person.

Direct grants can carry an **expiration date**, which is the right tool for temporary access: covering someone on leave, a contractor for one project.

### Which to use

| Situation | Do this |
|---|---|
| Everyone in this role needs it | Change the role |
| One person needs it permanently | Direct grant |
| One person needs it for six weeks | Direct grant with an expiry |
| You have granted the same thing to five people | Change the role instead |

::: warning
Direct grants are invisible in the role list. A person with mysterious extra access usually has a direct grant nobody remembers making. Check the user's permissions panel, not just their role.
:::

## Changing a role

**Admin → Role management**. Pick the role, adjust its permissions.

This affects **everyone** holding that role, immediately. Before you widen a role to solve one person's problem, check how many people hold it.

## The rule that cannot be overridden

**Nobody can approve their own report.** No role grants this. No permission unlocks it. Super users cannot do it either.

This is the core control protecting your company's output, and it is enforced in the system rather than by policy. See [Review and approval](/docs/reports/review-and-approval).

## Money visibility

Cost and margin data is permission-gated. Field crews typically cannot see quoted amounts or profitability.

Decide this deliberately. There are good arguments for showing crews the numbers and good arguments against, but it should be a decision, not an accident of which role someone got assigned.

## The audit trail

Role changes and permission checks are logged: who changed what, when, and for whom. When someone asks how a person got access to something, the answer exists in the logs.

## Diagnosing "I cannot see X"

1. **Is the portal missing entirely?** Portal access on their role.
2. **Portal is there but the page is missing?** A `view` permission on that resource.
3. **Page is there but a button is greyed out?** The specific action: `create`, `edit`, `approve`.
4. **Everything is there but empty?** Not permissions. Wrong division, or a filter.

Point 4 catches people constantly. An empty list usually means the division filter, not access.
