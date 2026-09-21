-- LV Circuit Breaker MTS 23 test sheet (NETA MTS 7.6.1.1 / 7.6.1.2).
--
-- Built from the 2023 blank test sheet, which covers molded-case, insulated-case
-- and power breakers in one form: the visual/mechanical checklist switches
-- between 7.6.1.1 (molded/insulated case) and 7.6.1.2 (power) on breaker type.
-- Replaces three MTS reports for new work: lv_circuit_breaker_mts25,
-- low_voltage_circuit_breaker_electronic_trip_mts and
-- low_voltage_circuit_breaker_thermal_magnetic_mts_reports. Those tables stay
-- as they are so existing reports keep opening, printing and publishing.
--
-- Same job/user/report_data shape as every other report table: the whole form is
-- one jsonb blob so the sheet can change without a migration.

CREATE TABLE IF NOT EXISTS neta_ops.lv_circuit_breaker_mts23_reports (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id      UUID REFERENCES neta_ops.jobs(id) ON DELETE CASCADE,
  user_id     UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  report_data JSONB DEFAULT '{}'::jsonb,
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now()
);

COMMENT ON TABLE neta_ops.lv_circuit_breaker_mts23_reports IS
  'LV Circuit Breaker MTS 23 reports (NETA MTS 7.6.1.1 / 7.6.1.2): visual/mechanical, counter readings, device settings as-found/as-left, contact and insulation resistance, current sensing by primary or secondary injection.';

-- Job Details lists a job's reports; every read is filtered by job_id.
CREATE INDEX IF NOT EXISTS lv_circuit_breaker_mts23_reports_job_id_idx
  ON neta_ops.lv_circuit_breaker_mts23_reports (job_id);

DROP TRIGGER IF EXISTS set_updated_at ON neta_ops.lv_circuit_breaker_mts23_reports;
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON neta_ops.lv_circuit_breaker_mts23_reports
  FOR EACH ROW EXECUTE FUNCTION common.set_updated_at();

ALTER TABLE neta_ops.lv_circuit_breaker_mts23_reports ENABLE ROW LEVEL SECURITY;

-- Matches the other report tables: any signed-in technician may work any report.
DROP POLICY IF EXISTS "Authenticated users can view all reports"
  ON neta_ops.lv_circuit_breaker_mts23_reports;
CREATE POLICY "Authenticated users can view all reports"
  ON neta_ops.lv_circuit_breaker_mts23_reports FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Authenticated users can insert reports"
  ON neta_ops.lv_circuit_breaker_mts23_reports;
CREATE POLICY "Authenticated users can insert reports"
  ON neta_ops.lv_circuit_breaker_mts23_reports FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated users can update all reports"
  ON neta_ops.lv_circuit_breaker_mts23_reports;
CREATE POLICY "Authenticated users can update all reports"
  ON neta_ops.lv_circuit_breaker_mts23_reports FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated users can delete all reports"
  ON neta_ops.lv_circuit_breaker_mts23_reports;
CREATE POLICY "Authenticated users can delete all reports"
  ON neta_ops.lv_circuit_breaker_mts23_reports FOR DELETE TO authenticated USING (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON neta_ops.lv_circuit_breaker_mts23_reports TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON neta_ops.lv_circuit_breaker_mts23_reports TO service_role;
