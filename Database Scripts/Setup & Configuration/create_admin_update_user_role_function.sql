-- ============================================================
-- Admin functions for user management  (common schema)
--
-- Two RPC functions used by AdminUserManagement:
--   1. admin_get_users      – list all users (for the user table)
--   2. admin_update_user_role – change a user's role
--
-- admin_update_user_role also inserts into common.role_change_logs
-- so the front-end realtime subscription triggers a JWT refresh.
-- ============================================================

-- Ensure the role_change_logs table exists
CREATE TABLE IF NOT EXISTS common.role_change_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  subject_id TEXT NOT NULL,
  old_role TEXT,
  new_role TEXT,
  reason TEXT,
  ip_address TEXT,
  user_agent TEXT,
  component TEXT,
  timestamp TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Allow realtime subscriptions for authenticated users (needed by AuthContext)
ALTER TABLE common.role_change_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own role changes" ON common.role_change_logs;
CREATE POLICY "Users can read own role changes"
  ON common.role_change_logs
  FOR SELECT
  USING (user_id = auth.uid()::text);

DROP POLICY IF EXISTS "Service role can insert role changes" ON common.role_change_logs;
CREATE POLICY "Service role can insert role changes"
  ON common.role_change_logs
  FOR INSERT
  WITH CHECK (true);

-- Drop existing function if any
DROP FUNCTION IF EXISTS common.admin_update_user_role(UUID, TEXT);

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
  caller_role TEXT;
  caller_email TEXT;
  old_role TEXT;
BEGIN
  -- Identify the caller
  caller_id := auth.uid();

  SELECT
    u.email,
    u.raw_user_meta_data->>'role'
  INTO caller_email, caller_role
  FROM auth.users u
  WHERE u.id = caller_id;

  -- Only allow Admins or superusers (see common.is_superuser_email)
  IF caller_role IS DISTINCT FROM 'Admin'
     AND NOT common.is_superuser_email(caller_email)
  THEN
    RAISE EXCEPTION 'Access denied – Admin role required';
  END IF;

  -- Fetch the target user's current role
  SELECT u.raw_user_meta_data->>'role'
  INTO old_role
  FROM auth.users u
  WHERE u.id = user_id;

  -- Update the role in user metadata
  UPDATE auth.users
  SET raw_user_meta_data = raw_user_meta_data || jsonb_build_object('role', new_role)
  WHERE id = user_id;

  -- Log the change so the realtime subscription in AuthContext fires
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

-- Grant execute to authenticated users (the function itself checks caller role)
GRANT EXECUTE ON FUNCTION common.admin_update_user_role(UUID, TEXT) TO authenticated;


-- ============================================================
-- admin_get_users
--
-- Returns all users from auth.users for the Admin user table.
-- Only Admins and the superuser email can call this.
-- ============================================================
DROP FUNCTION IF EXISTS common.admin_get_users();

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
  SELECT
    u.email,
    u.raw_user_meta_data->>'role'
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
    u.raw_user_meta_data
  FROM auth.users u
  ORDER BY u.created_at DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION common.admin_get_users() TO authenticated;


-- ============================================================
-- Enable Supabase Realtime on role_change_logs
-- (required for the AuthContext subscription to work)
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'common'
      AND tablename = 'role_change_logs'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE common.role_change_logs;
  END IF;
END;
$$;
