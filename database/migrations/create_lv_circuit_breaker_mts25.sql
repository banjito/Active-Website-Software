-- LV Circuit Breaker MTS 25 test sheet (NETA MTS 7.6.1.2).
--
-- Maintenance-side twin of neta_ops.lv_molded_case_circuit_breaker_ats25. Same
-- job/user/report_data shape as every other report table: the whole form is one
-- jsonb blob so the sheet can change without a migration.

CREATE TABLE IF NOT EXISTS neta_ops.lv_circuit_breaker_mts25 (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id      UUID REFERENCES neta_ops.jobs(id) ON DELETE CASCADE,
  user_id     UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  report_data JSONB DEFAULT '{}'::jsonb,
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now()
);

COMMENT ON TABLE neta_ops.lv_circuit_breaker_mts25 IS
  'LV Circuit Breaker MTS 25 reports (NETA MTS 7.6.1.2): visual/mechanical, device settings, contact and insulation resistance, secondary injection, primary verification.';

-- Job Details lists a job's reports; every read is filtered by job_id.
CREATE INDEX IF NOT EXISTS lv_circuit_breaker_mts25_job_id_idx
  ON neta_ops.lv_circuit_breaker_mts25 (job_id);

CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON neta_ops.lv_circuit_breaker_mts25
  FOR EACH ROW EXECUTE FUNCTION common.set_updated_at();

ALTER TABLE neta_ops.lv_circuit_breaker_mts25 ENABLE ROW LEVEL SECURITY;

-- Matches the other report tables: any signed-in technician may work any report.
DROP POLICY IF EXISTS "Authenticated users can view all reports"
  ON neta_ops.lv_circuit_breaker_mts25;
CREATE POLICY "Authenticated users can view all reports"
  ON neta_ops.lv_circuit_breaker_mts25 FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Authenticated users can insert reports"
  ON neta_ops.lv_circuit_breaker_mts25;
CREATE POLICY "Authenticated users can insert reports"
  ON neta_ops.lv_circuit_breaker_mts25 FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated users can update all reports"
  ON neta_ops.lv_circuit_breaker_mts25;
CREATE POLICY "Authenticated users can update all reports"
  ON neta_ops.lv_circuit_breaker_mts25 FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated users can delete all reports"
  ON neta_ops.lv_circuit_breaker_mts25;
CREATE POLICY "Authenticated users can delete all reports"
  ON neta_ops.lv_circuit_breaker_mts25 FOR DELETE TO authenticated USING (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON neta_ops.lv_circuit_breaker_mts25 TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON neta_ops.lv_circuit_breaker_mts25 TO service_role;
