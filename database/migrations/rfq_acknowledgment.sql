-- RFQ acknowledgment emails (supabase/functions/rfq-acknowledgment).
--
-- When an opportunity is created, the customer contact can be emailed a
-- "thanks for your RFQ, expect a proposal by <proposal_due_date>" note. If the
-- due date later moves, they get an "updated proposal date" email.
--
--   rfq_ack_sent_at        when the acknowledgment went out (null = never)
--   rfq_ack_sent_to        the address it went to
--   rfq_ack_promised_date  the proposal date the customer was last told; a
--                          date-change email only fires when proposal_due_date
--                          differs from this, so repeat saves never re-send
--
-- Safe to re-run.

ALTER TABLE business.opportunities
  ADD COLUMN IF NOT EXISTS rfq_ack_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS rfq_ack_sent_to text,
  ADD COLUMN IF NOT EXISTS rfq_ack_promised_date date;

NOTIFY pgrst, 'reload schema';
