---
title: Email schedule
description: Every automated email, when it goes out, and who gets it.
keywords: [email, schedule, times, daily, weekly, notification, when]
---

Quick reference. All times are Central.

## Daily

| Time | Email | Contains | Recipients |
|---|---|---|---|
| **8:00 AM** | Daily Ready-to-Bill Report | Every job sitting in `Ready to bill` | Opted-in users, plus the accounting address |
| **12:00 PM** | Daily Review Notification | Reports sitting in `Ready for review`, grouped by job | Opted-in users |

## Weekly

| Time | Email | Contains | Recipients |
|---|---|---|---|
| **Monday 8:00 AM** | Weekly PO Report | Purchase order summary | Opted-in users |
| **Monday 8:00 AM** | Weekly Jobs Status Report | Jobs grouped by status | Opted-in users |

## Monthly

| Time | Email | Contains | Recipients |
|---|---|---|---|
| **1st, 8:00 AM** | Monthly Calibration Report | Field equipment due for calibration within 60 days, plus anything already overdue, grouped by site, truck or person | A list an administrator maintains, plus anyone who opted in |

## Triggered

| Fires when | Email | Goes to |
|---|---|---|
| A job's status changes to `Ready to bill` | Ready-to-Bill Notification | Accounting |

Immediate, not batched.

## Why these times

- **8:00 AM.** Billing and weekly summaries land before the day starts, so the work is visible when people sit down. The Monday reports also arrive before a Monday meeting.
- **12:00 PM.** The review notification lands midday, giving reviewers the afternoon to clear the queue before people leave.

## Opting in

Most of these are opt-in. Each user switches them on in their own settings; an administrator cannot simply add an address to the list.

Two exceptions:

- The **ready-to-bill notification** goes to a fixed accounting address configured at the instance level.
- The **monthly calibration report** goes to a list maintained in **Admin → Calibration Report Recipients**. Being on that list is enough; nobody has to opt in. A person can still switch it off for themselves, and anyone not on the list can switch it on.

## Empty editions

Every email here is suppressed when there is nothing to report, except the monthly calibration report. That one sends regardless, because "nothing due in the next 60 days" is the answer people want on the first of the month, and silence is indistinguishable from a broken schedule.

## Empty emails are not sent

If there is nothing to report, the email is suppressed. No reports awaiting review means no review email that day.

::: note
This is the most common false alarm. "The daily email stopped working" usually means the queue was empty. Good news, not a fault.
:::

## When one does not arrive

1. Was there anything to report?
2. Is the notification enabled in **Admin → Notification controls**?
3. Is the person opted in?
4. Check spam. Mail from a new instance often lands there for the first week.
5. Check the email address on their profile.
6. Check system logs for a send failure.

## Related

- [Notification controls](/docs/admin/notification-controls): the settings page
- [Automated emails](/docs/integrations/automated-emails): the fuller explanation
