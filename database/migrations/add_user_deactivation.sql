-- ============================================================
-- User deactivation (soft-delete) — common schema
--
-- Goal: let admins REMOVE a user (block login + hide from UI)
-- WITHOUT deleting their auth.users / common.profiles row, so that
-- every report they authored keeps showing their name.
--
-- common.profiles.id -> auth.users(id) is ON DELETE CASCADE, so a real
-- delete would wipe the profile and orphan authorship. We never delete;
-- we deactivate instead.
--
-- This migration:
--   1. Adds is_active / deactivated_at / deactivated_by to common.profiles
--   2. admin_set_user_active(target, active) — bans/unbans the auth user
--      (blocks login) and flips the profile flag, admin-only
--   3. Extends admin_get_users() to return is_active for the admin table
-- ============================================================

-- 1. Soft-delete columns on profiles ------------------------------------------
ALTER TABLE common.profiles
  ADD COLUMN IF NOT EXISTS is_active      BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS deactivated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS deactivated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;

-- Partial index so "active users" lookups (the common case) stay fast.
CREATE INDEX IF NOT EXISTS profiles_is_active_idx
  ON common.profiles (is_active)
  WHERE is_active = TRUE;


-- 2. admin_set_user_active ----------------------------------------------------
--    active = false  -> ban the auth user (banned_until far future),
--                       drop their sessions, mark profile inactive
--    active = true   -> clear the ban, mark profile active again
DROP FUNCTION IF EXISTS common.admin_set_user_active(UUID, BOOLEAN);

CREATE OR REPLACE FUNCTION common.admin_set_user_active(
  target_user_id UUID,
  active BOOLEAN
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = common, public
AS $$
DECLARE
  caller_id    UUID;
  caller_role  TEXT;
  caller_email TEXT;
BEGIN
  caller_id := auth.uid();

  SELECT u.email, u.raw_user_meta_data->>'role'
  INTO caller_email, caller_role
  FROM auth.users u
  WHERE u.id = caller_id;

  -- Same gate as admin_update_user_role: Admins or superusers only.
  IF caller_role IS DISTINCT FROM 'Admin'
     AND NOT common.is_superuser_email(caller_email)
  THEN
    RAISE EXCEPTION 'Access denied – Admin role required';
  END IF;

  -- Don't let an admin lock themselves out.
  IF NOT active AND target_user_id = caller_id THEN
    RAISE EXCEPTION 'You cannot deactivate your own account';
  END IF;

  IF active THEN
    -- Reactivate: lift the login ban.
    UPDATE auth.users
    SET banned_until = NULL
    WHERE id = target_user_id;

    UPDATE common.profiles
    SET is_active = TRUE,
        deactivated_at = NULL,
        deactivated_by = NULL
    WHERE id = target_user_id;
  ELSE
    -- Deactivate: ban login far into the future and end live sessions now.
    UPDATE auth.users
    SET banned_until = NOW() + INTERVAL '100 years'
    WHERE id = target_user_id;

    DELETE FROM auth.sessions WHERE user_id = target_user_id;

    -- Profile row is preserved — only flagged — so report authorship stays.
    UPDATE common.profiles
    SET is_active = FALSE,
        deactivated_at = NOW(),
        deactivated_by = caller_id
    WHERE id = target_user_id;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION common.admin_set_user_active(UUID, BOOLEAN) TO authenticated;


-- 3. Extend admin_get_users to expose is_active -------------------------------
DROP FUNCTION IF EXISTS common.admin_get_users();

CREATE OR REPLACE FUNCTION common.admin_get_users()
RETURNS TABLE (
  id UUID,
  email TEXT,
  created_at TIMESTAMPTZ,
  raw_user_meta_data JSONB,
  is_active BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = common, public
AS $$
DECLARE
  caller_role  TEXT;
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
  SELECT
    u.id,
    u.email::TEXT,
    u.created_at,
    u.raw_user_meta_data,
    -- Source of truth is the auth ban (set for every user, even those with no
    -- common.profiles row, e.g. external/non-staff accounts). The profile flag
    -- is an additional signal for staff and is kept in sync by
    -- admin_set_user_active.
    CASE
      WHEN u.banned_until IS NOT NULL AND u.banned_until > NOW() THEN FALSE
      ELSE COALESCE(p.is_active, TRUE)
    END AS is_active
  FROM auth.users u
  LEFT JOIN common.profiles p ON p.id = u.id
  ORDER BY u.created_at DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION common.admin_get_users() TO authenticated;
