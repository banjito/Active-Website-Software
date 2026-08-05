---
title: Troubleshooting
description: The problems people actually hit, and what to do about them.
keywords: [problem, error, broken, help, fix, not working, cannot]
---

Common problems and their usual causes, roughly in the order they come up.

## I cannot sign in

| Message | Cause | Fix |
|---|---|---|
| "Invalid credentials" | Wrong password | Use **Forgot password** |
| "Email not allowed" | Your address is not on the approved domain list | Ask an administrator |
| Signs in, empty portal | Your role has no portals assigned | Ask an administrator |
| Nothing happens | Account deactivated | Ask an administrator |

Personal email addresses never work, regardless of password. See [Accounts and roles](/docs/getting-started/accounts-and-roles).

## A page or button is missing

1. **Whole portal missing?** Portal access on your role.
2. **Portal there, page missing?** A `view` permission on that resource.
3. **Page there, button greyed out?** The specific action: `create`, `edit`, `approve`.
4. **Everything there but the list is empty?** Not permissions. Check the division filter.

Point 4 catches people constantly. See [Roles and permissions](/docs/admin/roles-and-permissions).

## A report will not save

Reports save automatically about half a second after you stop typing.

- **Offline?** Nothing typed while disconnected is saved. Get to signal, then re-enter it.
- **Approved report?** Approved reports lock. A reviewer has to send it back.
- **Someone else has it open?** Last save wins. Do not both work the same report.

See [Saving and autosave](/docs/reports/saving-and-autosave).

## I lost work in a report

Almost always one of:

1. Typing while offline.
2. Two people in the same report at once.
3. Overwriting a value and not remembering the old one.

There is no per-field undo history. Recovery sources are your photos, your field notes, or re-testing.

## A report prints badly

| Symptom | Fix |
|---|---|
| Table shading and headers missing | Turn on **background graphics** in the print dialog |
| Text too small | Set scale to 100%, not "fit to page" |
| Layout wrong | Use Chrome or Edge |
| A wide grid runs off the page | Try landscape |

Background graphics is the answer most of the time. See [Printing and PDFs](/docs/reports/printing-and-pdfs).

## A report is missing from a deliverable

- It is not **approved**. Only approved reports can be selected.
- It was not selected on the cover letter, which is where selection happens.

Run the job's **report audit** tab. It lists everything unfinished across the whole job.

## Reports are in a strange order in the package

Sub-assets are not linked to their parents. Link breakers to their switchgear lineup and the package follows the physical layout. See [Assets](/docs/jobs/assets).

## A job will not mark ready to bill

It will. The system does not block you. That is the problem: it does not check that reports are approved either.

Run the checklist in [Billing a job](/docs/jobs/billing) before you flip the status.

## Job profitability looks wrong

| Symptom | Usually |
|---|---|
| Infinite or absurd margin | No quoted amount on the job |
| Job looks wildly profitable | Labor or expenses not logged |
| Job looks like it is losing money | Unapproved change orders: cost with no revenue against it |
| Costs missing entirely | A purchase order with no job attached |

See [Costs and profitability](/docs/jobs/costs-and-profitability).

## QuickBooks is not syncing

1. **Actuals stale?** The token expired. Reconnect from integration settings.
2. **A job will not auto-match?** The QuickBooks project name must *start* with the job number.
3. **An approved change order did not appear?** The job is not linked to a project.
4. **Actuals show zero on a linked job?** Customer mismatch between the two systems.

Reconnecting is the first thing to try, not the last. See [QuickBooks Online](/docs/integrations/quickbooks).

## An automated email did not arrive

1. Was there anything to report? Empty emails are not sent, and this is the most common cause.
2. Is the notification enabled?
3. Is the person opted in?
4. Check spam.
5. Check the address on their profile.

See [Email schedule](/docs/reference/email-schedule).

## A custom form is not in the report type list

It is saved but not **published**. Saving and publishing are separate. See [Building a template](/docs/custom-forms/building-a-template).

## Temperature correction is not applying

Either the ambient temperature is blank or left at its default, or the form uses plain number fields instead of the Temperature/Humidity component.

See [Test values and pass/fail](/docs/reports/test-values).

## I cannot approve a report

If you wrote it, you cannot approve it. No role or permission changes this; it is enforced by the system. Someone else has to.

## How to report a problem

Capture these before you ask. Without them it is guesswork:

1. **Who.** The email address it happened to.
2. **When.** Approximate time and date.
3. **Where.** The URL, copied from the address bar.
4. **What you were doing.** The actual steps, in order.
5. **What you expected** versus what happened.
6. **Can anyone else reproduce it?**
7. **The error message**, word for word or as a screenshot.

::: tip
The URL is the most valuable and most often missing. It identifies the exact job or report, which turns "a report would not save" into something someone can actually open and look at.
:::
