-- PM Dashboard: let a job's own PM see and edit that job.
--
-- Why: "My Jobs" shows each PM their jobs at every location. Until now only admins,
-- PM roles and location leads (common.is_pm_or_admin) could read job hours or edit an
-- SOV, so a PM named on a job (neta_ops.jobs.project_manager_id) saw empty hours.
-- This lets that PM in for their own jobs only.
--
-- Also closes a gap from pm_dashboard.sql: SOV prices were readable by every signed-in
-- user. Now only PMs, admins and the job's own PM can read them. The PM Dashboard is
-- the only screen that reads this table.
--
--   is_job_pm(job_id)           true when the signed-in user is that job's PM
--   time_job_hours_by_month()   now also answers for the job's own PM
--   job_sov_lines policies      read and write: PMs/admins, or the job's own PM
--
-- Safe to run twice. Run after pm_dashboard.sql and add_job_project_manager.sql.

SET lock_timeout = '5s';

-- ---------------------------------------------------------------------------
-- Is this person the job's PM?
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION common.is_job_pm(p_job_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
      FROM neta_ops.jobs j
     WHERE j.id = p_job_id
       AND j.project_manager_id = auth.uid()
  );
$$;

REVOKE ALL ON FUNCTION common.is_job_pm(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION common.is_job_pm(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- Hours per job per month: PMs and admins see any job, a job's PM sees theirs
-- ---------------------------------------------------------------------------

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
   WHERE j.job_id = ANY (p_job_ids)
     AND (common.is_pm_or_admin() OR common.is_job_pm(j.job_id))
     AND e.hours IS NOT NULL
   GROUP BY j.job_id, to_char(e.work_date, 'YYYY-MM');
$$;

REVOKE ALL ON FUNCTION common.time_job_hours_by_month(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION common.time_job_hours_by_month(uuid[]) TO authenticated;

-- ---------------------------------------------------------------------------
-- SOV lines
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "job_sov_lines_select_staff" ON neta_ops.job_sov_lines;
DROP POLICY IF EXISTS "job_sov_lines_select_pm" ON neta_ops.job_sov_lines;
CREATE POLICY "job_sov_lines_select_pm"
  ON neta_ops.job_sov_lines FOR SELECT
  TO authenticated
  USING (common.is_pm_or_admin() OR common.is_job_pm(job_id));

DROP POLICY IF EXISTS "job_sov_lines_write_pm" ON neta_ops.job_sov_lines;
CREATE POLICY "job_sov_lines_write_pm"
  ON neta_ops.job_sov_lines FOR ALL
  TO authenticated
  USING (common.is_pm_or_admin() OR common.is_job_pm(job_id))
  WITH CHECK (common.is_pm_or_admin() OR common.is_job_pm(job_id));

NOTIFY pgrst, 'reload schema';

-- Expected result: three rows, job_sov_lines_select_pm (SELECT) and
-- job_sov_lines_write_pm (ALL), plus is_job_pm listed as a function = true.
SELECT policyname AS name, cmd
  FROM pg_policies
 WHERE schemaname = 'neta_ops' AND tablename = 'job_sov_lines'
UNION ALL
SELECT 'is_job_pm exists', (to_regprocedure('common.is_job_pm(uuid)') IS NOT NULL)::text;
