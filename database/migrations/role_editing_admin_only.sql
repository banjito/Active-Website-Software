-- Only Admins can create, edit, reset or delete roles.
--
-- Why: System Roles are now editable in Role Management. Edits are saved to
-- common.custom_roles and applied to every user when the app loads. Before
-- this, any signed-in user could write that table: admin_update_role and
-- admin_delete_role had no permission check, and an RLS policy gave every
-- signed-in user full access. A technician could have given their own role the
-- admin portal from the browser console. (The old "Only admins can manage
-- roles" policy never matched: auth.jwt()->>'role' is always 'authenticated'.)
--
-- Fix:
--   1. admin_update_role / admin_delete_role require an Admin, Super Admin or
--      superuser caller (same idea as admin_update_user_role).
--   2. custom_roles: every signed-in user can still read it (the app needs it
--      to apply roles). Writes only go through the two functions above.
--
-- Safe to re-run.

CREATE OR REPLACE FUNCTION common.admin_update_role(role_name text, role_config jsonb) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'common', 'public'
    AS $$
DECLARE
  caller_email TEXT;
  caller_role TEXT;
BEGIN
  SELECT u.email, u.raw_user_meta_data->>'role'
  INTO caller_email, caller_role
  FROM auth.users u
  WHERE u.id = auth.uid();

  IF COALESCE(caller_role, '') NOT IN ('Admin', 'Super Admin')
     AND NOT common.is_superuser_email(caller_email)
  THEN
    RAISE EXCEPTION 'Access denied – Admin role required';
  END IF;

  INSERT INTO common.custom_roles (name, config, created_by)
  VALUES (role_name, role_config, auth.uid())
  ON CONFLICT (name)
  DO UPDATE SET
    config = EXCLUDED.config,
    updated_at = NOW();

  RETURN TRUE;
END;
$$;

CREATE OR REPLACE FUNCTION common.admin_delete_role(role_name text) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'common', 'public'
    AS $$
DECLARE
  caller_email TEXT;
  caller_role TEXT;
BEGIN
  SELECT u.email, u.raw_user_meta_data->>'role'
  INTO caller_email, caller_role
  FROM auth.users u
  WHERE u.id = auth.uid();

  IF COALESCE(caller_role, '') NOT IN ('Admin', 'Super Admin')
     AND NOT common.is_superuser_email(caller_email)
  THEN
    RAISE EXCEPTION 'Access denied – Admin role required';
  END IF;

  DELETE FROM common.custom_roles WHERE name = role_name;

  RETURN TRUE;
END;
$$;

REVOKE ALL ON FUNCTION common.admin_update_role(text, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION common.admin_delete_role(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION common.admin_update_role(text, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION common.admin_delete_role(text) TO authenticated;

DROP POLICY IF EXISTS "Allow all authenticated users to access custom_roles" ON common.custom_roles;
DROP POLICY IF EXISTS "Only admins can manage roles" ON common.custom_roles;
DROP POLICY IF EXISTS "Signed-in users can read roles" ON common.custom_roles;

CREATE POLICY "Signed-in users can read roles" ON common.custom_roles
  FOR SELECT TO authenticated USING (true);

-- RLS doesn't cover TRUNCATE, so take write grants away outright.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON common.custom_roles FROM authenticated, anon;
