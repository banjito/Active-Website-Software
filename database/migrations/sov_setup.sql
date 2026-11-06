-- SOV built from the estimate (Project Management scope, item 8).
--
-- Why: the SOV needs a few lines the estimate rows don't give it, so its total
-- matches the contract: general conditions (a monthly amount for a set number
-- of months), mobilization on its own line, and a multiplier for reserve
-- blocks (10 blocks show as one set of lines at 10 times the quantity).
-- Billing frequency is saved now for the weekly SOV and billing items.
--
--   neta_ops.job_sov_lines.line_type    scope | general_conditions | mobilization
--   neta_ops.job_sov_lines.multiplier   display only: quantity is already the total
--   neta_ops.job_sov_settings           one row per job
--
-- Same access as the SOV lines: PMs and admins, or the job's own PM.
-- Run after pm_dashboard.sql and pm_dashboard_job_pm.sql. Safe to run twice.

SET lock_timeout = '5s';

BEGIN;

ALTER TABLE neta_ops.job_sov_lines
  ADD COLUMN IF NOT EXISTS line_type text NOT NULL DEFAULT 'scope',
  ADD COLUMN IF NOT EXISTS multiplier numeric NOT NULL DEFAULT 1;

ALTER TABLE neta_ops.job_sov_lines DROP CONSTRAINT IF EXISTS job_sov_lines_line_type_check;
ALTER TABLE neta_ops.job_sov_lines
  ADD CONSTRAINT job_sov_lines_line_type_check
  CHECK (line_type IN ('scope', 'general_conditions', 'mobilization'));

COMMENT ON COLUMN neta_ops.job_sov_lines.line_type IS
  'scope (from the estimate or typed in), general_conditions, or mobilization.';
COMMENT ON COLUMN neta_ops.job_sov_lines.multiplier IS
  'How many times the estimate scope repeats (reserve blocks). Quantity and hours already include it; shown as "10 x 6".';

CREATE TABLE IF NOT EXISTS neta_ops.job_sov_settings (
  job_id uuid PRIMARY KEY REFERENCES neta_ops.jobs(id) ON DELETE CASCADE,
  billing_frequency text NOT NULL DEFAULT 'monthly'
    CHECK (billing_frequency IN ('monthly', 'weekly', 'one_time')),
  -- General conditions: billed each month from gc_start for gc_months, even if the job runs long
  gc_monthly numeric CHECK (gc_monthly IS NULL OR gc_monthly >= 0),
  gc_months integer CHECK (gc_months IS NULL OR gc_months BETWEEN 0 AND 120),
  gc_start date,
  -- true: general conditions came out of the other lines, so the SOV total stayed the same
  gc_from_price boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

COMMENT ON TABLE neta_ops.job_sov_settings IS
  'Per-job SOV settings: billing frequency and general conditions.';

-- Not report data: skip the automatic snapshot copies
DROP TRIGGER IF EXISTS trg_snapshot_job_sov_settings_ins ON neta_ops.job_sov_settings;
DROP TRIGGER IF EXISTS trg_snapshot_job_sov_settings_upd ON neta_ops.job_sov_settings;

ALTER TABLE neta_ops.job_sov_settings ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE neta_ops.job_sov_settings FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE neta_ops.job_sov_settings TO authenticated;
GRANT ALL ON TABLE neta_ops.job_sov_settings TO service_role;

DROP POLICY IF EXISTS job_sov_settings_select ON neta_ops.job_sov_settings;
CREATE POLICY job_sov_settings_select ON neta_ops.job_sov_settings
  FOR SELECT TO authenticated
  USING (common.is_pm_or_admin() OR common.is_job_pm(job_id));

DROP POLICY IF EXISTS job_sov_settings_write ON neta_ops.job_sov_settings;
CREATE POLICY job_sov_settings_write ON neta_ops.job_sov_settings
  FOR ALL TO authenticated
  USING (common.is_pm_or_admin() OR common.is_job_pm(job_id))
  WITH CHECK (common.is_pm_or_admin() OR common.is_job_pm(job_id));

COMMIT;

NOTIFY pgrst, 'reload schema';

-- Expected result: one row, every column true.
SELECT
  (SELECT count(*) = 2 FROM information_schema.columns
    WHERE table_schema = 'neta_ops' AND table_name = 'job_sov_lines'
      AND column_name IN ('line_type', 'multiplier')) AS line_columns,
  to_regclass('neta_ops.job_sov_settings') IS NOT NULL AS settings_table,
  (SELECT relrowsecurity FROM pg_class WHERE oid = to_regclass('neta_ops.job_sov_settings')) AS rls_on,
  NOT has_table_privilege('anon', 'neta_ops.job_sov_settings', 'SELECT') AS public_cannot_read,
  NOT EXISTS (SELECT 1 FROM pg_trigger
               WHERE tgrelid = to_regclass('neta_ops.job_sov_settings')
                 AND tgname LIKE 'trg_snapshot%') AS no_snapshot_triggers;
