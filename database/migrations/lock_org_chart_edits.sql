-- Lock edits to the org chart (common.org_chart_assignments)
--
-- Why: this table says who reports to whom, and other rules trust it
-- (one-on-one check-ins today, timesheet approvals next). With no row rules,
-- any signed-in user can add a row that makes them someone's manager.
--
-- After this: every signed-in user can still read the org chart (the Org Chart
-- page, Manager Portal and the check-in rules all read it). Only the roles that
-- can edit it in the app (canEdit in OrgChart.tsx, plus 'HR' to match the
-- check-in rules) can change it.
--
-- The other org_chart_* tables (levels, groups, roles) only drive how the chart
-- is drawn, so they are left alone.
--
-- Safe to run more than once.

ALTER TABLE common.org_chart_assignments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "org_chart_assignments_select_all" ON common.org_chart_assignments;
CREATE POLICY "org_chart_assignments_select_all"
  ON common.org_chart_assignments FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "org_chart_assignments_insert_admin_hr" ON common.org_chart_assignments;
CREATE POLICY "org_chart_assignments_insert_admin_hr"
  ON common.org_chart_assignments FOR INSERT
  TO authenticated
  WITH CHECK (
    COALESCE((auth.jwt() -> 'user_metadata' ->> 'role'), '')
      IN ('Admin', 'Super Admin', 'HR', 'HR Rep', 'HR Representative')
  );

DROP POLICY IF EXISTS "org_chart_assignments_update_admin_hr" ON common.org_chart_assignments;
CREATE POLICY "org_chart_assignments_update_admin_hr"
  ON common.org_chart_assignments FOR UPDATE
  TO authenticated
  USING (
    COALESCE((auth.jwt() -> 'user_metadata' ->> 'role'), '')
      IN ('Admin', 'Super Admin', 'HR', 'HR Rep', 'HR Representative')
  )
  WITH CHECK (
    COALESCE((auth.jwt() -> 'user_metadata' ->> 'role'), '')
      IN ('Admin', 'Super Admin', 'HR', 'HR Rep', 'HR Representative')
  );

DROP POLICY IF EXISTS "org_chart_assignments_delete_admin_hr" ON common.org_chart_assignments;
CREATE POLICY "org_chart_assignments_delete_admin_hr"
  ON common.org_chart_assignments FOR DELETE
  TO authenticated
  USING (
    COALESCE((auth.jwt() -> 'user_metadata' ->> 'role'), '')
      IN ('Admin', 'Super Admin', 'HR', 'HR Rep', 'HR Representative')
  );

-- Result: every rule now on the table. Expect exactly the 4 above.
-- Any extra row is an older rule that was already in the live database.
SELECT policyname, cmd, roles
FROM pg_policies
WHERE schemaname = 'common' AND tablename = 'org_chart_assignments'
ORDER BY policyname;
