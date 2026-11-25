-- General conditions as a percent, and a bond line (Billing & SOV scope, item 10).
--
--   neta_ops.job_sov_settings.gc_percent   percent of the contract; null = dollars a month
--   neta_ops.job_sov_lines.line_type       now allows 'bond'
--
-- The monthly dollars are still saved in gc_monthly, so billing reads the same numbers.
-- Run after sov_sections.sql. Safe to run twice. Existing rows are not changed.

SET lock_timeout = '5s';

BEGIN;

ALTER TABLE neta_ops.job_sov_settings
  ADD COLUMN IF NOT EXISTS gc_percent numeric;

ALTER TABLE neta_ops.job_sov_settings DROP CONSTRAINT IF EXISTS job_sov_settings_gc_percent_check;
ALTER TABLE neta_ops.job_sov_settings
  ADD CONSTRAINT job_sov_settings_gc_percent_check
  CHECK (gc_percent IS NULL OR gc_percent BETWEEN 0 AND 100);

ALTER TABLE neta_ops.job_sov_lines DROP CONSTRAINT IF EXISTS job_sov_lines_line_type_check;
ALTER TABLE neta_ops.job_sov_lines
  ADD CONSTRAINT job_sov_lines_line_type_check
  CHECK (line_type IN ('scope', 'general_conditions', 'mobilization', 'bond'));

COMMENT ON COLUMN neta_ops.job_sov_settings.gc_percent IS
  'General conditions as a percent of the original contract. Null means gc_monthly was typed in.';
COMMENT ON COLUMN neta_ops.job_sov_lines.line_type IS
  'scope (from the estimate or typed in), general_conditions, mobilization, or bond.';

COMMIT;

NOTIFY pgrst, 'reload schema';
