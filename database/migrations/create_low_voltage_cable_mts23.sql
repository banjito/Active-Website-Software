-- Low Voltage Cable MTS 23 test sheet (NETA MTS 7.3.2, up to 12 sets).
--
-- Built from the 2023 blank test sheet: visual/mechanical 7.3.2.A.1 through A.5
-- (the older MTS report carried the 7.3.1 list), and up to 12 circuits, each
-- with a measured row and a 20°C corrected row, 3-wire or 4-wire, continuity
-- and a pass/fail result.
--
-- Supersedes low_voltage_cable_test_3sets for new MTS work; that table stays as
-- it is so existing reports keep opening, printing and publishing. The ATS
-- 12-set report this form was built from is unaffected.
--
-- Same job/user/report_data shape as the other MTS 23 report tables: the whole
-- form is one jsonb blob so the sheet can change without a migration.

CREATE TABLE IF NOT EXISTS neta_ops.low_voltage_cable_mts23_reports (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id      UUID REFERENCES neta_ops.jobs(id) ON DELETE CASCADE,
  user_id     UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  report_data JSONB DEFAULT '{}'::jsonb,
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now()
);

COMMENT ON TABLE neta_ops.low_voltage_cable_mts23_reports IS
  'Low Voltage Cable MTS 23 reports (NETA MTS 7.3.2): visual/mechanical, and up to 12 circuits with measured and 20°C corrected insulation resistance, continuity and pass/fail.';

-- Job Details lists a job's reports; every read is filtered by job_id.
CREATE INDEX IF NOT EXISTS low_voltage_cable_mts23_reports_job_id_idx
  ON neta_ops.low_voltage_cable_mts23_reports (job_id);

DROP TRIGGER IF EXISTS set_updated_at ON neta_ops.low_voltage_cable_mts23_reports;
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON neta_ops.low_voltage_cable_mts23_reports
  FOR EACH ROW EXECUTE FUNCTION common.set_updated_at();

ALTER TABLE neta_ops.low_voltage_cable_mts23_reports ENABLE ROW LEVEL SECURITY;

-- Matches the other report tables: any signed-in technician may work any report.
DROP POLICY IF EXISTS "Authenticated users can view all reports"
  ON neta_ops.low_voltage_cable_mts23_reports;
CREATE POLICY "Authenticated users can view all reports"
  ON neta_ops.low_voltage_cable_mts23_reports FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Authenticated users can insert reports"
  ON neta_ops.low_voltage_cable_mts23_reports;
CREATE POLICY "Authenticated users can insert reports"
  ON neta_ops.low_voltage_cable_mts23_reports FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated users can update all reports"
  ON neta_ops.low_voltage_cable_mts23_reports;
CREATE POLICY "Authenticated users can update all reports"
  ON neta_ops.low_voltage_cable_mts23_reports FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated users can delete all reports"
  ON neta_ops.low_voltage_cable_mts23_reports;
CREATE POLICY "Authenticated users can delete all reports"
  ON neta_ops.low_voltage_cable_mts23_reports FOR DELETE TO authenticated USING (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON neta_ops.low_voltage_cable_mts23_reports TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON neta_ops.low_voltage_cable_mts23_reports TO service_role;
