-- PM Dashboard: Crew tab.
--
-- Why: PMs kept bouncing between the PM Dashboard and HR Timesheets to see who is on
-- their jobs. This gives the dashboard one read-only function: who is clocked in on
-- these jobs right now, and each person's hours per day on these jobs for a week.
--
-- Privacy: until now PMs saw job totals only. This shows names and hours, but only on
-- jobs the caller may already see totals for: any job for PMs and admins
-- (is_pm_or_admin), or the caller's own jobs (is_job_pm). Never pay, never other jobs.
-- Approving a week still goes through time_approve_week and its own rules.
--
--   time_job_crew(job_ids, week_start)
--     one row per job, person and day: hours from finished punches, and the start of an
--     open punch if they are on the clock there now. Open punches are included even when
--     they fall outside the week, so "clocked in now" works on any week.
--
-- Safe to run twice. Run after pm_dashboard_job_pm.sql (needs common.is_job_pm).

CREATE OR REPLACE FUNCTION common.time_job_crew(p_job_ids uuid[], p_week_start date)
RETURNS TABLE (
  job_id uuid,
  profile_id uuid,
  full_name text,
  work_date date,
  hours numeric,
  clocked_in_at timestamptz
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT j.job_id,
         e.profile_id,
         pr.full_name::text,
         e.work_date,
         COALESCE(sum(e.hours), 0) AS hours,
         max(e.clock_in_at) FILTER (WHERE e.clock_out_at IS NULL) AS clocked_in_at
    FROM common.time_entries e
    JOIN common.time_jobs j ON j.qb_time_jobcode_id = e.qb_time_jobcode_id
    LEFT JOIN common.profiles pr ON pr.id = e.profile_id
   WHERE j.job_id = ANY (p_job_ids)
     AND (common.is_pm_or_admin() OR common.is_job_pm(j.job_id))
     AND (
           (e.work_date >= p_week_start AND e.work_date < p_week_start + 7)
        OR e.clock_out_at IS NULL
     )
   GROUP BY j.job_id, e.profile_id, pr.full_name, e.work_date;
$$;

REVOKE ALL ON FUNCTION common.time_job_crew(uuid[], date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION common.time_job_crew(uuid[], date) TO authenticated;

NOTIFY pgrst, 'reload schema';

-- Expected result: one row, time_job_crew_exists = true.
SELECT to_regprocedure('common.time_job_crew(uuid[], date)') IS NOT NULL AS time_job_crew_exists;
