-- Contactor VT Test Sheet (NETA ATS-2025 / MTS-2023 7.10.2).
-- Several voltage transformers (the PTs inside motor contactor cabinets) per
-- report: turns ratio, polarity and insulation resistance for each.
-- Page: src/components/reports/ContactorVtTestReport.tsx, route /jobs/:id/contactor-vt-test.
-- Safe to run more than once. The snapshot-to-backup triggers are added
-- automatically when the table is created.

SET lock_timeout = '5s';

CREATE TABLE IF NOT EXISTS neta_ops.contactor_vt_test_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid REFERENCES neta_ops.jobs(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  report_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

COMMENT ON TABLE neta_ops.contactor_vt_test_reports IS
  'Contactor VT Test Sheet (NETA 7.10.2): many voltage transformers per report. report_data = {report_info, units[], test_equipment, comments, status}.';

CREATE INDEX IF NOT EXISTS contactor_vt_test_reports_job_id_idx
  ON neta_ops.contactor_vt_test_reports (job_id);

CREATE OR REPLACE TRIGGER set_updated_at
  BEFORE UPDATE ON neta_ops.contactor_vt_test_reports
  FOR EACH ROW EXECUTE FUNCTION common.set_updated_at();

-- Same rule as the other report tables: staff only.
ALTER TABLE neta_ops.contactor_vt_test_reports ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Employees can manage records" ON neta_ops.contactor_vt_test_reports;
CREATE POLICY "Employees can manage records" ON neta_ops.contactor_vt_test_reports
  USING (common.is_employee_user())
  WITH CHECK (common.is_employee_user());

REVOKE ALL ON neta_ops.contactor_vt_test_reports FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON neta_ops.contactor_vt_test_reports TO authenticated, service_role;
