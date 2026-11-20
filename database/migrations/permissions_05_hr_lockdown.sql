-- ampOS Roles & Permissions, item 6 (part 1): lock down HR records.
--
-- LIVE CHANGE. Who can see other people's HR records after this:
--   * HR and Super Admins (permission hr.view_all) see everyone's.
--   * Managers see the people below them on the org chart (same as the app today).
--   * Everyone sees their own.
--   * Admins no longer see everyone's (Jack's pick, Nov 20).
--
-- Tables:
--   employee_documents, employee_document_folders  reading limited as above
--   compensation_history   row security ON (was off): own, HR, payroll. Writes: HR, payroll.
--   job_title_history      row security ON (was off): titles stay readable (org chart
--                          shows them); only HR changes them.
--   eeo_submissions        reading/editing: HR only (was every logged-in user)
--   one_on_one_checkins    the "Admin/HR sees all" rule becomes hr.view_all
--
-- Files (the employee-documents folder) are a separate step: permissions_06_hr_files.sql.
-- Recruiting/onboarding tables are part 2.
--
-- All or nothing.

BEGIN;
SET LOCAL lock_timeout = '5s';

-- 1. Helpers ------------------------------------------------------------------

-- Is the signed-in person anywhere above this employee on the org chart?
CREATE FUNCTION common.manages(p_employee uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  WITH RECURSIVE ancestors AS (
    SELECT a.reports_to_profile_id AS mgr, 1 AS depth
      FROM common.org_chart_assignments a
     WHERE a.profile_id = p_employee AND a.reports_to_profile_id IS NOT NULL
    UNION ALL
    SELECT o.reports_to_profile_id, anc.depth + 1
      FROM common.org_chart_assignments o
      JOIN ancestors anc ON o.profile_id = anc.mgr
     WHERE o.reports_to_profile_id IS NOT NULL AND anc.depth < 25   -- stops a loop in the chart
  )
  SELECT auth.uid() IS NOT NULL AND EXISTS (SELECT 1 FROM ancestors WHERE mgr = auth.uid());
$$;

-- Can the signed-in person see this employee's HR files?
CREATE FUNCTION common.can_see_hr_files(p_employee uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT auth.uid() IS NOT NULL AND (
    p_employee = auth.uid()
    OR common.can('hr.view_all')
    OR common.manages(p_employee)
  );
$$;

REVOKE ALL ON FUNCTION common.manages(uuid)          FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION common.can_see_hr_files(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION common.manages(uuid)          TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION common.can_see_hr_files(uuid) TO authenticated, service_role;

-- 2. Employee documents and folders -------------------------------------------
-- Only reading changes. Edit/delete rules stay, and they only reach rows you can see.

DROP POLICY "Authenticated users can view employee documents" ON common.employee_documents;
CREATE POLICY employee_documents_read ON common.employee_documents FOR SELECT TO authenticated
  USING (
    (SELECT common.can('hr.view_all'))
    OR employee_id = auth.uid()
    OR uploaded_by = auth.uid()
    OR common.manages(employee_id)
  );

DROP POLICY "Authenticated users can view employee document folders" ON common.employee_document_folders;
CREATE POLICY employee_document_folders_read ON common.employee_document_folders FOR SELECT TO authenticated
  USING (
    (SELECT common.can('hr.view_all'))
    OR employee_id = auth.uid()
    OR common.manages(employee_id)
  );

-- 3. Pay history ------------------------------------------------------------------

ALTER TABLE common.compensation_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY compensation_history_read ON common.compensation_history FOR SELECT TO authenticated
  USING ((SELECT common.can('hr.view_all')) OR (SELECT common.can('hr.payroll')) OR profile_id = auth.uid());
CREATE POLICY compensation_history_write ON common.compensation_history FOR ALL TO authenticated
  USING ((SELECT common.can('hr.view_all')) OR (SELECT common.can('hr.payroll')))
  WITH CHECK ((SELECT common.can('hr.view_all')) OR (SELECT common.can('hr.payroll')));
REVOKE ALL ON common.compensation_history FROM anon;
REVOKE TRUNCATE ON common.compensation_history FROM authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON common.compensation_history TO authenticated;
GRANT ALL ON common.compensation_history TO service_role;

-- 4. Job title history ------------------------------------------------------------

ALTER TABLE common.job_title_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY job_title_history_read ON common.job_title_history FOR SELECT TO authenticated
  USING (true);
CREATE POLICY job_title_history_write ON common.job_title_history FOR ALL TO authenticated
  USING ((SELECT common.can('hr.view_all')))
  WITH CHECK ((SELECT common.can('hr.view_all')));
REVOKE ALL ON common.job_title_history FROM anon;
REVOKE TRUNCATE ON common.job_title_history FROM authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON common.job_title_history TO authenticated;
GRANT ALL ON common.job_title_history TO service_role;

-- 5. EEO answers ------------------------------------------------------------------

DROP POLICY eeo_submissions_select ON common.eeo_submissions;
DROP POLICY eeo_submissions_update ON common.eeo_submissions;
CREATE POLICY eeo_submissions_select ON common.eeo_submissions FOR SELECT TO authenticated
  USING ((SELECT common.can('hr.view_all')));
CREATE POLICY eeo_submissions_update ON common.eeo_submissions FOR UPDATE TO authenticated
  USING ((SELECT common.can('hr.view_all')))
  WITH CHECK ((SELECT common.can('hr.view_all')));
REVOKE TRUNCATE ON common.eeo_submissions FROM authenticated;

-- 6. One-on-one check-ins: "Admin/HR sees all" becomes hr.view_all -----------------

DROP POLICY one_on_one_checkins_select_admin_hr ON common.one_on_one_checkins;
DROP POLICY one_on_one_checkins_update_admin_hr ON common.one_on_one_checkins;
DROP POLICY one_on_one_checkins_delete_admin_hr ON common.one_on_one_checkins;
CREATE POLICY one_on_one_checkins_select_hr ON common.one_on_one_checkins FOR SELECT TO authenticated
  USING ((SELECT common.can('hr.view_all')));
CREATE POLICY one_on_one_checkins_update_hr ON common.one_on_one_checkins FOR UPDATE TO authenticated
  USING ((SELECT common.can('hr.view_all')));
CREATE POLICY one_on_one_checkins_delete_hr ON common.one_on_one_checkins FOR DELETE TO authenticated
  USING ((SELECT common.can('hr.view_all')));

COMMIT;

-- Check, signed in as different people in the app (not here: the SQL editor has no signed-in user):
--   HR person / Super Admin: Employee Files shows everyone.
--   An Admin with no reports: Employee Files shows only themselves.
--   A manager: themselves plus their people.
