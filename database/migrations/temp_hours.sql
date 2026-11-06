-- Temp hours (Project Management scope, item 7).
--
-- Why: temps from agencies like Premier aren't in QuickBooks, so their hours never
-- reached the job and jobs looked better than they were. Each week PMs enter each
-- temp's total hours by job, then send one combined email to the agency. Those
-- hours now count in the job's hours used.
--
--   neta_ops.temp_agencies     agency name and who gets the weekly email (set in ampOS)
--   neta_ops.temp_workers      the temps, each tied to an agency
--   neta_ops.temp_hour_lines   one row per temp, job and week: total hours
--   neta_ops.temp_hour_weeks   one row per week and agency once it's sent (log)
--
-- Weeks start on Sunday, like TimeStAMP. Nothing here goes to QuickBooks: agencies
-- already bill by invoice, so pushing hours would count the cost twice.
--
-- Access: PMs, admins, location leads and anyone who is PM on a job manage agencies
-- and temps. Hour rows follow the job: PMs and admins, or that job's PM. The email
-- is sent by the temp-hours-email edge function.
--
-- Run after pm_dashboard_job_pm.sql. Safe to run twice.

SET lock_timeout = '5s';

BEGIN;

-- ---------------------------------------------------------------------------
-- Who can manage temps and agencies
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION common.temp_hours_can_manage()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT common.is_pm_or_admin()
      OR EXISTS (
           SELECT 1 FROM neta_ops.jobs j
            WHERE j.project_manager_id = auth.uid()
              AND j.deleted_at IS NULL
         );
$$;

REVOKE ALL ON FUNCTION common.temp_hours_can_manage() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION common.temp_hours_can_manage() TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS neta_ops.temp_agencies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 120),
  -- Who gets the weekly hours email
  recipients text[] NOT NULL DEFAULT '{}',
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS neta_ops.temp_workers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id uuid NOT NULL REFERENCES neta_ops.temp_agencies(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 120),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS neta_ops.temp_hour_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  week_start date NOT NULL CHECK (extract(dow FROM week_start) = 0),
  worker_id uuid NOT NULL REFERENCES neta_ops.temp_workers(id) ON DELETE CASCADE,
  job_id uuid NOT NULL REFERENCES neta_ops.jobs(id) ON DELETE CASCADE,
  hours numeric(6,2) NOT NULL DEFAULT 0 CHECK (hours >= 0 AND hours <= 168),
  entered_by uuid DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT temp_hour_lines_one_per_job UNIQUE (week_start, worker_id, job_id)
);

CREATE INDEX IF NOT EXISTS idx_temp_hour_lines_job ON neta_ops.temp_hour_lines (job_id, week_start);
CREATE INDEX IF NOT EXISTS idx_temp_hour_lines_week ON neta_ops.temp_hour_lines (week_start);

CREATE TABLE IF NOT EXISTS neta_ops.temp_hour_weeks (
  week_start date NOT NULL CHECK (extract(dow FROM week_start) = 0),
  agency_id uuid NOT NULL REFERENCES neta_ops.temp_agencies(id) ON DELETE CASCADE,
  sent_at timestamptz NOT NULL DEFAULT now(),
  sent_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  sent_to text[] NOT NULL DEFAULT '{}',
  total_hours numeric(8,2),
  PRIMARY KEY (week_start, agency_id)
);

COMMENT ON TABLE neta_ops.temp_hour_lines IS
  'Weekly total hours per temp per job. Counted in common.time_job_hours_by_month. Never sent to QuickBooks.';

-- Not report data: skip the automatic snapshot copies
DROP TRIGGER IF EXISTS trg_snapshot_temp_agencies_ins ON neta_ops.temp_agencies;
DROP TRIGGER IF EXISTS trg_snapshot_temp_agencies_upd ON neta_ops.temp_agencies;
DROP TRIGGER IF EXISTS trg_snapshot_temp_workers_ins ON neta_ops.temp_workers;
DROP TRIGGER IF EXISTS trg_snapshot_temp_workers_upd ON neta_ops.temp_workers;
DROP TRIGGER IF EXISTS trg_snapshot_temp_hour_lines_ins ON neta_ops.temp_hour_lines;
DROP TRIGGER IF EXISTS trg_snapshot_temp_hour_lines_upd ON neta_ops.temp_hour_lines;
DROP TRIGGER IF EXISTS trg_snapshot_temp_hour_weeks_ins ON neta_ops.temp_hour_weeks;
DROP TRIGGER IF EXISTS trg_snapshot_temp_hour_weeks_upd ON neta_ops.temp_hour_weeks;

