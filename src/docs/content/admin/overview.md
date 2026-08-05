---
title: Admin overview
description: What administrators control, and which parts are hard to undo.
keywords: [admin, dashboard, settings, configure, system]
---

The admin dashboard is where ampOS is configured: who has accounts, what they can do, which notifications fire, and how the instance is branded.

Most of it is safe to click around in. A few parts are not, and they are flagged below.

## What lives here

| Section | Controls |
|---|---|
| **User management** | Who has an account, their role and division |
| **Role management** | What each role is allowed to do |
| **Permissions** | Individual grants on top of a role |
| **Notification controls** | Which automated emails fire, and to whom |
| **System health** | Whether everything is responding |
| **System logs** | What happened, when |
| **Data backup** | Exports and recovery |
| **Encryption** | Encryption settings |
| **Integrations** | QuickBooks and other outside connections |
| **Site theme** | Logo, brand color, company details |
| **In progress** | A live view of work moving through the system |

## Safe to change any time

- Notification recipients
- Site theme: logo, colors, company details
- Adding a user
- Viewing logs and health

## Change carefully

| Change | Why |
|---|---|
| **Someone's role** | Instantly changes what they can see and do. A too-narrow role blocks someone mid-job. |
| **A role's permissions** | Affects everyone holding that role, not just the person you had in mind. |
| **Turning off a notification** | People stop being told about work waiting on them, and nobody notices for weeks. |
| **Encryption settings** | Consequences reach existing data. |

::: danger
Do not deactivate your own account, and do not remove the Admin role from the only remaining administrator. There is no way back in from the interface.
:::

## Super users

Certain email addresses are configured as super users at the instance level and always have full access, independent of role assignment.

This is the backstop for the situation above. If roles get misconfigured, a super user can still get in and fix it. Keep at least two, at addresses that will still exist next year.

## Deactivate, do not delete

When someone leaves, **deactivate** their account rather than deleting it.

A deleted account takes its history with it. Deactivating keeps the record of who wrote and approved what, which is the evidence behind every report that person ever signed.

## The audit trail

Role changes and permission checks are logged. When someone asks "who gave them access to that?", the answer exists.

## Before you change a permission

Ask what problem you are solving. Two very different fixes get confused constantly:

- **"They cannot do their job"** → adjust their role, or grant a specific permission.
- **"Everyone in this role cannot do their job"** → adjust the role itself.

Granting individual permissions to twelve people one at a time, when all twelve share a role, is a sign the role needs changing instead.

## What to read next

- [User management](/docs/admin/user-management)
- [Roles and permissions](/docs/admin/roles-and-permissions)
- [Notification controls](/docs/admin/notification-controls)
