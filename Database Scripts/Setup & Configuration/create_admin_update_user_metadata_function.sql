-- ============================================================
-- common.admin_update_user_metadata
--
-- Lets Admin / Super Admin / HR / HR Rep users update another
-- user's auth.users.raw_user_meta_data the same way a user
-- can update their own via supabase.auth.updateUser().
--
-- The "role" key is stripped from the incoming metadata so this
-- function cannot be used to escalate or change roles.
-- Role changes still go through common.admin_update_user_role.
--
-- No new tables. No new columns. Just a function.
-- ============================================================

DROP FUNCTION IF EXISTS common.admin_update_user_metadata(UUID, JSONB);

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
  rows_updated INT;
  updated_metadata JSONB;
BEGIN
  caller_id := auth.uid();

  IF caller_id IS NULL THEN
    RAISE EXCEPTION 'Access denied - not authenticated';
  END IF;

  SELECT
    u.email,
    u.raw_user_meta_data->>'role'
  INTO caller_email, caller_role
  FROM auth.users u
  WHERE u.id = caller_id;

  -- Allow self-edits OR Admin / Super Admin / HR / HR Rep
  IF caller_id IS DISTINCT FROM target_user_id
     AND caller_role NOT IN ('Admin', 'Super Admin', 'HR', 'HR Rep')
     AND lower(caller_email) IS DISTINCT FROM 'john.chambers@ampqes.com'
  THEN
    RAISE EXCEPTION 'Access denied - Admin or HR role required to edit other users';
  END IF;

  -- Strip "role" so this function can never change a user's role.
  clean_metadata := COALESCE(new_metadata, '{}'::jsonb) - 'role';

  UPDATE auth.users
  SET raw_user_meta_data =
    COALESCE(raw_user_meta_data, '{}'::jsonb) || clean_metadata
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


-- ============================================================
-- common.admin_get_user_metadata
--
-- Returns a single user's full raw_user_meta_data as JSONB.
-- Callable by the user themselves OR by
-- Admin / Super Admin / HR / HR Rep.
--
-- This exists because common.admin_get_users is Admin-only and
-- common.get_user_metadata returns only a limited subset of
-- fields, so HR viewers cannot see fresh bio / division /
-- birthday / emergency contact / goals on other users.
-- ============================================================

DROP FUNCTION IF EXISTS common.admin_get_user_metadata(UUID);

CREATE OR REPLACE FUNCTION common.admin_get_user_metadata(
  target_user_id UUID
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
  target_metadata JSONB;
  target_email TEXT;
BEGIN
  caller_id := auth.uid();

  IF caller_id IS NULL THEN
    RAISE EXCEPTION 'Access denied - not authenticated';
  END IF;

  SELECT
    u.email,
    u.raw_user_meta_data->>'role'
  INTO caller_email, caller_role
  FROM auth.users u
  WHERE u.id = caller_id;

  IF caller_id IS DISTINCT FROM target_user_id
     AND caller_role NOT IN ('Admin', 'Super Admin', 'HR', 'HR Rep')
     AND lower(caller_email) IS DISTINCT FROM 'john.chambers@ampqes.com'
  THEN
    RAISE EXCEPTION 'Access denied - Admin or HR role required to read other users';
  END IF;

  SELECT u.raw_user_meta_data, u.email
  INTO target_metadata, target_email
  FROM auth.users u
  WHERE u.id = target_user_id;

  IF target_metadata IS NULL AND target_email IS NULL THEN
    RETURN NULL;
  END IF;

  RETURN COALESCE(target_metadata, '{}'::jsonb)
    || jsonb_build_object('email', target_email);
END;
$$;

GRANT EXECUTE ON FUNCTION common.admin_get_user_metadata(UUID) TO authenticated;
