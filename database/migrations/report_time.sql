-- Report time: how long people actually spend in each report.
--
-- Why: to learn real time per report type for estimating. Save times alone
-- undercount (they only see typing). While a report is open, on screen and in
-- edit mode, the app counts time in the background and reports it here once a
-- minute. Nothing shows to the person filling in the report.
--
--   common.report_time_sessions   one row per report opened in one browser tab
--   common.report_time_ping()     the app's only way to write (adds seconds)
--   common.report_time_by_type()  Admin Dashboard: minutes per report type
--   common.report_time_by_person()  Admin Dashboard: minutes per person
--
-- active_seconds: on screen, editing, and touched in the last 5 minutes.
-- open_seconds:   on screen and editing, touched or not.
-- Admins (and superusers) can read it; everyone else can only add to their own.
--
-- Safe to run twice. Lives in common, so no report snapshot triggers.

BEGIN;

CREATE TABLE IF NOT EXISTS common.report_time_sessions (
  -- Made in the browser, one per report opened in a tab
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  job_id uuid,
  -- The report's page name, e.g. switchgear-report
  report_type text NOT NULL CHECK (char_length(report_type) <= 120),
  -- Null until the report is first saved
  report_id uuid,
  started_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  active_seconds integer NOT NULL DEFAULT 0 CHECK (active_seconds >= 0),
  open_seconds integer NOT NULL DEFAULT 0 CHECK (open_seconds >= 0)
);

CREATE INDEX IF NOT EXISTS idx_report_time_sessions_report ON common.report_time_sessions (report_type, report_id);
CREATE INDEX IF NOT EXISTS idx_report_time_sessions_started ON common.report_time_sessions (started_at);

COMMENT ON TABLE common.report_time_sessions IS
  'Time spent in reports, counted in the background by the app. Written only through report_time_ping().';

ALTER TABLE common.report_time_sessions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE common.report_time_sessions FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE common.report_time_sessions TO authenticated;
GRANT ALL ON TABLE common.report_time_sessions TO service_role;

DROP POLICY IF EXISTS report_time_sessions_admin_read ON common.report_time_sessions;
CREATE POLICY report_time_sessions_admin_read ON common.report_time_sessions
  FOR SELECT TO authenticated
  USING (common.article_is_admin());

-- The app adds time here. Each call adds at most 2 minutes, so a bad clock or a
-- tampered call can't add hours, and a session belongs to whoever started it.
CREATE OR REPLACE FUNCTION common.report_time_ping(
  p_session_id uuid,
  p_report_type text,
  p_report_id uuid DEFAULT NULL,
  p_job_id uuid DEFAULT NULL,
  p_active_seconds integer DEFAULT 0,
  p_open_seconds integer DEFAULT 0
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_active integer := LEAST(GREATEST(COALESCE(p_active_seconds, 0), 0), 120);
  v_open integer := LEAST(GREATEST(COALESCE(p_open_seconds, 0), 0), 120);
BEGIN
  IF v_uid IS NULL OR p_session_id IS NULL OR COALESCE(btrim(p_report_type), '') = '' THEN
    RETURN;
  END IF;
  INSERT INTO common.report_time_sessions AS s
    (id, user_id, job_id, report_type, report_id, active_seconds, open_seconds)
  VALUES
    (p_session_id, v_uid, p_job_id, left(btrim(p_report_type), 120), p_report_id, v_active, v_open)
  ON CONFLICT (id) DO UPDATE
     SET active_seconds = s.active_seconds + v_active,
         open_seconds = s.open_seconds + v_open,
         report_id = COALESCE(s.report_id, EXCLUDED.report_id),
         job_id = COALESCE(s.job_id, EXCLUDED.job_id),
         last_seen_at = now()
   WHERE s.user_id = v_uid;
END;
$$;

REVOKE ALL ON FUNCTION common.report_time_ping(uuid, text, uuid, uuid, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION common.report_time_ping(uuid, text, uuid, uuid, integer, integer) TO authenticated;

-- Minutes per report, then the typical (median) and slow (75th percentile) report per type.
-- Only saved reports with at least a minute of active time count.
CREATE OR REPLACE FUNCTION common.report_time_by_type(p_since date)
RETURNS TABLE (report_type text, reports bigint, people bigint, median_minutes numeric,
               p75_minutes numeric, median_open_minutes numeric, total_hours numeric)
LANGUAGE sql STABLE SECURITY INVOKER
SET search_path = ''
AS $$
  WITH per_report AS (
    SELECT s.report_type, s.report_id,
           sum(s.active_seconds) / 60.0 AS active_min,
           sum(s.open_seconds) / 60.0 AS open_min,
           count(DISTINCT s.user_id) AS people
      FROM common.report_time_sessions s
     WHERE s.report_id IS NOT NULL AND s.started_at >= p_since
     GROUP BY s.report_type, s.report_id
    HAVING sum(s.active_seconds) >= 60
  )
  SELECT r.report_type,
         count(*) AS reports,
         (SELECT count(DISTINCT s2.user_id) FROM common.report_time_sessions s2
           WHERE s2.report_type = r.report_type AND s2.started_at >= p_since) AS people,
         round(percentile_cont(0.5) WITHIN GROUP (ORDER BY r.active_min)::numeric, 0),
         round(percentile_cont(0.75) WITHIN GROUP (ORDER BY r.active_min)::numeric, 0),
         round(percentile_cont(0.5) WITHIN GROUP (ORDER BY r.open_min)::numeric, 0),
         round((sum(r.active_min) / 60.0)::numeric, 1)
    FROM per_report r
   GROUP BY r.report_type
   ORDER BY count(*) DESC;
$$;

CREATE OR REPLACE FUNCTION common.report_time_by_person(p_since date)
RETURNS TABLE (user_id uuid, full_name text, reports bigint, median_minutes numeric, total_hours numeric)
LANGUAGE sql STABLE SECURITY INVOKER
SET search_path = ''
AS $$
  WITH per_report AS (
    SELECT s.user_id, s.report_type, s.report_id, sum(s.active_seconds) / 60.0 AS active_min
      FROM common.report_time_sessions s
     WHERE s.report_id IS NOT NULL AND s.started_at >= p_since
     GROUP BY s.user_id, s.report_type, s.report_id
    HAVING sum(s.active_seconds) >= 60
  )
  SELECT r.user_id,
         (SELECT p.full_name FROM common.profiles p WHERE p.id = r.user_id),
         count(*),
         round(percentile_cont(0.5) WITHIN GROUP (ORDER BY r.active_min)::numeric, 0),
         round((sum(r.active_min) / 60.0)::numeric, 1)
    FROM per_report r
   GROUP BY r.user_id
   ORDER BY count(*) DESC;
$$;

REVOKE ALL ON FUNCTION common.report_time_by_type(date) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION common.report_time_by_person(date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION common.report_time_by_type(date) TO authenticated;
GRANT EXECUTE ON FUNCTION common.report_time_by_person(date) TO authenticated;

COMMIT;

NOTIFY pgrst, 'reload schema';

-- Expected result: one row, every column true.
SELECT
  to_regclass('common.report_time_sessions') IS NOT NULL AS table_exists,
  (SELECT relrowsecurity FROM pg_class WHERE oid = to_regclass('common.report_time_sessions')) AS rls_on,
  NOT has_table_privilege('authenticated', 'common.report_time_sessions', 'INSERT') AS no_direct_writes,
  to_regprocedure('common.report_time_ping(uuid, text, uuid, uuid, integer, integer)') IS NOT NULL AS ping_ready;
