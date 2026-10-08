# TimeStAMP: App Store listing

Copy to paste into App Store Connect. Character limits are Apple's. Counts are in brackets.

## Read this first

**Internal apps usually get turned away from the public App Store.** Apple's rule 3.2 says an app
built for one company's staff should not be a normal public listing. Two ways that fit:

- **Unlisted app.** A normal App Store app that only people with the link can find. You ask Apple
  for it with a short form after the app is approved. Crews install from a link.
- **Custom app through Apple Business Manager.** Private to AMP. More setup.

The scope picked a private listing. Unlisted is the lighter of the two. TestFlight alone also works
for a pilot: up to 10,000 testers by email or link, but each build expires after 90 days.

Everything below is the same either way.

## Name and subtitle

| Field | Text | Limit |
| --- | --- | --- |
| App name | `TimeStAMP` [9] | 30 |
| App name, if that is taken | `TimeStAMP: AMP Time Clock` [25] | 30 |
| Subtitle | `Clock in. Get approved. Done.` [29] | 30 |

Apple requires a name nobody else is using, so the first one may be refused.

## Promotional text (170)

Shows above the description. Can be changed any time without a new review.

```
Clock in from the job site in one tap. Pick your job, log per diem and miles, and send your week to your approver. No more chasing timesheets on Monday.
```

## Description (4000)

```
TimeStAMP is the time clock for AMP crews.

Clock in when you get to the job. Clock out when you leave. Your hours go to your approver at the end of the week, and from there to payroll. That's it.

ONE TAP TO CLOCK IN
Your last job is already picked. Tap once and you're on the clock. Search any job by number, name, or customer. Shop and Training are always one tap away.

ROUNDED IN YOUR FAVOR
Time is counted to the quarter hour. Clock in rounds back. Clock out rounds forward. The app shows you exactly what a punch will count as before you tap.

LUNCH AND JOB SWITCHES
Clock out for lunch and back in with one button. Moving to another job mid-day? Switch jobs without clocking out. No minute is counted twice.

PER DIEM AND MILES
Check a box for per diem. Type your miles. Both ride along with your hours so they make it onto your paycheck.

YOUR WEEK AT A GLANCE
See your hours for the week, day by day. Forgot to clock out? Fix it yourself and say why. Missed a whole punch? Add it. Your approver sees every change.

NEVER MISS A PUNCH
If you haven't clocked in a few minutes after your start time, your phone reminds you. One tap opens the clock. Taking the day off? Switch the reminder off for today.

PRIVATE BY DESIGN
Your approver sees your hours and your jobs. Nothing else. No pay rates, no personal details. TimeStAMP holds hours, not payroll records.

WORKS WITH YOUR AMPOS LOGIN
Sign in with the same email and password you use for ampOS. Light and dark mode follow your phone.

TimeStAMP is for AMP employees. You need an AMP account to sign in.
```

## Keywords (100)

Comma separated, no spaces after commas. Words already in the name and subtitle are left out on
purpose, since Apple counts those anyway.

```
time clock,timesheet,punch,hours,payroll,job,crew,field,per diem,mileage,work,tracker,employee
```

## What's New (4000)

```
First release.
```

## Categories and rating

- **Primary category:** Business
- **Secondary category:** Productivity
- **Age rating:** 4+ (answer "None" to every content question)
- **Price:** Free
- **Copyright:** `2026` plus AMP's legal company name

## Links you need before you can submit

Apple will not accept the listing without the first two.

| Field | Needed | Note |
| --- | --- | --- |
| Privacy Policy URL | Yes | A web page saying what the app collects. See "App Privacy" below for the facts to put in it. |
| Support URL | Yes | Any page with a way to reach AMP. A contact page is fine. |
| Marketing URL | No | Leave blank. |

## App Privacy answers

Apple asks what the app collects. These match what the app does today.

**Does the app track people across other companies' apps or sites?** No.

**Data collected, all linked to the person, all for "App Functionality" only:**

| Apple's category | What it is in TimeStAMP |
| --- | --- |
| Contact Info: Email Address | The ampOS sign-in |
| Contact Info: Name | Shown to the approver |
| Identifiers: User ID | The ampOS account ID |
| Other Data | Clock in and out times, job worked, per diem, miles, and the reason typed when fixing a punch |

**Not collected:** location, contacts, photos, health, payment details, browsing, advertising data.

Version 1 does not record where a person is when they clock in. If that is ever added, this section
and the privacy policy must change first.

## Notes for App Review

Reviewers must be able to sign in. Paste this into "App Review Information" and fill in the two
blanks in App Store Connect itself. Do not save the password in this file.

```
TimeStAMP is a time clock for employees of AMP. An AMP account is required, so a test account is provided below.

Sign-in: use the demo account in the Sign-In Information fields above.

To test:
1. Sign in.
2. On the Clock tab, tap "Shop" in the job list, then "Clock in to Shop".
3. The screen changes to a running timer. Tap "Lunch", then "Back from lunch", then "Clock out".
4. Tap "My week" to see the punches. Tap a punch to fix it, or "Add a missed punch".

Notifications: the app asks permission so it can remind an employee who has not clocked in by their start time. The reminders are local to the phone. There is no push server and no marketing.

Hours recorded by the demo account are not sent to payroll.
```

- **Demo account email:** the tester account's email
- **Demo account password:** type it into App Store Connect only

That last line of the note is true as long as nobody approves the demo account's week. Hours only
reach QuickBooks after an approval.

## Screenshots

Apple requires the 6.9 inch iPhone size (1320 x 2868, or 1290 x 2796). Take them on a recent
Pro Max, or in Xcode's simulator. Five is plenty. iPad is switched off for this app, so no iPad
shots are needed.

| # | Screen | Caption |
| --- | --- | --- |
| 1 | Clock tab, clocked out, a job picked | One tap to clock in |
| 2 | Clock tab, clocked in, timer running | See your time as it counts |
| 3 | Clock tab, per diem ticked and miles filled | Per diem and miles, done in seconds |
| 4 | My week with a few days of hours | Your week at a glance |
| 5 | Lock screen with the reminder | Never miss a punch |

Use a job with a made-up name for the shots, or blur the customer. Real customer names should not
be in a store listing.

## Short blurbs

For an email or a text to the crews when it goes live.

**One line:**
```
TimeStAMP is here: clock in from your phone, and your hours go straight to your approver.
```

**Short:**
```
Starting [date], we clock in with TimeStAMP instead of QuickBooks Time.

Sign in with your ampOS email and password. Pick your job. Tap Clock in. That's it.

Your phone will remind you if you forget. Per diem and miles go in the same screen. On Monday your approver signs off on the week.

Install: [link]
```

The second blurb names the switch on purpose. Anyone who keeps clocking in on QuickBooks Time after
the switch would have their hours counted twice.
