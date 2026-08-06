-- Let HR/Office/Admin actually save edits to the AMP phone list.
--
-- Why: "HR and Office admins can manage amp_contacts" gated writes on
-- common.profiles.role, but that column is 'user' for every row in this
-- instance — the real role lives in auth.users user_metadata (and rides in the
-- JWT). So the policy denied everyone. An UPDATE denied by RLS is not an
-- error, it just matches zero rows, so the client's .select().single() came
-- back as a PostgREST 406 and the Save button looked broken.
--
-- Fix: check the role the app actually uses, the same way
-- common.is_employee_user() and common.is_admin_or_scheduler() do. Reading
-- auth.users as a fallback (SECURITY DEFINER) means a role change takes effect
-- without waiting for the user's JWT to refresh.
--
-- Safe to re-run.

CREATE OR REPLACE FUNCTION common.can_manage_amp_contacts() RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'common', 'public'
    AS $$
  SELECT auth.role() = 'authenticated'
    AND EXISTS (
      SELECT 1
      FROM unnest(ARRAY[
        auth.jwt() -> 'user_metadata' ->> 'role',
        auth.jwt() -> 'app_metadata'  ->> 'role',
        (SELECT u.raw_user_meta_data ->> 'role' FROM auth.users u WHERE u.id = auth.uid()),
        (SELECT u.raw_app_meta_data  ->> 'role' FROM auth.users u WHERE u.id = auth.uid())
      ]) AS r
      -- keep in sync with canEdit in src/components/office/AmpContactsManager.tsx
      WHERE lower(coalesce(r, '')) IN ('hr rep', 'office admin', 'admin', 'super admin')
    );
$$;

COMMENT ON FUNCTION common.can_manage_amp_contacts() IS
  'True when the current user may edit common.amp_contacts (HR Rep, Office Admin, Admin, Super Admin). Reads the role from the JWT, falling back to auth.users metadata.';

GRANT EXECUTE ON FUNCTION common.can_manage_amp_contacts() TO authenticated;

DROP POLICY IF EXISTS "HR and Office admins can manage amp_contacts" ON common.amp_contacts;

CREATE POLICY "HR and Office admins can manage amp_contacts" ON common.amp_contacts
  FOR ALL TO authenticated
  USING (common.can_manage_amp_contacts())
  WITH CHECK (common.can_manage_amp_contacts());
