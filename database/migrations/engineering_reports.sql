-- Engineering report templates and the reports made from them on each job.
--
-- Why: the engineering portal's Report builder tab saves Typst templates (cards with a
-- "New template" card), and each engineering job's Reports tab makes reports from them.
-- A report keeps its own copy of the template's files, so editing a template later never
-- changes a report that was already made.
--
--   neta_ops.engineering_report_templates   saved templates
--   neta_ops.engineering_job_reports        one row per report on a job
--
-- Pictures (logos) still come from the template bundled with ampOS that a template was
-- started from (base_template, e.g. 'power-system-study'). Uploaded SKM PDFs are not
-- saved yet.

-- ---------------------------------------------------------------------------
-- Templates
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS neta_ops.engineering_report_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  -- The bundled template that supplies pictures and field labels.
  base_template text NOT NULL DEFAULT 'power-system-study',
  -- Every Typst file, keyed by path ("/main.typ" -> text).
  sources jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT auth.uid(),
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  -- Deleting a template only hides it; reports made from it keep their own copy.
  deleted_at timestamptz
);

COMMENT ON TABLE neta_ops.engineering_report_templates IS
  'Typst report templates saved from the engineering portal''s Report builder tab.';

-- ---------------------------------------------------------------------------
-- Reports on jobs
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS neta_ops.engineering_job_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES neta_ops.jobs(id) ON DELETE CASCADE,
  name text NOT NULL,
  -- Where it came from: a saved template, or null for one bundled with ampOS.
  template_id uuid REFERENCES neta_ops.engineering_report_templates(id) ON DELETE SET NULL,
  base_template text NOT NULL DEFAULT 'power-system-study',
  -- This report's own copy of the Typst files.
  sources jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- Job field values typed into the report (project.typ keys -> text).
  field_values jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT auth.uid(),
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

COMMENT ON TABLE neta_ops.engineering_job_reports IS
  'Engineering reports on a job, each with its own copy of the template files it was made from.';

CREATE INDEX IF NOT EXISTS idx_engineering_job_reports_job_id
  ON neta_ops.engineering_job_reports (job_id);

-- ---------------------------------------------------------------------------
-- Access: employees only. Nothing is ever hard-deleted from the app (deleted_at).
-- ---------------------------------------------------------------------------

GRANT SELECT, INSERT, UPDATE ON TABLE neta_ops.engineering_report_templates TO authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE neta_ops.engineering_job_reports TO authenticated;
GRANT ALL ON TABLE neta_ops.engineering_report_templates TO service_role;
GRANT ALL ON TABLE neta_ops.engineering_job_reports TO service_role;

ALTER TABLE neta_ops.engineering_report_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE neta_ops.engineering_job_reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "engineering_report_templates_select" ON neta_ops.engineering_report_templates;
CREATE POLICY "engineering_report_templates_select"
  ON neta_ops.engineering_report_templates FOR SELECT
  TO authenticated
  USING (common.is_employee_user());

DROP POLICY IF EXISTS "engineering_report_templates_insert" ON neta_ops.engineering_report_templates;
CREATE POLICY "engineering_report_templates_insert"
  ON neta_ops.engineering_report_templates FOR INSERT
  TO authenticated
  WITH CHECK (common.is_employee_user());

DROP POLICY IF EXISTS "engineering_report_templates_update" ON neta_ops.engineering_report_templates;
CREATE POLICY "engineering_report_templates_update"
  ON neta_ops.engineering_report_templates FOR UPDATE
  TO authenticated
  USING (common.is_employee_user())
  WITH CHECK (common.is_employee_user());

DROP POLICY IF EXISTS "engineering_job_reports_select" ON neta_ops.engineering_job_reports;
CREATE POLICY "engineering_job_reports_select"
  ON neta_ops.engineering_job_reports FOR SELECT
  TO authenticated
  USING (common.is_employee_user());

DROP POLICY IF EXISTS "engineering_job_reports_insert" ON neta_ops.engineering_job_reports;
CREATE POLICY "engineering_job_reports_insert"
  ON neta_ops.engineering_job_reports FOR INSERT
  TO authenticated
  WITH CHECK (common.is_employee_user());

DROP POLICY IF EXISTS "engineering_job_reports_update" ON neta_ops.engineering_job_reports;
CREATE POLICY "engineering_job_reports_update"
  ON neta_ops.engineering_job_reports FOR UPDATE
  TO authenticated
  USING (common.is_employee_user())
  WITH CHECK (common.is_employee_user());