-- ---------------------------------------------------------------------------
-- Access
-- ---------------------------------------------------------------------------

ALTER TABLE neta_ops.temp_agencies ENABLE ROW LEVEL SECURITY;
ALTER TABLE neta_ops.temp_workers ENABLE ROW LEVEL SECURITY;
ALTER TABLE neta_ops.temp_hour_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE neta_ops.temp_hour_weeks ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE neta_ops.temp_agencies, neta_ops.temp_workers,
                    neta_ops.temp_hour_lines, neta_ops.temp_hour_weeks FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE neta_ops.temp_agencies, neta_ops.temp_workers,
                                              neta_ops.temp_hour_lines TO authenticated;
GRANT SELECT ON TABLE neta_ops.temp_hour_weeks TO authenticated;
GRANT ALL ON TABLE neta_ops.temp_agencies, neta_ops.temp_workers,
                   neta_ops.temp_hour_lines, neta_ops.temp_hour_weeks TO service_role;
GRANT SELECT ON TABLE neta_ops.jobs TO service_role;

DROP POLICY IF EXISTS temp_agencies_manage ON neta_ops.temp_agencies;
CREATE POLICY temp_agencies_manage ON neta_ops.temp_agencies
  FOR ALL TO authenticated
  USING (common.temp_hours_can_manage())
  WITH CHECK (common.temp_hours_can_manage());

DROP POLICY IF EXISTS temp_workers_manage ON neta_ops.temp_workers;
CREATE POLICY temp_workers_manage ON neta_ops.temp_workers
  FOR ALL TO authenticated
  USING (common.temp_hours_can_manage())
  WITH CHECK (common.temp_hours_can_manage());

DROP POLICY IF EXISTS temp_hour_lines_job ON neta_ops.temp_hour_lines;
CREATE POLICY temp_hour_lines_job ON neta_ops.temp_hour_lines
  FOR ALL TO authenticated
  USING (common.is_pm_or_admin() OR common.is_job_pm(job_id))
  WITH CHECK (common.is_pm_or_admin() OR common.is_job_pm(job_id));

DROP POLICY IF EXISTS temp_hour_weeks_read ON neta_ops.temp_hour_weeks;
CREATE POLICY temp_hour_weeks_read ON neta_ops.temp_hour_weeks
  FOR SELECT TO authenticated
  USING (common.temp_hours_can_manage());

-- ---------------------------------------------------------------------------
-- Count temp hours in "Hours used"
-- ---------------------------------------------------------------------------
-- A week's hours land in the month of its Wednesday, so a week that straddles
-- two months goes where most of it falls.

CREATE OR REPLACE FUNCTION common.time_job_hours_by_month(p_job_ids uuid[])
RETURNS TABLE (job_id uuid, month text, hours numeric)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT x.job_id, x.month, COALESCE(sum(x.hours), 0) AS hours
    FROM (
      SELECT j.job_id,
             to_char(e.work_date, 'YYYY-MM') AS month,
             e.hours
        FROM common.time_entries e
        JOIN common.time_jobs j ON j.qb_time_jobcode_id = e.qb_time_jobcode_id
       WHERE j.job_id = ANY (p_job_ids)
         AND (common.is_pm_or_admin() OR common.is_job_pm(j.job_id))
         AND e.hours IS NOT NULL
      UNION ALL
      SELECT t.job_id,
             to_char(t.week_start + 3, 'YYYY-MM') AS month,
             t.hours
        FROM neta_ops.temp_hour_lines t
       WHERE t.job_id = ANY (p_job_ids)
         AND (common.is_pm_or_admin() OR common.is_job_pm(t.job_id))
         AND t.hours > 0
    ) x
   GROUP BY x.job_id, x.month;
$$;

REVOKE ALL ON FUNCTION common.time_job_hours_by_month(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION common.time_job_hours_by_month(uuid[]) TO authenticated;

COMMIT;

NOTIFY pgrst, 'reload schema';

-- Expected result: one row, every column true.
SELECT
  (SELECT count(*) = 4 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'neta_ops'
      AND c.relname IN ('temp_agencies', 'temp_workers', 'temp_hour_lines', 'temp_hour_weeks')
      AND c.relrowsecurity) AS tables_with_rls,
  NOT has_table_privilege('anon', 'neta_ops.temp_hour_lines', 'SELECT') AS public_cannot_read,
  to_regprocedure('common.temp_hours_can_manage()') IS NOT NULL AS manage_check,
  NOT EXISTS (SELECT 1 FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
               WHERE c.relname LIKE 'temp_%' AND t.tgname LIKE 'trg_snapshot%') AS no_snapshot_triggers;
