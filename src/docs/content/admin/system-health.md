---
title: System health and logs
description: Checking that everything is running, and reading the logs when it is not.
keywords: [health, logs, monitoring, errors, diagnostics, troubleshoot]
---

Two pages under Admin: **System health** shows whether things are responding right now, **System logs** show what happened.

## System health

Open **Admin → System health**. It reports on the pieces ampOS depends on: the database, authentication, storage, and configured integrations.

Check it when:

- Several people report problems at once
- Something worked yesterday and does not today
- An integration has stopped syncing

If health is green and one person has a problem, it is that person's account, browser, or connection, not the system.

## System logs

**Admin → System logs** records what happened: errors, failed operations, and significant events.

### Reading them

Work backwards from when the problem started. Filter to the time window, then look for errors around it.

The useful pattern is a **cluster**: many errors of the same kind in a short window. A single error is usually one person's transient network blip.

## Role and permission audit logs

Separate from system logs: role changes and permission checks are recorded with who, what, and when.

Use these for "how did they get access to that?" and "when did this person's role change?"

## Before you report a problem

Capture these. Without them, a problem report is a guessing game:

1. **Who** it happened to. Email address.
2. **When.** Approximate time and date.
3. **Where.** The URL. Copy it from the address bar.
4. **What they were doing.** The actual steps, in order.
5. **What they expected** versus what happened.
6. **Whether anyone else can reproduce it.**
7. **Any error message**, word for word or as a screenshot.

::: tip
Point 3 is the most valuable and the most often missing. The URL identifies the exact job, report, or record, which turns "a report would not save" into something someone can actually look at.
:::

## Problems that are not system problems

| Symptom | Usually |
|---|---|
| One person cannot see a page | Permissions. See [Roles and permissions](/docs/admin/roles-and-permissions) |
| A list is empty | Division filter, not access |
| A report will not save | That person's connection |
| An email did not arrive | Opt-in setting or spam |
| A PDF prints wrong | Browser print settings, background graphics off |

Work through these before escalating anything.

## Data you should not need the logs for

Job history, report history, deliverable approvals, and change order approvals are all visible in the app itself on the relevant record. The logs are for system behavior, not business history.
