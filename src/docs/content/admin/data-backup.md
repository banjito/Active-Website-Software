---
title: Data backup
description: Exports, what is protected, and what to do before a risky change.
keywords: [backup, export, restore, recovery, data, snapshot]
---

Backups exist so a mistake is recoverable. Not interesting until the day it is the only thing that matters.

## Where it is

**Admin → Data backup.**

## What is protected

The database (jobs, reports, customers, deliverables, users, and everything else recorded in the app) is backed up by the hosting platform on a schedule.

::: warning
Know two numbers before you need them: **how often** backups run, and **how far back** they go. Ask whoever administers your hosting. Both are answers you want in hand before an incident, not during one.
:::

## What backups do not cover

Backups protect against loss. They do not protect against a change you made deliberately and regretted later.

Specifically, they do not undo:

- Deleting an asset, which deletes its report
- Overwriting values in a report, since there is no per-field history
- Two people editing the same report, where the last save wins
- A template edit that reshapes future forms

These are why the app puts friction in front of destructive actions, and why the guidance is always to deactivate rather than delete.

## Exporting

Run an export from this page when you need data outside the app: an audit, a customer requesting their records, a migration.

Treat an export as sensitive. It contains customer information, job costs, and possibly employee data.

## Before a risky change

Take an export first if you are about to:

- Bulk-change records
- Reorganize divisions
- Restructure roles across many users
- Import a large data set

It takes a few minutes and turns an irreversible afternoon into a recoverable one.

## Restoring

Restoring is a hosting-level operation, not something done from this page. If you need it, contact whoever administers your hosting.

Restores are all-or-nothing at the database level. You cannot restore one job. This is exactly why deleting things is discouraged everywhere else in these docs.

## The practical rules

1. **Deactivate, do not delete.** Users, templates, customers.
2. **Never delete an asset with an approved report.** That report may be in a package a customer already has.
3. **Export before bulk operations.**
4. **Know your backup frequency and retention** before you need them.
5. **Do not treat exports as backups.** An export is a snapshot you made; a backup is a system that runs whether you remember or not.

## Related

- [System health and logs](/docs/admin/system-health)
- [User management](/docs/admin/user-management): why deactivating beats deleting
