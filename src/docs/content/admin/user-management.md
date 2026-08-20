---
title: User management
description: Adding people, changing their access, and handling departures.
keywords: [user, account, add user, invite, deactivate, access]
---

ampOS has no public sign-up. An administrator adds an email address before anyone can sign in.

## Adding a user

1. Go to **Admin → User management**.
2. Click **Add user**.
3. Enter their **work email**. It must be on your company's approved domain list. A personal address will be rejected even with the right password.
4. Assign a **role**. See [Roles and permissions](/docs/admin/roles-and-permissions).
5. Assign a **division**. This sets their default views.
6. Save.

They can now set a password with **Forgot password** and sign in.

## What happens on their first sign-in

They land on **Profile setup** and fill in their name, division, and phone. Their name is what appears on reports they write and sign, so it is worth telling them to spell it the way customers should see it.

## Approved email domains

Only addresses on the configured domain list can have accounts. This is instance-level configuration, not per-user.

::: note
"Email not allowed" at sign-in almost always means the domain list, not the password. A new contractor on their own company's email needs the domain added, or an address on yours.
:::

## Changing someone's access

Open the user and change their role or division. It takes effect immediately, on the next page they load.

::: warning
Changing a role mid-shift can block someone in the middle of a job. If you are narrowing access rather than widening it, tell the person first.
:::

## Employee IDs

Open the user, stay on the **Account** tab, and set their **Employee ID**. This is the badge number from the company roster (`1001`, `0034`, `S0002`), not their login.

- It must be unique. If another employee already has that number, the save is rejected and nothing changes.
- Leave the box blank and save to clear it.
- It is the same field HR edits under **HR → Employee Profiles**, which also has a CSV import for assigning many at once.

Assigned IDs show next to the person's email in the user list, and the search box matches on them.

## Division versus role

Two separate fields, constantly confused.

- **Division** is where they work. It sets default filters.
- **Role** is what they are allowed to do.

Someone in the Field Tech division with an Admin role still administers the system. Someone in the Admin division with a technician role does not.

## When someone leaves

**Deactivate** the account. Do not delete it.

Deactivating:

- Blocks sign-in immediately
- Keeps every report they wrote and approved, with their name intact
- Keeps the audit trail

Deleting takes the history with it. A report whose author no longer exists is a report you cannot defend.

Also worth doing on departure:

1. Reassign their open jobs.
2. Reassign their opportunities and accounts.
3. Remove or update their [signature profile](/docs/deliverables/signature-profiles), or their name and phone number keep going out on customer documents.
4. Hand off anything they were the named contact for.

::: tip
Point 3 is the one that gets missed. Months later a customer calls the number on a report and reaches a disconnected line.
:::

## Someone cannot sign in

Work through it in order:

| Symptom | Cause |
|---|---|
| "Invalid credentials" | Wrong password. Send them to **Forgot password**. |
| "Email not allowed" | Domain not on the approved list. |
| Signs in, lands on an empty portal | Role has no portals assigned. |
| Signs in, cannot see their jobs | Wrong division, or the jobs are in another one. |
| Nothing happens at all | Account deactivated. |

## Bulk changes

Reorganizing a division or rolling out a new role is faster from the user list than one profile at a time. Filter to the group, then apply the change.

Check the filter before you apply anything. A role change applied to the wrong filtered set is tedious to unwind.
