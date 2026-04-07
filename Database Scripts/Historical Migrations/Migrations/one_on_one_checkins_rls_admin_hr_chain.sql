-- Expand RLS on common.one_on_one_checkins so Admin, HR, and any manager
-- above the employee on the org chart can SELECT/UPDATE/DELETE (not only the creator).
-- Run once if you already applied the initial one_on_one_checkins migration.

DROP POLICY IF EXISTS "one_on_one_checkins_select_admin_hr" ON common.one_on_one_checkins;
DROP POLICY IF EXISTS "one_on_one_checkins_update_admin_hr" ON common.one_on_one_checkins;
DROP POLICY IF EXISTS "one_on_one_checkins_delete_admin_hr" ON common.one_on_one_checkins;
DROP POLICY IF EXISTS "one_on_one_checkins_select_manager_chain" ON common.one_on_one_checkins;
DROP POLICY IF EXISTS "one_on_one_checkins_update_manager_chain" ON common.one_on_one_checkins;
DROP POLICY IF EXISTS "one_on_one_checkins_delete_manager_chain" ON common.one_on_one_checkins;

CREATE POLICY "one_on_one_checkins_select_admin_hr"
  ON common.one_on_one_checkins FOR SELECT
  USING (
    COALESCE((auth.jwt() -> 'user_metadata' ->> 'role'), '')
      IN ('Admin', 'Super Admin', 'HR', 'HR Rep')
  );

CREATE POLICY "one_on_one_checkins_update_admin_hr"
  ON common.one_on_one_checkins FOR UPDATE
  USING (
    COALESCE((auth.jwt() -> 'user_metadata' ->> 'role'), '')
      IN ('Admin', 'Super Admin', 'HR', 'HR Rep')
  );

CREATE POLICY "one_on_one_checkins_delete_admin_hr"
  ON common.one_on_one_checkins FOR DELETE
  USING (
    COALESCE((auth.jwt() -> 'user_metadata' ->> 'role'), '')
      IN ('Admin', 'Super Admin', 'HR', 'HR Rep')
  );

CREATE POLICY "one_on_one_checkins_select_manager_chain"
  ON common.one_on_one_checkins FOR SELECT
  USING (
    EXISTS (
      WITH RECURSIVE ancestors AS (
        SELECT a.reports_to_profile_id AS mgr
        FROM common.org_chart_assignments a
        WHERE a.profile_id = one_on_one_checkins.employee_id
          AND a.reports_to_profile_id IS NOT NULL
        UNION ALL
        SELECT o.reports_to_profile_id
        FROM common.org_chart_assignments o
        INNER JOIN ancestors anc ON o.profile_id = anc.mgr
        WHERE o.reports_to_profile_id IS NOT NULL
      )
      SELECT 1 FROM ancestors WHERE mgr = auth.uid()
    )
  );

CREATE POLICY "one_on_one_checkins_update_manager_chain"
  ON common.one_on_one_checkins FOR UPDATE
  USING (
    EXISTS (
      WITH RECURSIVE ancestors AS (
        SELECT a.reports_to_profile_id AS mgr
        FROM common.org_chart_assignments a
        WHERE a.profile_id = one_on_one_checkins.employee_id
          AND a.reports_to_profile_id IS NOT NULL
        UNION ALL
        SELECT o.reports_to_profile_id
        FROM common.org_chart_assignments o
        INNER JOIN ancestors anc ON o.profile_id = anc.mgr
        WHERE o.reports_to_profile_id IS NOT NULL
      )
      SELECT 1 FROM ancestors WHERE mgr = auth.uid()
    )
  );

CREATE POLICY "one_on_one_checkins_delete_manager_chain"
  ON common.one_on_one_checkins FOR DELETE
  USING (
    EXISTS (
      WITH RECURSIVE ancestors AS (
        SELECT a.reports_to_profile_id AS mgr
        FROM common.org_chart_assignments a
        WHERE a.profile_id = one_on_one_checkins.employee_id
          AND a.reports_to_profile_id IS NOT NULL
        UNION ALL
        SELECT o.reports_to_profile_id
        FROM common.org_chart_assignments o
        INNER JOIN ancestors anc ON o.profile_id = anc.mgr
        WHERE o.reports_to_profile_id IS NOT NULL
      )
      SELECT 1 FROM ancestors WHERE mgr = auth.uid()
    )
  );
