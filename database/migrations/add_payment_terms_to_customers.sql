-- Per-customer payment terms we are willing to offer on quotes / letter proposals.
-- NULL or empty array means "no restriction" (all of NET 30 / 60 / 90 are fair game),
-- which matches every existing row.
-- Restricted example: Lawson Electric -> allowed_payment_terms = '{net90}'.
ALTER TABLE common.customers
  ADD COLUMN IF NOT EXISTS allowed_payment_terms text[],
  ADD COLUMN IF NOT EXISTS payment_terms_note text;

-- Only the three terms the estimate sheet knows how to price.
ALTER TABLE common.customers
  DROP CONSTRAINT IF EXISTS customers_allowed_payment_terms_values;

ALTER TABLE common.customers
  ADD CONSTRAINT customers_allowed_payment_terms_values
  CHECK (
    allowed_payment_terms IS NULL
    OR allowed_payment_terms <@ ARRAY['net30', 'net60', 'net90']::text[]
  );

COMMENT ON COLUMN common.customers.allowed_payment_terms IS
  'Payment terms this customer may be offered (subset of net30/net60/net90). NULL/empty = no restriction. Surfaced to estimators on the estimate sheet and when generating a letter proposal.';

COMMENT ON COLUMN common.customers.payment_terms_note IS
  'Why the payment terms are restricted (e.g. paid-when-paid contracts, payment history). Shown to the estimator alongside the allowed terms.';
