-- Permission Management setup.
-- Run this in Supabase SQL Editor.
-- Used by Admin Dashboard -> Permission Management.

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE SCHEMA IF NOT EXISTS common;

GRANT USAGE ON SCHEMA common TO authenticated;

CREATE OR REPLACE FUNCTION common.can_manage_permissions()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = common, public
AS $permissions_access$
  SELECT
    auth.role() = 'authenticated'
    AND (
      COALESCE(auth.jwt() -> 'user_metadata' ->> 'role', '') IN ('Admin', 'Super Admin')
      OR lower(COALESCE(auth.jwt() ->> 'email', '')) IN (
        'john.chambers@ampqes.com',
        'jack.lyons@ampqes.com'
      )
    );
$permissions_access$;

GRANT EXECUTE ON FUNCTION common.can_manage_permissions() TO authenticated;

CREATE TABLE IF NOT EXISTS common.user_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  resource text NOT NULL,
  action text NOT NULL,
  scope text NOT NULL DEFAULT 'own',
  conditions jsonb,
  granted_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  valid_until timestamptz,
  valid_from timestamptz DEFAULT now(),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS common.permission_access_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL,
  resource text NOT NULL,
  action text NOT NULL,
  context jsonb,
  granted boolean NOT NULL,
  reason text,
  source text,
  ip_address text,
  user_agent text,
  component text,
  timestamp timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS common.permission_change_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL,
  subject_id text NOT NULL,
  action text NOT NULL,
  resource text NOT NULL,
  permission_action text NOT NULL,
  details jsonb,
  reason text,
  ip_address text,
  user_agent text,
  component text,
  timestamp timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_user_permissions_unique_active
  ON common.user_permissions (user_id, resource, action, scope)
  WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_user_permissions_user_id
  ON common.user_permissions (user_id);

CREATE INDEX IF NOT EXISTS idx_permission_access_logs_timestamp
  ON common.permission_access_logs (timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_permission_change_logs_timestamp
  ON common.permission_change_logs (timestamp DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON common.user_permissions TO authenticated;
GRANT SELECT, INSERT ON common.permission_access_logs TO authenticated;
GRANT SELECT, INSERT ON common.permission_change_logs TO authenticated;

ALTER TABLE common.user_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE common.permission_access_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE common.permission_change_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "user_permissions_select_admins_or_own" ON common.user_permissions;
DROP POLICY IF EXISTS "user_permissions_insert_admins" ON common.user_permissions;
DROP POLICY IF EXISTS "user_permissions_update_admins" ON common.user_permissions;
DROP POLICY IF EXISTS "user_permissions_delete_admins" ON common.user_permissions;

DROP POLICY IF EXISTS "permission_access_logs_select_admins" ON common.permission_access_logs;
DROP POLICY IF EXISTS "permission_access_logs_insert_authenticated" ON common.permission_access_logs;

DROP POLICY IF EXISTS "permission_change_logs_select_admins" ON common.permission_change_logs;
DROP POLICY IF EXISTS "permission_change_logs_insert_authenticated" ON common.permission_change_logs;

CREATE POLICY "user_permissions_select_admins_or_own"
  ON common.user_permissions
  FOR SELECT
  TO authenticated
  USING (common.can_manage_permissions() OR user_id = auth.uid());

CREATE POLICY "user_permissions_insert_admins"
  ON common.user_permissions
  FOR INSERT
  TO authenticated
  WITH CHECK (common.can_manage_permissions());

CREATE POLICY "user_permissions_update_admins"
  ON common.user_permissions
  FOR UPDATE
  TO authenticated
  USING (common.can_manage_permissions())
  WITH CHECK (common.can_manage_permissions());

CREATE POLICY "user_permissions_delete_admins"
  ON common.user_permissions
  FOR DELETE
  TO authenticated
  USING (common.can_manage_permissions());

CREATE POLICY "permission_access_logs_select_admins"
  ON common.permission_access_logs
  FOR SELECT
  TO authenticated
  USING (common.can_manage_permissions());

CREATE POLICY "permission_access_logs_insert_authenticated"
  ON common.permission_access_logs
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "permission_change_logs_select_admins"
  ON common.permission_change_logs
  FOR SELECT
  TO authenticated
  USING (common.can_manage_permissions());

CREATE POLICY "permission_change_logs_insert_authenticated"
  ON common.permission_change_logs
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.role() = 'authenticated');
