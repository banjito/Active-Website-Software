---
title: Notification controls
description: Which automated emails fire, who gets them, and how to test one.
keywords: [notification, email, alerts, recipients, opt in, schedule]
---

ampOS sends several emails on its own. This page controls which are enabled and who receives them.

## The emails

| Email | When | Who gets it |
|---|---|---|
| **Daily Review Notification** | Daily, 12:00 PM CST | Users opted in to daily review |
| **Daily Ready-to-Bill Report** | Daily, 8:00 AM CST | Opted-in users plus the accounting address |
| **Ready-to-Bill Notification** | Immediately, on job status change | Accounting |
| **Weekly PO Report** | Monday, 8:00 AM CST | Users opted in to weekly reports |
| **Weekly Jobs Status Report** | Monday, 8:00 AM CST | Users opted in to weekly reports |

Full detail in [Email schedule](/docs/reference/email-schedule).

## Opt-in versus fixed recipients

Two different mechanisms, and mixing them up is why "I am not getting the email" is such a common question.

- **Opt-in emails** go to users who have switched them on in their own settings. Adding someone means asking them to opt in, or opting them in on their behalf.
- **Fixed recipients** are configured at the instance level: the accounting address for billing notifications.

::: note
If someone is not receiving the daily review email, the first thing to check is their own notification settings, not this page.
:::

## Turning one off

You can, and occasionally you should: during a shutdown week, or while a division is being reorganized.

::: warning
Turning off the daily review notification is how reports quietly rot in the queue. Nobody notices for two weeks, and then a deliverable is late. If you turn it off, put a reminder in your calendar to turn it back on.
:::

## Testing

Use the notification dev controls to fire an email on demand rather than waiting for tomorrow morning.

Test whenever you:

- Change a recipient
- Add a new person who should be receiving something
- Change the instance's email configuration

## When an email did not arrive

Work through it in this order:

1. **Is the notification enabled here?**
2. **Is the person opted in**, for opt-in emails?
3. **Was there anything to report?** Most of these emails are suppressed when there is nothing in them. No reports awaiting review means no daily review email. That is correct behavior, not a failure.
4. **Check spam.** Automated mail from a new instance frequently lands there for the first week.
5. **Check the email address on their profile.** A typo sends it nowhere.
6. **Check system logs** for a send failure.

## Adding a recipient

For opt-in emails, the person opts in from their own settings.

For fixed-recipient emails, the address is instance configuration. Changing it is a configuration change, not a user setting.

## Timing

The scheduled emails run on fixed times in Central. They are set that way for a reason:

- **8:00 AM.** The billing and weekly reports land before the day starts, so the work is visible when people sit down.
- **12:00 PM.** The review notification lands midday, giving reviewers the afternoon to clear the queue before people leave.

Moving these is possible but think about what the timing is for before you do.
