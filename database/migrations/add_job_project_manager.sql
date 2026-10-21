-- Project manager per job.
--
-- Why: PMs are assigned per location (the sidebar's division leads), but a job can be
-- run by another location's PM. Each job now has its own PM, which starts out as its
-- location's PM and can be changed on the job page.
--
--   neta_ops.jobs.project_manager_id            the job's PM (a user id)
--   neta_ops.default_job_project_manager()      fills it from the location's PM on insert

ALTER TABLE neta_ops.jobs
  ADD COLUMN IF NOT EXISTS project_manager_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;

COMMENT ON COLUMN neta_ops.jobs.project_manager_id IS
  'The job''s project manager. Defaults to the location''s PM (division_leads in common.app_settings) when the job is created; can be changed per job.';

CREATE INDEX IF NOT EXISTS idx_jobs_project_manager_id ON neta_ops.jobs (project_manager_id);

-- ---------------------------------------------------------------------------
-- Default on new jobs
-- ---------------------------------------------------------------------------

-- Only on insert, and only when no PM was picked, so a choice made on the form wins.
-- Changing a job's location later does not change its PM.
CREATE OR REPLACE FUNCTION neta_ops.default_job_project_manager() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.project_manager_id IS NULL AND NEW.division IS NOT NULL
     -- field_tech holds the director, not a location PM
     AND NEW.division <> 'field_tech' THEN
    -- Joined to auth.users so a lead who no longer exists can't break the insert
    SELECT u.id
      INTO NEW.project_manager_id
      FROM common.app_settings s
      JOIN auth.users u ON u.id::text = s.value -> NEW.division ->> 'id'
     WHERE s.key = 'division_leads'
       AND jsonb_typeof(s.value) = 'object'
     LIMIT 1;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION neta_ops.default_job_project_manager() FROM PUBLIC, anon;

DROP TRIGGER IF EXISTS trg_jobs_default_project_manager ON neta_ops.jobs;
CREATE TRIGGER trg_jobs_default_project_manager
  BEFORE INSERT ON neta_ops.jobs
  FOR EACH ROW EXECUTE FUNCTION neta_ops.default_job_project_manager();

-- ---------------------------------------------------------------------------
-- Fill in jobs that are still running
-- ---------------------------------------------------------------------------

-- Completed, billed and cancelled jobs stay empty: today's PM may not have run them.
-- Ready-to-bill jobs are skipped too, because an email trigger runs on every update
-- of those rows. Safe to run twice: only empty PMs are filled.
UPDATE neta_ops.jobs j
   SET project_manager_id = u.id
  FROM common.app_settings s
 CROSS JOIN LATERAL jsonb_each(s.value) AS lead(division, info)
  JOIN auth.users u ON u.id::text = lead.info ->> 'id'
 WHERE s.key = 'division_leads'
   AND jsonb_typeof(s.value) = 'object'
   AND lead.division <> 'field_tech'
   AND j.division = lead.division
   AND j.project_manager_id IS NULL
   AND j.deleted_at IS NULL
   AND j.status IN ('pending', 'in_progress', 'progress_billing', 'on_hold');

NOTIFY pgrst, 'reload schema';

-- Expected result: one row per location with open jobs. "with_pm" equals "open_jobs"
-- for every location that has a PM set in the sidebar, and is 0 where none is set.
SELECT j.division,
       count(*) AS open_jobs,
       count(j.project_manager_id) AS with_pm
  FROM neta_ops.jobs j
 WHERE j.deleted_at IS NULL
   AND j.status IN ('pending', 'in_progress', 'progress_billing', 'on_hold')
 GROUP BY j.division
 ORDER BY j.division;
