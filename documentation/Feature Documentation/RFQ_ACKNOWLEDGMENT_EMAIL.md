# RFQ Acknowledgment Email (scoping)

Idea from Brian. When a customer sends us an RFQ (request for quote), they get an automatic "thanks, our estimating team is on it" email. Small effort, good customer experience.

Status: idea / not built.

## What already exists

Most of the plumbing is already in the app.

| Piece | Where | Notes |
|---|---|---|
| Email sending | `supabase/functions/_shared/email.ts` | Resend (email service we already pay for). Used by ready-to-bill, daily review, etc. |
| Company name / From address | `supabase/functions/_shared/companyConfig.ts` | White-label safe. No hardcoded company text. |
| Opportunities | `opportunities` table, `src/components/jobs/OpportunityDetail.tsx` | An RFQ is basically a new opportunity. Has `customer_id`, `contact_id`, `quote_number`, `sales_person`. |
| Triggered email pattern | `supabase/functions/ready-to-bill-notification` | Same shape we need: something happens in the app, email goes out. |
| Automated emails docs | `src/docs/content/integrations/automated-emails.md` | Add this email to the "Triggered emails" table when built. |

Nothing in the app is called "RFQ" today. Opportunities are the closest thing.

## How it would work

1. Someone creates a new opportunity (the RFQ) and picks a customer contact.
2. The app shows a checkbox: **"Send RFQ acknowledgment to [contact email]"**. Checked by default.
3. On save, an edge function (small server program on Supabase) sends the email.
4. The opportunity records that it was sent (date + who it went to), shown on the opportunity page.

Why a checkbox and not fully silent: some opportunities are internal leads, re-quotes, or verbal asks. Sending "thanks for your RFQ" to someone who never sent one looks sloppy. The checkbox gives the estimator the final say with zero extra clicks in the normal case.

### Example email

> **Subject:** We received your request, [Quote #]
>
> Hi [Contact first name],
>
> Thank you for your request for quote on **[Opportunity title]**. Our estimating team is reviewing it now and will follow up with a quote.
>
> Your reference number is **[Quote #]**. If you have drawings, one-lines, or site details to add, just reply to this email.
>
> Thank you,
> [Salesperson name]
> [Company name]

- **Reply-To** = the salesperson or estimating inbox, so replies reach a person, not a no-reply address.
- **CC** (optional) = salesperson, so they know it went out.

## What we'd need to build

1. **Database**: two columns on `opportunities`: `rfq_ack_sent_at` (when) and `rfq_ack_sent_to` (email). Stops double-sends and gives a record.
2. **Edge function**: `rfq-acknowledgment` in `supabase/functions/`. Copies the ready-to-bill pattern. Looks up opportunity + contact, sends email, stamps the columns.
3. **UI**: checkbox on the new-opportunity form. "Sent on [date]" line plus a "Resend" button on `OpportunityDetail`.
4. **Admin setting**: on/off switch in **Admin → Notification controls**, plus editable reply-to address. Needed for white-label instances (per-buyer copies of ampOS).
5. **Docs**: add a row to `automated-emails.md`.

Rough size: small. About 1 to 2 days.

## Decisions for you / Brian

- **Trigger**: checkbox on create (recommended), or auto-send whenever status is set to `quote`?
- **Who replies**: salesperson's email, or a shared estimating inbox?
- **Promise a timeline?** e.g. "within 2 business days". Nicer for the customer, but only if we can keep it.
- **No contact email on file**: skip silently, or warn the user?

## Cost

Resend bills per email sent. We already use it and RFQ volume is low, so it should stay inside the current plan. Check the Resend dashboard if volume grows.

## Later ideas (not in v1)

- Customer emails an RFQ to an inbox and the app creates the opportunity automatically. Much bigger job (inbound email parsing).
- Follow-up email when the quote is sent, or a nudge if no quote after X days.
- Show RFQ status in the customer portal (`documentation/ampOS_Customer_Portal_Plan.md`).
