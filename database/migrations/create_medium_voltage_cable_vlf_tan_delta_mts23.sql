-- Medium Voltage Cable VLF with Tan Delta MTS 23 test sheet (NETA MTS 7.3.3).
--
-- Built from the 2023 blank test sheet: visual/mechanical 7.3.3.A.1 through
-- 7.3.3.A.8 (the 2023 sheet adds A.6 fireproofing and A.8 cable schedule),
-- shield continuity, insulation resistance before and after the withstand test
-- with temperature correction, the VLF withstand run, and tan delta readings at
-- 0.5, 1.0 and 1.5 Uo per phase.
--
-- Supersedes medium_voltage_cable_vlf_test, medium_voltage_vlf_mts_reports,
-- tandelta_mts_reports and tan_delta_test_mts for new work; those tables stay as
-- they are so existing reports keep opening, printing and publishing.
--
-- Same job/user/report_data shape as the other MTS 23 report tables: the whole
-- form is one jsonb blob so the sheet can change without a migration.

CREATE TABLE IF NOT EXISTS neta_ops.medium_voltage_cable_vlf_tan_delta_mts23_reports (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id      UUID REFERENCES neta_ops.jobs(id) ON DELETE CASCADE,
  user_id     UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  report_data JSONB DEFAULT '{}'::jsonb,
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now()
);

COMMENT ON TABLE neta_ops.medium_voltage_cable_vlf_tan_delta_mts23_reports IS
  'MV Cable VLF with Tan Delta MTS 23 reports (NETA MTS 7.3.3): visual/mechanical, shield continuity, insulation resistance pre/post test, VLF withstand, tan delta by voltage step.';

-- Job Details lists a job's reports; every read is filtered by job_id.
CREATE INDEX IF NOT EXISTS medium_voltage_cable_vlf_tan_delta_mts23_reports_job_id_idx
  ON neta_ops.medium_voltage_cable_vlf_tan_delta_mts23_reports (job_id);

DROP TRIGGER IF EXISTS set_updated_at ON neta_ops.medium_voltage_cable_vlf_tan_delta_mts23_reports;
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON neta_ops.medium_voltage_cable_vlf_tan_delta_mts23_reports
  FOR EACH ROW EXECUTE FUNCTION common.set_updated_at();

ALTER TABLE neta_ops.medium_voltage_cable_vlf_tan_delta_mts23_reports ENABLE ROW LEVEL SECURITY;

-- Matches the other report tables: any signed-in technician may work any report.
DROP POLICY IF EXISTS "Authenticated users can view all reports"
  ON neta_ops.medium_voltage_cable_vlf_tan_delta_mts23_reports;
CREATE POLICY "Authenticated users can view all reports"
  ON neta_ops.medium_voltage_cable_vlf_tan_delta_mts23_reports FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Authenticated users can insert reports"
  ON neta_ops.medium_voltage_cable_vlf_tan_delta_mts23_reports;
CREATE POLICY "Authenticated users can insert reports"
  ON neta_ops.medium_voltage_cable_vlf_tan_delta_mts23_reports FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated users can update all reports"
  ON neta_ops.medium_voltage_cable_vlf_tan_delta_mts23_reports;
CREATE POLICY "Authenticated users can update all reports"
  ON neta_ops.medium_voltage_cable_vlf_tan_delta_mts23_reports FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated users can delete all reports"
  ON neta_ops.medium_voltage_cable_vlf_tan_delta_mts23_reports;
CREATE POLICY "Authenticated users can delete all reports"
  ON neta_ops.medium_voltage_cable_vlf_tan_delta_mts23_reports FOR DELETE TO authenticated USING (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON neta_ops.medium_voltage_cable_vlf_tan_delta_mts23_reports TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON neta_ops.medium_voltage_cable_vlf_tan_delta_mts23_reports TO service_role;
