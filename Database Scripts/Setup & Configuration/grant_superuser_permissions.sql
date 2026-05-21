-- Grant full superuser permissions to jack.lyons@ampqes.com (and john.chambers@ampqes.com)
-- Run this in Supabase SQL Editor if Jack cannot mark issues resolved, hide profiles, etc.

-- Central helper: keep in sync with SUPERUSER_EMAILS in src/lib/roles.ts
CREATE OR REPLACE FUNCTION common.is_superuser_email(p_email TEXT)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT lower(coalesce(p_email, '')) IN (
    'john.chambers@ampqes.com',
    'jack.lyons@ampqes.com'
  );
$$;

-- Issue reports: allow superusers to mark resolved/closed and change workflow status
CREATE OR REPLACE FUNCTION common.enforce_issue_report_permissions()
RETURNS TRIGGER AS $$
DECLARE
  jwt jsonb;
  email text;
  user_id uuid;
BEGIN
  BEGIN
    jwt := auth.jwt();
  EXCEPTION WHEN OTHERS THEN
    jwt := '{}'::jsonb;
  END;
  email := coalesce(jwt ->> 'email', '');
  user_id := (jwt ->> 'sub')::uuid;

  IF new.status IS DISTINCT FROM old.status AND new.status IN ('resolved', 'closed') THEN
    IF NOT common.is_superuser_email(email) THEN
      RAISE EXCEPTION 'Only authorized administrators can mark issues as complete';
    END IF;
    IF new.resolved_at IS NULL THEN
      new.resolved_at := now();
    END IF;
  END IF;

  IF new.priority IS DISTINCT FROM old.priority THEN
    IF old.reporter_id IS NULL OR old.reporter_id <> user_id THEN
      IF NOT common.is_superuser_email(email) THEN
        RAISE EXCEPTION 'Only the original reporter or an administrator can change priority';
      END IF;
    END IF;
  END IF;

  RETURN new;
END;
$$ LANGUAGE plpgsql;

-- Admin role management: allow superusers without Admin role claim
-- Must DROP first: CREATE OR REPLACE cannot change return type / signature
DROP FUNCTION IF EXISTS common.admin_update_user_role(UUID, TEXT);
DROP FUNCTION IF EXISTS public.admin_update_user_role(UUID, TEXT);

