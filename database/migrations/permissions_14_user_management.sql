-- ampOS Roles & Permissions, item 7 (part 3c): User Management follows the permissions.
--
-- LIVE CHANGE (Jack OK'd the list, Nov 23). Was: anyone whose OLD role is Admin. Now:
--   * switch accounts on/off, edit other people's profiles   admin.manage_users
--   * change the old role                                    admin.manage_roles
--   * HR (hr.view_all) keeps editing other people's profiles
-- Super Admins always can. The Super Admin rules from permissions_12 stay.
-- Reading the people list (admin_get_users) is NOT narrowed: scheduling, jobs and
-- equipment use it. It also opens to admin.manage_users, so the page works for
-- someone given that permission without the old Admin role (no one today).
--
-- All or nothing. Order with the app push doesn't matter.

BEGIN;
SET LOCAL lock_timeout = '5s';

CREATE OR REPLACE FUNCTION common.admin_update_user_role(user_id uuid, new_role text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'common', 'public'
AS $$
DECLARE
  caller_id    uuid := auth.uid();
  caller_email text;
  caller_super boolean;
  old_role     text;
BEGIN
  IF caller_id IS NULL THEN
    RAISE EXCEPTION 'Access denied - sign in first';
  END IF;

  SELECT u.email INTO caller_email FROM auth.users u WHERE u.id = caller_id;

  caller_super := coalesce(common.is_superuser_email(caller_email), false);

  IF NOT common.can('admin.manage_roles') THEN
    RAISE EXCEPTION 'Access denied - you need "Change roles and permissions"';
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

CREATE OR REPLACE FUNCTION common.admin_set_user_active(target_user_id uuid, active boolean) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'common', 'public'
AS $$
DECLARE
  caller_id    uuid := auth.uid();
  caller_email text;
  caller_super boolean;
BEGIN
  IF caller_id IS NULL THEN
    RAISE EXCEPTION 'Access denied - sign in first';
  END IF;

  SELECT u.email INTO caller_email FROM auth.users u WHERE u.id = caller_id;

  caller_super := coalesce(common.is_superuser_email(caller_email), false);

  IF NOT common.can('admin.manage_users') THEN
    RAISE EXCEPTION 'Access denied - you need "Invite and remove people"';
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

CREATE OR REPLACE FUNCTION common.admin_update_user_metadata(target_user_id uuid, new_metadata jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'common', 'public'
AS $$
DECLARE
  caller_id        uuid := auth.uid();
  updated_metadata jsonb;
  rows_updated     int;
BEGIN
  IF caller_id IS NULL AND coalesce(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'Access denied - sign in first';
  END IF;

  IF caller_id IS NOT NULL AND caller_id IS DISTINCT FROM target_user_id
     AND NOT common.can('admin.manage_users')
     AND NOT common.can('hr.view_all')
  THEN
    RAISE EXCEPTION 'Access denied - you need "Invite and remove people" to edit other people';
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

CREATE OR REPLACE FUNCTION common.admin_get_users()
RETURNS TABLE(id uuid, email text, created_at timestamp with time zone, raw_user_meta_data jsonb, is_active boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'common', 'public'
AS $$
DECLARE
  caller_role text;
BEGIN
  SELECT u.raw_user_meta_data->>'role' INTO caller_role
    FROM auth.users u WHERE u.id = auth.uid();

  IF coalesce(caller_role, '') <> 'Admin' AND NOT common.can('admin.manage_users') THEN
    RAISE EXCEPTION 'Access denied - Admin role required';
  END IF;

  RETURN QUERY
  SELECT u.id, u.email::text, u.created_at, u.raw_user_meta_data,
         CASE
           WHEN u.banned_until IS NOT NULL AND u.banned_until > now() THEN FALSE
           ELSE coalesce(p.is_active, TRUE)
         END AS is_active
    FROM auth.users u
    LEFT JOIN common.profiles p ON p.id = u.id
   ORDER BY u.created_at DESC;
END;
$$;

COMMIT;

-- Check in the app:
--   You: User Management and Roles & permissions open as before; edit a profile photo.
--   One of the 12 (for example an Office Admin): the Admin dashboard has no User
--   Management or Roles card. (View as can't show this: it uses the old role name, so
--   it lands on the portal instead of the dashboard.)
--
-- UNDO: run permissions_12_user_admin_guards.sql again (puts the old-role checks back).
