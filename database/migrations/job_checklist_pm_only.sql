-- Job checklist: only PMs tick boxes (Project Management scope, item 2).
--
-- Why: Field Services (Nov 10) said these are PM functions to validate, not something
-- the leads should tick. Until now anyone signed in could tick, mark N/A or add a note.
--
-- Who can now: the job's own PM (common.is_job_pm), and full-access PMs: Admin,
-- Super Admin, Operations Manager, Project Manager, and division leads
-- (common.is_pm_or_admin). Same people who can edit the job's SOV.
-- Everyone signed in can still see the checklist. Clearing a row stays admin only.
--
-- Run after job_checklist.sql, pm_dashboard.sql and pm_dashboard_job_pm.sql.
-- Safe to run twice.

SET lock_timeout = '5s';

BEGIN;

DROP POLICY IF EXISTS "job_checklist_items_insert" ON neta_ops.job_checklist_items;
CREATE POLICY "job_checklist_items_insert"
  ON neta_ops.job_checklist_items FOR INSERT
  TO authenticated
  WITH CHECK (common.is_pm_or_admin() OR common.is_job_pm(job_id));

DROP POLICY IF EXISTS "job_checklist_items_update" ON neta_ops.job_checklist_items;
CREATE POLICY "job_checklist_items_update"
  ON neta_ops.job_checklist_items FOR UPDATE
  TO authenticated
  USING (common.is_pm_or_admin() OR common.is_job_pm(job_id))
  WITH CHECK (common.is_pm_or_admin() OR common.is_job_pm(job_id));

COMMIT;

-- Expected result: one row, both columns true.
SELECT
  EXISTS (SELECT 1 FROM pg_policies
           WHERE schemaname = 'neta_ops' AND tablename = 'job_checklist_items'
             AND policyname = 'job_checklist_items_insert'
             AND with_check LIKE '%is_job_pm%') AS insert_pm_only,
  EXISTS (SELECT 1 FROM pg_policies
           WHERE schemaname = 'neta_ops' AND tablename = 'job_checklist_items'
             AND policyname = 'job_checklist_items_update'
             AND qual LIKE '%is_job_pm%') AS update_pm_only;
