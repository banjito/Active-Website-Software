-- Large Dry Type Transformer MTS 23 test sheet (NETA MTS 7.2.1.2).
--
-- Built from the 2023 blank test sheet: visual/mechanical 7.2.1.2.A.1 through
-- A.11, insulation resistance at 0.5, 1 and 10 minutes with dielectric
-- absorption and polarization index, turns ratio by tap, and the three tests the
-- 2023 sheet adds: insulation power factor (injection at primary and at
-- secondary), excitation per tap and phase, and winding resistance for the HV
-- and LV windings with temperature correction.
--
-- The sheet leaves the power factor and excitation assessment as a manual
-- Pass / Fail / Investigate pick, noting there is no industry consensus for the
-- values, so the report does the same rather than inventing a limit.
--
-- Supersedes large_dry_type_transformer_mts_reports for new work; that table
-- stays as it is so existing reports keep opening, printing and publishing.
--
-- Same job/user/report_data shape as the other MTS 23 report tables: the whole
-- form is one jsonb blob so the sheet can change without a migration.

CREATE TABLE IF NOT EXISTS neta_ops.large_dry_type_xfmr_mts23_reports (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id      UUID REFERENCES neta_ops.jobs(id) ON DELETE CASCADE,
  user_id     UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  report_data JSONB DEFAULT '{}'::jsonb,
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now()
);

COMMENT ON TABLE neta_ops.large_dry_type_xfmr_mts23_reports IS
  'Large Dry Type Transformer MTS 23 reports (NETA MTS 7.2.1.2): visual/mechanical, insulation resistance with DAR and polarization index, turns ratio, insulation power factor, excitation and winding resistance.';

-- Job Details lists a job's reports; every read is filtered by job_id.
CREATE INDEX IF NOT EXISTS large_dry_type_xfmr_mts23_reports_job_id_idx
  ON neta_ops.large_dry_type_xfmr_mts23_reports (job_id);

DROP TRIGGER IF EXISTS set_updated_at ON neta_ops.large_dry_type_xfmr_mts23_reports;
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON neta_ops.large_dry_type_xfmr_mts23_reports
  FOR EACH ROW EXECUTE FUNCTION common.set_updated_at();

ALTER TABLE neta_ops.large_dry_type_xfmr_mts23_reports ENABLE ROW LEVEL SECURITY;

-- Matches the other report tables: any signed-in technician may work any report.
DROP POLICY IF EXISTS "Authenticated users can view all reports"
  ON neta_ops.large_dry_type_xfmr_mts23_reports;
CREATE POLICY "Authenticated users can view all reports"
  ON neta_ops.large_dry_type_xfmr_mts23_reports FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Authenticated users can insert reports"
  ON neta_ops.large_dry_type_xfmr_mts23_reports;
CREATE POLICY "Authenticated users can insert reports"
  ON neta_ops.large_dry_type_xfmr_mts23_reports FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated users can update all reports"
  ON neta_ops.large_dry_type_xfmr_mts23_reports;
CREATE POLICY "Authenticated users can update all reports"
  ON neta_ops.large_dry_type_xfmr_mts23_reports FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated users can delete all reports"
  ON neta_ops.large_dry_type_xfmr_mts23_reports;
CREATE POLICY "Authenticated users can delete all reports"
  ON neta_ops.large_dry_type_xfmr_mts23_reports FOR DELETE TO authenticated USING (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON neta_ops.large_dry_type_xfmr_mts23_reports TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON neta_ops.large_dry_type_xfmr_mts23_reports TO service_role;
