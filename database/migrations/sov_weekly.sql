-- PMs update the SOV every week (Project Management scope, item 9).
--
-- Why: billing should be ready any time, not rebuilt at month end, and estimating
-- needs real feedback (we estimated 3,500 hours; did it take 4,020?). Each week the
-- PM enters how much of each SOV line got done, then approves the week. Sent
-- reports only suggest the numbers; typed numbers win.
--
--   neta_ops.job_sov_periods      one row per job and week: draft or approved,
--                                 with the work-in-progress $ and hours at approval
--   neta_ops.job_sov_quantities   units done that week, per SOV line
--   common.time_job_hours_by_week clock hours plus temp hours, by week
--
-- Weeks run Sunday to Saturday, like pay weeks. A week counts toward the month its
-- Wednesday falls in, the same rule temp hours use.
--
-- Same access as the SOV: PMs and admins, or the job's own PM.
-- Run after sov_setup.sql and temp_hours.sql. Safe to run twice.

SET lock_timeout = '5s';

BEGIN;

CREATE TABLE IF NOT EXISTS neta_ops.job_sov_periods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES neta_ops.jobs(id) ON DELETE CASCADE,
  week_start date NOT NULL CHECK (extract(dow FROM week_start) = 0),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'approved')),
  -- Snapshots taken when the week is approved, for the projection sheet
  wip_amount numeric(14,2),
  hours numeric(10,2),
  saved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  saved_at timestamptz NOT NULL DEFAULT now(),
  approved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_at timestamptz,
  CONSTRAINT job_sov_periods_one_per_week UNIQUE (job_id, week_start)
);

CREATE TABLE IF NOT EXISTS neta_ops.job_sov_quantities (
  period_id uuid NOT NULL REFERENCES neta_ops.job_sov_periods(id) ON DELETE CASCADE,
  line_id uuid NOT NULL REFERENCES neta_ops.job_sov_lines(id) ON DELETE CASCADE,
  quantity numeric NOT NULL DEFAULT 0 CHECK (quantity >= 0),
  PRIMARY KEY (period_id, line_id)
);

CREATE INDEX IF NOT EXISTS idx_job_sov_periods_job ON neta_ops.job_sov_periods (job_id, week_start);
CREATE INDEX IF NOT EXISTS idx_job_sov_quantities_line ON neta_ops.job_sov_quantities (line_id);

COMMENT ON TABLE neta_ops.job_sov_periods IS
  'Weekly SOV update per job. Typed quantities win over sent-report suggestions.';

-- Not report data: skip the automatic snapshot copies
DROP TRIGGER IF EXISTS trg_snapshot_job_sov_periods_ins ON neta_ops.job_sov_periods;
DROP TRIGGER IF EXISTS trg_snapshot_job_sov_periods_upd ON neta_ops.job_sov_periods;
DROP TRIGGER IF EXISTS trg_snapshot_job_sov_quantities_ins ON neta_ops.job_sov_quantities;
DROP TRIGGER IF EXISTS trg_snapshot_job_sov_quantities_upd ON neta_ops.job_sov_quantities;

ALTER TABLE neta_ops.job_sov_periods ENABLE ROW LEVEL SECURITY;
ALTER TABLE neta_ops.job_sov_quantities ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE neta_ops.job_sov_periods, neta_ops.job_sov_quantities FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE neta_ops.job_sov_periods, neta_ops.job_sov_quantities TO authenticated;
GRANT ALL ON TABLE neta_ops.job_sov_periods, neta_ops.job_sov_quantities TO service_role;

DROP POLICY IF EXISTS job_sov_periods_pm ON neta_ops.job_sov_periods;
CREATE POLICY job_sov_periods_pm ON neta_ops.job_sov_periods
  FOR ALL TO authenticated
  USING (common.is_pm_or_admin() OR common.is_job_pm(job_id))
  WITH CHECK (common.is_pm_or_admin() OR common.is_job_pm(job_id));

DROP POLICY IF EXISTS job_sov_quantities_pm ON neta_ops.job_sov_quantities;
CREATE POLICY job_sov_quantities_pm ON neta_ops.job_sov_quantities
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM neta_ops.job_sov_periods p
                  WHERE p.id = period_id
                    AND (common.is_pm_or_admin() OR common.is_job_pm(p.job_id))))
  WITH CHECK (EXISTS (SELECT 1 FROM neta_ops.job_sov_periods p
                       WHERE p.id = period_id
                         AND (common.is_pm_or_admin() OR common.is_job_pm(p.job_id))));

-- Clock hours plus temp hours, by week (Sunday start)
CREATE OR REPLACE FUNCTION common.time_job_hours_by_week(p_job_ids uuid[])
RETURNS TABLE (job_id uuid, week_start date, hours numeric)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT x.job_id, x.week_start, COALESCE(sum(x.hours), 0) AS hours
    FROM (
      SELECT j.job_id,
             (e.work_date - extract(dow FROM e.work_date)::int) AS week_start,
             e.hours
        FROM common.time_entries e
        JOIN common.time_jobs j ON j.qb_time_jobcode_id = e.qb_time_jobcode_id
       WHERE j.job_id = ANY (p_job_ids)
         AND (common.is_pm_or_admin() OR common.is_job_pm(j.job_id))
         AND e.hours IS NOT NULL
      UNION ALL
      SELECT t.job_id, t.week_start, t.hours
        FROM neta_ops.temp_hour_lines t
       WHERE t.job_id = ANY (p_job_ids)
         AND (common.is_pm_or_admin() OR common.is_job_pm(t.job_id))
         AND t.hours > 0
    ) x
   GROUP BY x.job_id, x.week_start;
$$;

REVOKE ALL ON FUNCTION common.time_job_hours_by_week(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION common.time_job_hours_by_week(uuid[]) TO authenticated;

COMMIT;

NOTIFY pgrst, 'reload schema';

-- Expected result: one row, every column true.
SELECT
  (SELECT count(*) = 2 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'neta_ops'
      AND c.relname IN ('job_sov_periods', 'job_sov_quantities')
      AND c.relrowsecurity) AS tables_with_rls,
  NOT has_table_privilege('anon', 'neta_ops.job_sov_periods', 'SELECT') AS public_cannot_read,
  to_regprocedure('common.time_job_hours_by_week(uuid[])') IS NOT NULL AS weekly_hours,
  NOT EXISTS (SELECT 1 FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
               WHERE c.relname IN ('job_sov_periods', 'job_sov_quantities')
                 AND t.tgname LIKE 'trg_snapshot%') AS no_snapshot_triggers;
