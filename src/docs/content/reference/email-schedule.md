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

The exception is the ready-to-bill notification, which goes to a fixed accounting address configured at the instance level.

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
