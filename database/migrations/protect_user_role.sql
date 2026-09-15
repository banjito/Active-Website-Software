-- Stop users from setting their own role.
--
-- Why: ampOS keeps each user's role in auth user_metadata, and the whole app
-- (HrLayout, usePermissions, dozens of RLS policies) trusts it. But any
-- signed-in user can write their own user_metadata through the auth API, e.g.
-- supabase.auth.updateUser({ data: { role: 'Super Admin' } }) from the browser
-- console. The app already calls updateUser for profile photos and names, so
-- the call is not blocked. Separately, common.make_user_admin() had no
-- permission check and was executable by every signed-in user.
--
-- Fix:
--   1. A trigger on auth.users keeps role unchanged whenever the write comes
--      from the auth API (Postgres role supabase_auth_admin): user self-updates,
--      sign-ups, and the service-role admin API. Role changes still work through
--      common.admin_update_user_role() (the Admin Dashboard) and the SQL editor,
--      which run as postgres. Edge functions must not set role via
--      auth.admin.updateUserById; call admin_update_user_role instead.
--   2. Unchecked role-granting functions are no longer executable by clients.
--   3. A review query (end of file) lists privileged users so anyone who
--      already promoted themselves can be spotted.
--
-- Profile saves are unaffected: they do not change role, and if a client sends
-- a different role the old value is silently kept rather than failing the save.
--
-- Safe to re-run.

CREATE OR REPLACE FUNCTION common.protect_user_role() RETURNS trigger
  LANGUAGE plpgsql
  -- Deliberately not SECURITY DEFINER: current_user must be the writer.
  SET search_path = ''
  AS $$
BEGIN
  IF current_user <> 'supabase_auth_admin' THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.raw_user_meta_data ? 'role' THEN
      NEW.raw_user_meta_data := NEW.raw_user_meta_data - 'role';
    END IF;
    RETURN NEW;
  END IF;

  IF (NEW.raw_user_meta_data -> 'role') IS DISTINCT FROM (OLD.raw_user_meta_data -> 'role') THEN
    IF OLD.raw_user_meta_data ? 'role' THEN
      NEW.raw_user_meta_data := coalesce(NEW.raw_user_meta_data, '{}'::jsonb)
        || jsonb_build_object('role', OLD.raw_user_meta_data -> 'role');
    ELSE
      NEW.raw_user_meta_data := NEW.raw_user_meta_data - 'role';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION common.protect_user_role() IS
  'Keeps auth user_metadata.role unchanged for writes made through the auth API. Change roles with common.admin_update_user_role().';

REVOKE ALL ON FUNCTION common.protect_user_role() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS protect_user_role ON auth.users;
CREATE TRIGGER protect_user_role
  BEFORE INSERT OR UPDATE OF raw_user_meta_data ON auth.users
  FOR EACH ROW EXECUTE FUNCTION common.protect_user_role();

-- Role-granting functions with no permission check.
DO $$
DECLARE
  f text;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'common.make_user_admin(text)',
    'extensions.make_user_admin(text)',
    'extensions.admin_update_user_role(uuid, text)',
    'extensions.assign_lab_customer_role(uuid)'
  ] LOOP
    IF to_regprocedure(f) IS NOT NULL THEN
      EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', f);
    END IF;
  END LOOP;
END;
$$;

-- REVIEW (not mirrored into bootstrap)
-- Privileged users. role_granted_via_dashboard_at is empty when no Admin
-- Dashboard change is logged for the current role: either set by hand in SQL,
-- set before logging existed, or self-assigned. Check every empty row.
SELECT
  u.email,
  u.raw_user_meta_data ->> 'role' AS role,
  (
    SELECT max(l."timestamp")
    FROM common.role_change_logs l
    WHERE l.user_id = u.id::text
      AND l.new_role = u.raw_user_meta_data ->> 'role'
  ) AS role_granted_via_dashboard_at,
  u.created_at
FROM auth.users u
WHERE u.raw_user_meta_data ->> 'role' IN ('Admin', 'Super Admin', 'HR Rep', 'Office Admin')
ORDER BY role_granted_via_dashboard_at NULLS FIRST, u.email;
