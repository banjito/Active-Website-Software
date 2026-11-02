-- ============================================================================
-- Custom Form Lookup Tables: only admins and report reviewers may edit
-- ============================================================================
-- Run this in the Supabase SQL Editor after create_custom_form_lookup_tables.sql.
--
-- Everyone signed in can still READ the tables (every form's formulas use them).
-- Adding, changing and deleting is limited to:
--   * roles Admin, Super Admin, and the roles allowed to approve/review reports
--     (Engineer, Operations Manager) - the same list as src/lib/roles.ts
--   * the super-user emails in src/lib/companyConfig.ts
--
-- If you change who can review reports in roles.ts, update the lists below too.
-- ============================================================================

CREATE OR REPLACE FUNCTION neta_ops.can_edit_custom_form_lookup_tables()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
AS $$
  SELECT
    COALESCE(auth.jwt() -> 'user_metadata' ->> 'role', '') IN (
      'Admin', 'Super Admin', 'Engineer', 'Operations Manager'
    )
    OR lower(COALESCE(auth.jwt() ->> 'email', '')) IN (
      'john.chambers@ampqes.com',
      'jack.lyons@ampqes.com'
    );
$$;

DROP POLICY IF EXISTS custom_form_lookup_tables_insert ON neta_ops.custom_form_lookup_tables;
CREATE POLICY custom_form_lookup_tables_insert ON neta_ops.custom_form_lookup_tables
  FOR INSERT TO authenticated
  WITH CHECK (neta_ops.can_edit_custom_form_lookup_tables());

DROP POLICY IF EXISTS custom_form_lookup_tables_update ON neta_ops.custom_form_lookup_tables;
CREATE POLICY custom_form_lookup_tables_update ON neta_ops.custom_form_lookup_tables
  FOR UPDATE TO authenticated
  USING (neta_ops.can_edit_custom_form_lookup_tables())
  WITH CHECK (neta_ops.can_edit_custom_form_lookup_tables());

DROP POLICY IF EXISTS custom_form_lookup_tables_delete ON neta_ops.custom_form_lookup_tables;
CREATE POLICY custom_form_lookup_tables_delete ON neta_ops.custom_form_lookup_tables
  FOR DELETE TO authenticated
  USING (neta_ops.can_edit_custom_form_lookup_tables());

NOTIFY pgrst, 'reload schema';
