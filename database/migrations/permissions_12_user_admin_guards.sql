-- ampOS Roles & Permissions, item 7 (part 3a): close holes in the user admin functions.
--
-- LIVE CHANGE. Security fixes only: who may open User Management does not change here.
--
--   1. admin_update_user_metadata could be called WITHOUT A LOGIN. Its check compared
--      the caller's role with NOT IN, and a missing role made that check come out
--      "unknown", which Postgres treats as "don't stop". Anyone who knew a user's id
--      could read and change that person's profile details (not their role).
--      admin_get_user_metadata had the same flaw for a logged-in person with no role.
--   2. An Admin could make anyone (or themselves) Super Admin through the old role
--      dropdown. Since permissions_04 (Nov 20) Super Admin is role-based and still
--      accepted the OLD role name, for people with no pick on Roles & permissions.
--      Now only a pick there counts. All three Super Admins have one.
--   3. The old role dropdown and the deactivate button skipped the Super Admin rules.
--
-- Checked Nov 23 before writing: nobody holds the old "Super Admin" name without a
-- pick, and no change to Super Admin was logged since Nov 19.
--
-- All or nothing.

BEGIN;
SET LOCAL lock_timeout = '5s';

-- Safety stop: never run this if it would leave fewer than two human Super Admins.
DO $$
BEGIN
  IF (SELECT count(*)
        FROM common.user_roles ur
        JOIN auth.users u ON u.id = ur.user_id
       WHERE ur.role_key = 'super_admin'
         AND u.deleted_at IS NULL
         AND (u.banned_until IS NULL OR u.banned_until <= now())
         AND NOT EXISTS (SELECT 1 FROM common.service_accounts s WHERE s.user_id = u.id)) < 2
  THEN
    RAISE EXCEPTION 'Stopped: fewer than two people are picked as Super Admin. Nothing changed.';
  END IF;
END $$;

-- 1. Super Admin only comes from a pick, never from the old role name --------------

CREATE OR REPLACE FUNCTION common.role_key_for(p_user uuid) RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO ''
AS $$
  SELECT coalesce(
    (SELECT ur.role_key FROM common.user_roles ur WHERE ur.user_id = p_user),
    (SELECT r.key FROM common.roles r
      WHERE r.key <> 'super_admin'
        AND (SELECT u.raw_user_meta_data->>'role' FROM auth.users u WHERE u.id = p_user)
            = ANY (r.legacy_names)
      ORDER BY r.sort_order LIMIT 1)
  );
$$;

CREATE OR REPLACE FUNCTION common.my_role_key() RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO ''
AS $$
  SELECT common.role_key_for(auth.uid());
$$;

-- 2. Old role dropdown -------------------------------------------------------------

CREATE OR REPLACE FUNCTION common.admin_update_user_role(user_id uuid, new_role text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'common', 'public'
AS $$
DECLARE
  caller_id    uuid := auth.uid();
  caller_email text;
  caller_role  text;
  caller_super boolean;
  old_role     text;
BEGIN
  IF caller_id IS NULL THEN
    RAISE EXCEPTION 'Access denied - sign in first';
  END IF;

  SELECT u.email, u.raw_user_meta_data->>'role'
    INTO caller_email, caller_role
    FROM auth.users u WHERE u.id = caller_id;

  caller_super := coalesce(common.is_superuser_email(caller_email), false);

  IF coalesce(caller_role, '') <> 'Admin' AND NOT caller_super THEN
    RAISE EXCEPTION 'Access denied - Admin role required';
  END IF;

  IF user_id = caller_id AND NOT caller_super THEN
    RAISE EXCEPTION 'You can''t change your own role. Ask another admin.';
  END IF;

  IF lower(trim(coalesce(new_role, ''))) = 'super admin' THEN
    RAISE EXCEPTION 'Make someone a Super Admin on Admin > Roles & permissions.';
  END IF;

  IF common.role_key_for(user_id) = 'super_admin' AND NOT caller_super THEN
    RAISE EXCEPTION 'Only a Super Admin can change a Super Admin''s role.';
  END IF;

  SELECT u.raw_user_meta_data->>'role' INTO old_role
    FROM auth.users u WHERE u.id = user_id;

  UPDATE auth.users
     SET raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb)
                              || jsonb_build_object('role', new_role)
   WHERE id = user_id;

  INSERT INTO common.role_change_logs (user_id, subject_id, old_role, new_role, reason, component)
  VALUES (user_id::text, caller_id::text, old_role, new_role,
          'Role updated via Admin Dashboard', 'AdminUserManagement');
END;
$$;

-- 3. Deactivate / reactivate -------------------------------------------------------

CREATE OR REPLACE FUNCTION common.admin_set_user_active(target_user_id uuid, active boolean) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'common', 'public'
AS $$
DECLARE
  caller_id    uuid := auth.uid();
  caller_email text;
  caller_role  text;
  caller_super boolean;
