---
title: Review and approval
description: Nothing reaches a customer without a second pair of eyes. Here is how that works.
keywords: [review, approve, reject, sign off, qa, reviewer]
---

Every report gets checked by somebody who did not write it. That is the whole mechanism protecting your company's reputation, and it is not optional.

## The three states

| State | Editable | Can go in a deliverable |
|---|---|---|
| **In progress** | Yes | No |
| **Ready for review** | Mostly locked | No |
| **Approved** | Locked | Yes |

## Submitting for review

When your report is finished, click **Submit for review**.

The report moves to `Ready for review` and appears in the reviewer's queue. Most fields lock at this point. If you spot a mistake after submitting, ask a reviewer to send it back.

## Being a reviewer

Reviewers find waiting reports in three places:

1. **The review shortcuts menu** in the top bar, a dedicated queue separate from your normal shortcuts.
2. **The job's Assets tab**, filtered to `Ready for review`.
3. **The daily review email**, which goes out each afternoon listing what is waiting.

## What to actually check

Approving is not a rubber stamp. Work through this:

1. **Header.** Right customer, right site, right date, right technician.
2. **Nameplate.** Plausible, and matching what the photos show.
3. **Ambient temperature.** Filled in, and not the default. Every corrected value depends on it.
4. **Units.** A value a thousand times off from its neighbours is a megohm/gigohm mix-up, not a finding.
5. **Blanks.** Is a blank field a value nobody took, or genuinely not applicable?
6. **N/A.** Is it explained?
7. **Flagged values.** Are failures addressed in the comments?
8. **Test equipment.** Filled in, with calibration dates valid on the test date.
9. **Comments.** Do they say something a customer can act on?

::: warning
The most common thing missed in review is an unexplained blank. A blank field in a delivered report is a question the customer will ask, and you will not remember the answer.
:::

## Approving

Click **Approve**. The report locks and becomes available for deliverables.

## Sending it back

If it is not right, send it back to `In progress` with a note saying what needs fixing. The technician gets it back editable.

Sending a report back is not a criticism, and reviewers who never send anything back are not reviewing.

## You cannot approve your own work

The system enforces this. If you wrote the report, the approve button will not work for you, regardless of your role.

::: note
On a small crew this can mean waiting for someone. That wait is the feature. The alternative is a report going to a customer that exactly one person ever looked at.
:::

## Moving a report to a different job

When a site runs two projects at once, reports get filed under the wrong one. Reviewers can move them instead of retyping them.

On the job's Reports tab, tick the reports, then click **Move to Job** and pick the destination. Jobs at the same site are marked `Same site`, since those are almost always the ones involved.

Nothing is copied. The same report moves across with every reading, photo, comment, approval and equipment link intact, and its substation stays what it was.

Each move is logged with who did it and the reason you type, so the question "why is this on the other project now?" has an answer later.

::: note
Only report reviewers see this button. It is the same authority as approving, because moving a report changes which customer's package it lands in.
:::

## The daily review email

Every afternoon a summary goes out listing reports sitting in `Ready for review`. It keeps reports from aging quietly while a deliverable deadline approaches.

See [Email schedule](/docs/reference/email-schedule).

## Reopening an approved report

A reviewer can move an approved report back to `In progress`.

Do it when something is genuinely wrong. Remember the report may already be in a delivered package. If it is, the customer needs a corrected package, not just a corrected record on your side.

## Before building a deliverable

Run the job's **report audit** tab. It lists everything unfinished across the whole job in one view, which is faster than checking forty assets by hand.
