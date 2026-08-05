---
title: Review and approval
description: The last check before a package leaves the building.
keywords: [review deliverable, approve, reject, qa, sign off]
---

Reports get reviewed individually. The package gets reviewed as a whole, because a stack of individually-correct reports can still add up to a package that is wrong.

## The statuses

| Status | Means |
|---|---|
| **Draft** | Being assembled. Editable. |
| **In review** | Submitted. Waiting on a reviewer. |
| **Approved** | Signed off, ready to send. |
| **Rejected** | Sent back with a reason. |
| **Delivered** | The customer has it. |

## Submitting

From the deliverable, click submit. Status moves to **In review**.

## What a reviewer checks

The reports were already reviewed. This pass is about the package.

1. **Right customer, right address** on the cover letter. This is the failure that embarrasses the company, so check it first.
2. **Right site and right dates.**
3. **Every expected report is present.** Compare against the job's asset list.
4. **No unexpected report is present.** Nothing from another building, another phase, or another customer.
5. **The executive summary matches the reports.** If a report flags a failure, the summary should mention it. A clean summary over a failing report is the worst possible outcome.
6. **Findings are ranked sensibly.** Not everything is urgent.
7. **Page numbering is continuous.**
8. **Photos are legible and right side up.**
9. **Signature blocks are filled in and current.**

::: warning
Point 5 is the one that matters most. Reports and the summary are written by different people at different times, and they drift apart. A customer who reads "all equipment satisfactory" and then finds a failing test result forty pages in has lost confidence in everything you sent.
:::

## Approving

Click approve. Two things happen:

- The package is cleared to send.
- The cover letter **locks**, and ampOS records who locked it and when.

## Rejecting

Reject with a reason. The reason is stored on the deliverable, so the person fixing it knows what to fix, and the history stays visible.

Be specific. `Wrong site address on cover letter; exec summary does not mention T-2 finding` is useful. `Needs work` is not.

## After approval

The package is ready to deliver. See [Delivering to the customer](/docs/deliverables/delivering).

## If something is wrong after approval

Depends on whether it has been sent.

**Not yet delivered.** A reviewer can move it back, and you fix and resubmit.

**Already delivered.** Issue a corrected package that states what changed and why. Do not quietly edit the original. The customer has a copy; if yours no longer matches theirs, nobody can tell which is right.

## Approval history

Every submission, approval, and rejection is recorded with who and when. That history is the record of due diligence when a customer asks how a package was checked.