BEGIN
  IF caller_id IS NULL THEN
    RAISE EXCEPTION 'Access denied - sign in first';
  END IF;

  SELECT u.email, u.raw_user_meta_data->>'role'
    INTO caller_email, caller_role
    FROM auth.users u WHERE u.id = caller_id;

  caller_super := coalesce(common.is_superuser_email(caller_email), false);

  IF coalesce(caller_role, '') <> 'Admin' AND NOT caller_super THEN
    RAISE EXCEPTION 'Access denied - Admin role required';
  END IF;

  IF NOT active AND target_user_id = caller_id THEN
    RAISE EXCEPTION 'You cannot deactivate your own account';
  END IF;

  -- Super Admins: only another Super Admin, and two people must remain.
  IF common.role_key_for(target_user_id) = 'super_admin' THEN
    IF NOT caller_super THEN
      RAISE EXCEPTION 'Only a Super Admin can switch a Super Admin''s account on or off.';
    END IF;
    IF NOT active
       AND NOT EXISTS (SELECT 1 FROM common.service_accounts s WHERE s.user_id = target_user_id)
       AND common.human_super_admin_count() <= 2
    THEN
      RAISE EXCEPTION 'At least two people must stay Super Admin. Make someone else Super Admin first.';
    END IF;
  END IF;

  IF active THEN
    UPDATE auth.users SET banned_until = NULL WHERE id = target_user_id;

    UPDATE common.profiles
       SET is_active = TRUE, deactivated_at = NULL, deactivated_by = NULL
     WHERE id = target_user_id;
  ELSE
    -- Ban login far into the future and end live sessions now.
    UPDATE auth.users
       SET banned_until = now() + interval '100 years'
     WHERE id = target_user_id;

    DELETE FROM auth.sessions WHERE user_id = target_user_id;

    -- Profile row is kept, only flagged, so report authorship stays.
    UPDATE common.profiles
       SET is_active = FALSE, deactivated_at = now(), deactivated_by = caller_id
     WHERE id = target_user_id;
  END IF;
END;
$$;

-- 4. Profile details: a login is required, and a missing role is a "no" --------------

CREATE OR REPLACE FUNCTION common.admin_update_user_metadata(target_user_id uuid, new_metadata jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'common', 'public'
AS $$
DECLARE
  caller_id        uuid := auth.uid();
  caller_role      text;
  caller_email     text;
  updated_metadata jsonb;
  rows_updated     int;
BEGIN
  IF caller_id IS NULL AND coalesce(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'Access denied - sign in first';
  END IF;

  IF caller_id IS NOT NULL AND caller_id IS DISTINCT FROM target_user_id THEN
    SELECT u.email, u.raw_user_meta_data->>'role'
      INTO caller_email, caller_role
      FROM auth.users u WHERE u.id = caller_id;

    IF coalesce(caller_role, '') NOT IN ('Admin', 'Super Admin', 'HR', 'HR Rep')
       AND NOT coalesce(common.is_superuser_email(caller_email), false)
    THEN
      RAISE EXCEPTION 'Access denied - Admin or HR role required to edit other users';
    END IF;
  END IF;

  UPDATE auth.users
     SET raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb)
                              || (coalesce(new_metadata, '{}'::jsonb) - 'role')
   WHERE id = target_user_id
  RETURNING raw_user_meta_data INTO updated_metadata;

  GET DIAGNOSTICS rows_updated = ROW_COUNT;
  IF rows_updated = 0 THEN
    RAISE EXCEPTION 'No user found with id %', target_user_id;
  END IF;

  RETURN updated_metadata;
END;
$$;

CREATE OR REPLACE FUNCTION common.admin_get_user_metadata(target_user_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'common', 'public'
AS $$
DECLARE
  caller_id       uuid := auth.uid();
  caller_role     text;
  caller_email    text;
  target_metadata jsonb;
BEGIN
  IF caller_id IS NULL THEN
    RAISE EXCEPTION 'Access denied - not authenticated';
  END IF;

  IF caller_id IS DISTINCT FROM target_user_id THEN
    SELECT u.email, u.raw_user_meta_data->>'role'
      INTO caller_email, caller_role
      FROM auth.users u WHERE u.id = caller_id;

    IF coalesce(caller_role, '') NOT IN ('Admin', 'Super Admin', 'HR', 'HR Rep')
       AND NOT coalesce(common.is_superuser_email(caller_email), false)
    THEN
      RAISE EXCEPTION 'Access denied - Admin or HR role required to read other users';
    END IF;
  END IF;

  SELECT u.raw_user_meta_data INTO target_metadata
    FROM auth.users u WHERE u.id = target_user_id;

  IF target_metadata IS NULL THEN
    RAISE EXCEPTION 'No user found with id %', target_user_id;
  END IF;

  RETURN target_metadata;
END;
$$;

-- 5. None of the admin functions need to be callable without a login -----------------

DO $$
DECLARE
  f regprocedure;
BEGIN
  FOR f IN
    SELECT p.oid::regprocedure
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'common' AND p.prokind = 'f' AND p.proname ~ '^admin_'
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', f);
  END LOOP;
END $$;

COMMIT;

-- Check (run after): expect  2 | 0
--   select common.human_super_admin_count(),
--          (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--            where n.nspname = 'common' and p.proname ~ '^admin_'
--              and has_function_privilege('anon', p.oid, 'execute'));
--
-- Check in the app: User Management loads, editing a profile photo works, and changing a
-- test person's role to anything except Super Admin works.
