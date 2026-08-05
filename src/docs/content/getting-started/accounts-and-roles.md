---
title: Accounts and roles
description: How to get an account, what your role controls, and how to fix your profile.
keywords: [login, password, permissions, access, profile, sign up]
---

## Getting an account

ampOS does not have public sign-up. An administrator adds your email address first, then you can set a password and sign in.

Only email addresses on your company's approved domain list can have accounts. If you try to sign in with a personal address, it will be rejected even if the password is right.

## Signing in

Go to your company's ampOS address and enter your work email and password.

If sign-in fails, work through these in order:

1. **"Invalid credentials."** Wrong password. Use **Forgot password**.
2. **"Email not allowed."** Your address is not on the approved domain list. Ask an administrator.
3. **The page loads but you land on a blank portal.** You signed in fine, but your role has no portals assigned yet. Ask an administrator to assign one.

## Your profile

Open your avatar in the top right, then **Profile**.

What lives there and why it matters:

- **Name.** Appears on reports you write and sign. Spell it the way you want a customer's engineer to read it.
- **Division.** Sets your default views. See [Portals and divisions](/docs/getting-started/portals-and-divisions).
- **Phone.** Used by the internal call list and by scheduling.
- **Photo.** Shows in chat, on assignments, and on the org chart.
- **Signature.** Used when you sign off on reports and deliverables. See [Signature profiles](/docs/deliverables/signature-profiles).

## Roles, briefly

Your role is a bundle of permissions. The common ones:

| Role | Can do |
|---|---|
| **Technician** | Create and edit reports, submit them for review, upload photos |
| **Reviewer / Lead** | Everything above, plus approve or reject reports |
| **Project manager** | Create and manage jobs, schedule crews, see costs |
| **Office admin** | Build and send deliverables, mark jobs ready to bill, manage POs |
| **Sales** | Opportunities, estimates, customers, territories |
| **Administrator** | User management, roles, system settings, integrations |
| **Super user** | Everything, including things that can break the system |

Roles are configurable, so your company's may differ. The full reference is in [Roles and permissions](/docs/admin/roles-and-permissions).

::: warning
A person cannot approve their own report. That is enforced by the system, not by policy. If you wrote it, the approve button will not work for you. This is deliberate and it is the main reason review exists.
:::

## Changing someone's access

Administrators do this from **Admin → User management**. You can change someone's role, division, and portal access there, and deactivate accounts for people who leave.

Deactivating is better than deleting. A deleted account takes its history with it; a deactivated one keeps the record of who wrote and approved what.