CREATE OR REPLACE FUNCTION common.admin_update_user_role(
  user_id UUID,
  new_role TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = common, public
AS $$
DECLARE
  caller_id UUID;
  caller_email TEXT;
  caller_role TEXT;
  old_role TEXT;
BEGIN
  caller_id := auth.uid();

  SELECT u.email, u.raw_user_meta_data->>'role'
  INTO caller_email, caller_role
  FROM auth.users u
  WHERE u.id = caller_id;

  IF caller_role IS DISTINCT FROM 'Admin'
     AND NOT common.is_superuser_email(caller_email)
  THEN
    RAISE EXCEPTION 'Access denied – Admin role required';
  END IF;

  SELECT u.raw_user_meta_data->>'role'
  INTO old_role
  FROM auth.users u
  WHERE u.id = user_id;

  UPDATE auth.users
  SET raw_user_meta_data = raw_user_meta_data || jsonb_build_object('role', new_role)
  WHERE id = user_id;

  INSERT INTO common.role_change_logs (user_id, subject_id, old_role, new_role, reason, component)
  VALUES (
    user_id::text,
    caller_id::text,
    old_role,
    new_role,
    'Role updated via Admin Dashboard',
    'AdminUserManagement'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION common.admin_update_user_role(UUID, TEXT) TO authenticated;

DROP FUNCTION IF EXISTS common.admin_get_users();
DROP FUNCTION IF EXISTS public.admin_get_users();

CREATE OR REPLACE FUNCTION common.admin_get_users()
RETURNS TABLE (
  id UUID,
  email TEXT,
  created_at TIMESTAMPTZ,
  raw_user_meta_data JSONB
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = common, public
AS $$
DECLARE
  caller_role TEXT;
  caller_email TEXT;
BEGIN
  SELECT u.email, u.raw_user_meta_data->>'role'
  INTO caller_email, caller_role
  FROM auth.users u
  WHERE u.id = auth.uid();

  IF caller_role IS DISTINCT FROM 'Admin'
     AND NOT common.is_superuser_email(caller_email)
  THEN
    RAISE EXCEPTION 'Access denied – Admin role required';
  END IF;

  RETURN QUERY
  SELECT u.id, u.email::TEXT, u.created_at, u.raw_user_meta_data
  FROM auth.users u
  ORDER BY u.created_at DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION common.admin_get_users() TO authenticated;

-- User metadata: allow superusers to edit other users
DROP FUNCTION IF EXISTS common.admin_update_user_metadata(UUID, JSONB);
DROP FUNCTION IF EXISTS public.admin_update_user_metadata(UUID, JSONB);

CREATE OR REPLACE FUNCTION common.admin_update_user_metadata(
  target_user_id UUID,
  new_metadata JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = common, public
AS $$
DECLARE
  caller_id UUID;
  caller_role TEXT;
  caller_email TEXT;
  clean_metadata JSONB;
  updated_metadata JSONB;
  rows_updated INT;
BEGIN
  caller_id := auth.uid();

  SELECT u.email, u.raw_user_meta_data->>'role'
  INTO caller_email, caller_role
  FROM auth.users u
  WHERE u.id = caller_id;

  IF caller_id IS DISTINCT FROM target_user_id
     AND caller_role NOT IN ('Admin', 'Super Admin', 'HR', 'HR Rep')
     AND NOT common.is_superuser_email(caller_email)
  THEN
    RAISE EXCEPTION 'Access denied - Admin or HR role required to edit other users';
  END IF;

  clean_metadata := COALESCE(new_metadata, '{}'::jsonb) - 'role';

  UPDATE auth.users
  SET raw_user_meta_data = COALESCE(raw_user_meta_data, '{}'::jsonb) || clean_metadata
  WHERE id = target_user_id
  RETURNING raw_user_meta_data INTO updated_metadata;

  GET DIAGNOSTICS rows_updated = ROW_COUNT;

  IF rows_updated = 0 THEN
    RAISE EXCEPTION 'No user found with id %', target_user_id;
  END IF;

  RETURN updated_metadata;
END;
$$;

GRANT EXECUTE ON FUNCTION common.admin_update_user_metadata(UUID, JSONB) TO authenticated;

DROP FUNCTION IF EXISTS common.admin_get_user_metadata(UUID);
DROP FUNCTION IF EXISTS public.admin_get_user_metadata(UUID);

CREATE OR REPLACE FUNCTION common.admin_get_user_metadata(target_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = common, public
AS $$
DECLARE
  caller_id UUID;
  caller_role TEXT;
  caller_email TEXT;
  target_metadata JSONB;
  target_email TEXT;
BEGIN
  caller_id := auth.uid();

  IF caller_id IS NULL THEN
    RAISE EXCEPTION 'Access denied - not authenticated';
  END IF;

  SELECT u.email, u.raw_user_meta_data->>'role'
  INTO caller_email, caller_role
  FROM auth.users u
  WHERE u.id = caller_id;

  IF caller_id IS DISTINCT FROM target_user_id
     AND caller_role NOT IN ('Admin', 'Super Admin', 'HR', 'HR Rep')
     AND NOT common.is_superuser_email(caller_email)
  THEN
    RAISE EXCEPTION 'Access denied - Admin or HR role required to read other users';
  END IF;

  SELECT u.raw_user_meta_data, u.email
  INTO target_metadata, target_email
  FROM auth.users u
  WHERE u.id = target_user_id;

  IF target_metadata IS NULL THEN
    RAISE EXCEPTION 'No user found with id %', target_user_id;
  END IF;

  RETURN target_metadata;
END;
$$;

GRANT EXECUTE ON FUNCTION common.admin_get_user_metadata(UUID) TO authenticated;
