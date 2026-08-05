---
title: Automated emails
description: The emails ampOS sends without anyone pressing send.
keywords: [email, notification, automated, daily, weekly, resend]
---

A handful of emails go out on their own. They exist to stop work sitting quietly: reports waiting on review, jobs waiting to be billed, POs waiting to be closed.

## Scheduled emails

| Email | When (CST) | Contains |
|---|---|---|
| **Daily Ready-to-Bill Report** | Daily, 8:00 AM | Every job currently sitting in `Ready to bill` |
| **Daily Review Notification** | Daily, 12:00 PM | Reports sitting in `Ready for review`, grouped by job |
| **Weekly PO Report** | Monday, 8:00 AM | Purchase order summary |
| **Weekly Jobs Status Report** | Monday, 8:00 AM | Jobs grouped by status |

## Triggered emails

| Email | Fires when | Goes to |
|---|---|---|
| **Ready-to-Bill Notification** | A job's status changes to `Ready to bill` | Accounting |

This one is immediate. The moment someone flips a job to ready to bill, accounting knows.

## Why the timing is what it is

- **8:00 AM.** Billing and weekly summaries land before the day starts, so the work is visible when people sit down.
- **12:00 PM.** The review notification lands midday, giving reviewers the afternoon to clear the queue before people leave.

## Who receives them

Two mechanisms, and confusing them causes most "I am not getting the email" questions.

**Opt-in.** The daily review and weekly reports go to users who switched them on in their own settings. Adding someone means they opt in; an administrator cannot simply add an address to the list.

**Fixed.** The ready-to-bill notification goes to the configured accounting address, set at the instance level.

## Empty emails are not sent

Most of these are suppressed when there is nothing to report. No reports awaiting review means no daily review email that day.

::: note
This is the single most common false alarm. "The daily email stopped working" usually means the review queue was empty, which is good news, not a fault.
:::

## Turning one off

From **Admin → Notification controls**.

::: warning
Turning off the daily review notification is how reports quietly rot in the queue. Nobody notices for two weeks, and then a deliverable is late. If you turn it off for a shutdown week, set a reminder to turn it back on.
:::

## Testing

Notification dev controls let an administrator fire an email on demand rather than waiting until tomorrow morning. Test after any change to recipients or email configuration.

## When one does not arrive

In order:

1. Was there anything to report? Empty emails are not sent.
2. Is the notification enabled in notification controls?
3. Is the person opted in, for opt-in emails?
4. Check spam. Mail from a new instance often lands there for the first week.
5. Check the email address on their profile for a typo.
6. Check system logs for a send failure.

## Customer-facing email

Separate from these. Deliverables and proposals are sent by a person, not automatically. ampOS generates the document, and a human decides who gets it and what the covering note says.

See [Delivering to the customer](/docs/deliverables/delivering).

## Related

- [Notification controls](/docs/admin/notification-controls): the settings page
- [Email schedule](/docs/reference/email-schedule): the quick-reference table
