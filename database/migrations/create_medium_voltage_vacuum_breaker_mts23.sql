-- Medium Voltage Vacuum Circuit Breaker MTS 23 test sheet (NETA MTS 7.6.3).
--
-- Built from the 2023 blank test sheet: visual/mechanical 7.6.3.A.1 through
-- A.15 (the 2023 sheet adds A.4 operator analysis / first-trip and A.5 as-found
-- tests), counter and E-gap readings, the new contact timing test (open and
-- close speed per pole), contact resistance, insulation resistance, dielectric
-- withstand with the breaker closed and vacuum integrity with it open.
--
-- The blank sheet numbers two items A.8; the second is A.9 in NETA, and that is
-- what this report uses.
--
-- Supersedes medium_voltage_circuit_breaker_mts_reports for new work; that table
-- stays as it is so existing reports keep opening, printing and publishing.
--
-- Same job/user/report_data shape as the other MTS 23 report tables: the whole
-- form is one jsonb blob so the sheet can change without a migration.

CREATE TABLE IF NOT EXISTS neta_ops.medium_voltage_vacuum_breaker_mts23_reports (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id      UUID REFERENCES neta_ops.jobs(id) ON DELETE CASCADE,
  user_id     UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  report_data JSONB DEFAULT '{}'::jsonb,
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now()
);

COMMENT ON TABLE neta_ops.medium_voltage_vacuum_breaker_mts23_reports IS
  'MV Vacuum Circuit Breaker MTS 23 reports (NETA MTS 7.6.3): visual/mechanical, counter and E-gap, contact timing, contact resistance, insulation resistance, dielectric withstand closed and vacuum integrity open.';

-- Job Details lists a job's reports; every read is filtered by job_id.
CREATE INDEX IF NOT EXISTS medium_voltage_vacuum_breaker_mts23_reports_job_id_idx
  ON neta_ops.medium_voltage_vacuum_breaker_mts23_reports (job_id);

DROP TRIGGER IF EXISTS set_updated_at ON neta_ops.medium_voltage_vacuum_breaker_mts23_reports;
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON neta_ops.medium_voltage_vacuum_breaker_mts23_reports
  FOR EACH ROW EXECUTE FUNCTION common.set_updated_at();

ALTER TABLE neta_ops.medium_voltage_vacuum_breaker_mts23_reports ENABLE ROW LEVEL SECURITY;

-- Matches the other report tables: any signed-in technician may work any report.
DROP POLICY IF EXISTS "Authenticated users can view all reports"
  ON neta_ops.medium_voltage_vacuum_breaker_mts23_reports;
CREATE POLICY "Authenticated users can view all reports"
  ON neta_ops.medium_voltage_vacuum_breaker_mts23_reports FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Authenticated users can insert reports"
  ON neta_ops.medium_voltage_vacuum_breaker_mts23_reports;
CREATE POLICY "Authenticated users can insert reports"
  ON neta_ops.medium_voltage_vacuum_breaker_mts23_reports FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated users can update all reports"
  ON neta_ops.medium_voltage_vacuum_breaker_mts23_reports;
CREATE POLICY "Authenticated users can update all reports"
  ON neta_ops.medium_voltage_vacuum_breaker_mts23_reports FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated users can delete all reports"
  ON neta_ops.medium_voltage_vacuum_breaker_mts23_reports;
CREATE POLICY "Authenticated users can delete all reports"
  ON neta_ops.medium_voltage_vacuum_breaker_mts23_reports FOR DELETE TO authenticated USING (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON neta_ops.medium_voltage_vacuum_breaker_mts23_reports TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON neta_ops.medium_voltage_vacuum_breaker_mts23_reports TO service_role;
