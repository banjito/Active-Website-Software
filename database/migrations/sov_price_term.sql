-- The contract at the SOV's payment terms (Billing & SOV scope, item 9).
--
-- Why: a quote's amount is always its NET 30 letter price. A job billed at NET 90 showed
-- its SOV as over the contract by the difference (26136: $148,240).
--
--   neta_ops.job_sov_settings.price_term        net30 | net60 | net90, picked when copying
--   neta_ops.job_sov_settings.term_adjustment   dollars added to the quote's amount
--
-- Run after sov_gc_percent.sql. Safe to run twice. Existing rows are not changed.

SET lock_timeout = '5s';

BEGIN;

ALTER TABLE neta_ops.job_sov_settings
  ADD COLUMN IF NOT EXISTS price_term text,
  ADD COLUMN IF NOT EXISTS term_adjustment numeric NOT NULL DEFAULT 0;

ALTER TABLE neta_ops.job_sov_settings DROP CONSTRAINT IF EXISTS job_sov_settings_price_term_check;
ALTER TABLE neta_ops.job_sov_settings
  ADD CONSTRAINT job_sov_settings_price_term_check
  CHECK (price_term IS NULL OR price_term IN ('net30', 'net60', 'net90'));

COMMENT ON COLUMN neta_ops.job_sov_settings.price_term IS
  'Payment terms the SOV was copied at from the letter proposal.';
COMMENT ON COLUMN neta_ops.job_sov_settings.term_adjustment IS
  'Added to the quote amount (always the NET 30 letter price) so the contract matches the SOV terms.';

COMMIT;

NOTIFY pgrst, 'reload schema';
