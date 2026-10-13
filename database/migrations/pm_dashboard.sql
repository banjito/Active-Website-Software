-- PM Dashboard
--
-- Why: project managers need one place to see a job month by month: what got done,
-- what it is worth, how many hours it took, and how much has been billed.
--
--   job_sov_lines              the job's schedule of values (line, qty, hours, $ each)
--                              and which report types count toward each line
--   is_pm_or_admin()           who may edit the SOV and see job hour totals
--   time_job_hours_by_month()  hours per job per month from the TimeStAMP clock
--
-- Time entries stay private: only the person and payroll can read them. PMs get job
-- totals through the function below, never who worked them.

-- ---------------------------------------------------------------------------
-- Who counts as a PM
-- ---------------------------------------------------------------------------

-- Admins, operations managers, and anyone named as a division lead in
-- common.app_settings ('division_leads': { "<division>": { id, email, name } }).
CREATE OR REPLACE FUNCTION common.is_pm_or_admin() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT COALESCE((auth.jwt() -> 'user_metadata' ->> 'role'), '')
           IN ('Admin', 'Super Admin', 'Operations Manager', 'Project Manager')
      OR EXISTS (
           SELECT 1
             FROM common.app_settings s
            CROSS JOIN LATERAL jsonb_each(s.value) AS lead
            WHERE s.key = 'division_leads'
              AND jsonb_typeof(s.value) = 'object'
              AND lead.value ->> 'id' = auth.uid()::text
         );
$$;

REVOKE ALL ON FUNCTION common.is_pm_or_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION common.is_pm_or_admin() TO authenticated;

-- ---------------------------------------------------------------------------
-- Schedule of values
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS neta_ops.job_sov_lines (
  -- Made in the browser, so a save sent twice is stored once
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES neta_ops.jobs(id) ON DELETE CASCADE,
  sort_order int NOT NULL DEFAULT 0,
  item text NOT NULL DEFAULT '',
  quantity numeric NOT NULL DEFAULT 0,
  -- Estimated hours for the whole line, not per unit
  total_hours numeric NOT NULL DEFAULT 0,
  unit_price numeric NOT NULL DEFAULT 0,
  -- Report types whose sent reports count as a finished unit of this line
  report_slugs text[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_job_sov_lines_job_id ON neta_ops.job_sov_lines (job_id);

DROP TRIGGER IF EXISTS trg_job_sov_lines_updated_at ON neta_ops.job_sov_lines;
CREATE TRIGGER trg_job_sov_lines_updated_at
  BEFORE UPDATE ON neta_ops.job_sov_lines
  FOR EACH ROW EXECUTE FUNCTION common.set_updated_at();

REVOKE ALL ON TABLE neta_ops.job_sov_lines FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE neta_ops.job_sov_lines TO authenticated;
GRANT ALL ON TABLE neta_ops.job_sov_lines TO service_role;

ALTER TABLE neta_ops.job_sov_lines ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "job_sov_lines_select_staff" ON neta_ops.job_sov_lines;
CREATE POLICY "job_sov_lines_select_staff"
  ON neta_ops.job_sov_lines FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "job_sov_lines_write_pm" ON neta_ops.job_sov_lines;
CREATE POLICY "job_sov_lines_write_pm"
  ON neta_ops.job_sov_lines FOR ALL
  TO authenticated
  USING (common.is_pm_or_admin())
  WITH CHECK (common.is_pm_or_admin());

-- ---------------------------------------------------------------------------
-- Hours per job per month
-- ---------------------------------------------------------------------------

-- Totals only. Open punches (still on the clock) have no hours yet and are skipped.
CREATE OR REPLACE FUNCTION common.time_job_hours_by_month(p_job_ids uuid[])
RETURNS TABLE (job_id uuid, month text, hours numeric)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT j.job_id,
         to_char(e.work_date, 'YYYY-MM') AS month,
         COALESCE(sum(e.hours), 0) AS hours
    FROM common.time_entries e
    JOIN common.time_jobs j ON j.qb_time_jobcode_id = e.qb_time_jobcode_id
   WHERE common.is_pm_or_admin()
     AND j.job_id = ANY (p_job_ids)
     AND e.hours IS NOT NULL
   GROUP BY j.job_id, to_char(e.work_date, 'YYYY-MM');
$$;

REVOKE ALL ON FUNCTION common.time_job_hours_by_month(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION common.time_job_hours_by_month(uuid[]) TO authenticated;
