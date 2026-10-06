# RFQ Acknowledgment Email (scoping)

Idea from Brian. When a customer sends us an RFQ (request for quote), they get an automatic email. It thanks them, says our estimating team is working on it, and tells them when to expect the proposal. Small effort, good customer experience.

Status: built (v1). Needs migration run + function deploy.

## Decided

- **Trigger**: sends when a new opportunity is created.
- **Promised date**: the email says "You can expect a proposal by [date]". The date comes from the opportunity's existing **Proposal Due Date** field (`proposal_due_date`).
- **Replies**: go to estimating@ampqes.com (`COMPANY_ESTIMATING_EMAIL`, override per instance).
- **Date changes**: automatic "Updated proposal date" email when the due date moves after an acknowledgment went out.
- **No contact email**: checkbox is hidden with a note; nothing sent.

## As built

| Piece | File |
|---|---|
| Columns `rfq_ack_sent_at`, `rfq_ack_sent_to`, `rfq_ack_promised_date` | `database/migrations/rfq_acknowledgment.sql` (also in bootstrap) |
| Email function (both emails) | `supabase/functions/rfq-acknowledgment/index.ts` |
| Client helper | `src/lib/rfqAcknowledgment.ts` |
| Checkbox + required date on create | `src/components/jobs/OpportunityList.tsx` |
| Date-change email on save, status line, Send/Resend button | `src/components/jobs/OpportunityDetail.tsx` |

Not in v1: the T&M quick-create form, and an admin on/off switch (the per-opportunity checkbox is the control).

## What already exists

Most of the plumbing is already in the app.

| Piece | Where | Notes |
|---|---|---|
| Email sending | `supabase/functions/_shared/email.ts` | Resend (email service we already pay for). Used by ready-to-bill, daily review, etc. |
| Company name / From address | `supabase/functions/_shared/companyConfig.ts` | White-label safe. No hardcoded company text. |
| Opportunities | `opportunities` table, `src/components/jobs/OpportunityList.tsx` (create form), `OpportunityDetail.tsx` | Has `customer_id`, `contact_id`, `quote_number`, `sales_person`, `proposal_due_date`. |
| Triggered email pattern | `supabase/functions/ready-to-bill-notification` | Same shape we need: something happens in the app, email goes out. |
| Automated emails docs | `src/docs/content/integrations/automated-emails.md` | Add this email to the "Triggered emails" table when built. |

Nothing in the app is called "RFQ" today. A new opportunity is the RFQ.

## How it works

1. Someone creates a new opportunity, picks the customer contact, and sets the Proposal Due Date.
2. The create form shows a checkbox: **"Email RFQ acknowledgment to [contact email]"**. Checked by default.
3. On save, an edge function (small server program on Supabase) sends the email.
4. The opportunity records that it was sent (date + who it went to), shown on the opportunity page.

Why keep the checkbox: some opportunities are internal leads, re-quotes, or verbal asks. Thanking someone for an RFQ they never sent looks sloppy. Normal case is still zero extra clicks.

### Proposal Due Date becomes a customer promise

Today `proposal_due_date` is internal and optional. Once this ships, the customer sees it. So:

- **When the box is checked, Proposal Due Date is required.** The form won't save without it. No email with a blank date.
- The create form shows a hint under the date: *"Customer will see this date."* Stops people from guessing a date or entering the customer's bid deadline by mistake.

### Example email

> **Subject:** We received your request, [Quote #]
>
> Hi [Contact first name],
>
> Thank you for your request for quote on **[Opportunity title]**. Our estimating team is working on it now.
>
> **You can expect a proposal by [Proposal Due Date, e.g. Friday, October 16, 2026].**
>
> Your reference number is **[Quote #]**. If you have drawings, one-lines, or site details to add, just reply to this email.
>
> Thank you,
> [Salesperson name]
> [Company name]

- **Reply-To** = the salesperson or estimating inbox, so replies reach a person, not a no-reply address.
- **CC** (optional) = salesperson, so they know it went out.
- Date written out in full (weekday + month name). Avoids 10/16 vs 16/10 confusion.

## What we'd need to build

1. **Database**: two columns on `opportunities`: `rfq_ack_sent_at` (when) and `rfq_ack_sent_to` (email). Stops double-sends and gives a record.
2. **Edge function**: `rfq-acknowledgment` in `supabase/functions/`. Copies the ready-to-bill pattern. Looks up opportunity + contact + due date, sends email, stamps the columns.
3. **Create form** (`OpportunityList.tsx`): checkbox, required due date when checked, "Customer will see this date" hint. Call the edge function after the opportunity saves.
4. **Opportunity page** (`OpportunityDetail.tsx`): "Acknowledgment sent [date] to [email]" line plus a "Resend" button.
5. **Admin setting**: on/off switch in **Admin → Notification controls**, plus editable reply-to address. Needed for white-label instances (per-buyer copies of ampOS).
6. **Docs**: add a row to `automated-emails.md`.

Rough size: small. About 1 to 2 days.

## Cost

Resend bills per email sent. We already use it and RFQ volume is low, so it should stay inside the current plan. Check the Resend dashboard if volume grows.

## Later ideas (not in v1)

- Internal nudge to the estimator a day before the promised date if no proposal is attached yet.
- Customer emails an RFQ to an inbox and the app creates the opportunity automatically. Much bigger job (inbound email parsing).
- Show RFQ status in the customer portal (`documentation/ampOS_Customer_Portal_Plan.md`).
