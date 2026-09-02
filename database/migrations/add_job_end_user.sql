-- The "User" that appears in the Job Information block on test reports.
--
-- On a report, "User" is the company or facility that will own the building we
-- are testing in -- not the technician filling the report out and not the
-- customer that hired us. We work for Marathon Electric at FTY02 but the User
-- is Microsoft; we work for Lawson Electric and Adman Electric at DNN4 but the
-- User is Core Scientific. It is fixed for the whole job, so it lives on the
-- job and every new report on that job starts with it filled in.

ALTER TABLE neta_ops.jobs
  ADD COLUMN IF NOT EXISTS end_user TEXT;

COMMENT ON COLUMN neta_ops.jobs.end_user IS
  'Facility owner / end user shown in the "User" field of this job''s reports (e.g. Microsoft at FTY02). Not an app user; see jobs.user_id for that.';
