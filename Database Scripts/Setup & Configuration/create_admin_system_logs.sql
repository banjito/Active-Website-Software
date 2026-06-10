-- Admin System Logs setup.
-- Run this in Supabase SQL Editor.
-- Used by Admin Dashboard -> System Logs and System Health.

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE SCHEMA IF NOT EXISTS common;

GRANT USAGE ON SCHEMA common TO authenticated;

CREATE TABLE IF NOT EXISTS common.admin_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type text NOT NULL,
  message text NOT NULL,
  is_read boolean NOT NULL DEFAULT false,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

DO $admin_logs_copy$
BEGIN
  IF to_regclass('public.admin_notifications') IS NOT NULL THEN
    INSERT INTO common.admin_notifications (id, type, message, is_read, metadata, created_at)
    SELECT id, type, message, is_read, COALESCE(metadata, '{}'::jsonb), created_at
    FROM public.admin_notifications
    ON CONFLICT (id) DO NOTHING;
  END IF;
END
$admin_logs_copy$;

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

CREATE TABLE IF NOT EXISTS common.role_change_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL,
  subject_id text NOT NULL,
  old_role text,
  new_role text,
  reason text,
  ip_address text,
  user_agent text,
  component text,
  timestamp timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS common.system_change_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_id text NOT NULL,
  action text NOT NULL,
  component text NOT NULL,
  details jsonb,
  ip_address text,
  user_agent text,
  timestamp timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_admin_notifications_created_at
  ON common.admin_notifications (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_role_change_logs_timestamp
  ON common.role_change_logs (timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_system_change_logs_timestamp
  ON common.system_change_logs (timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_permission_change_logs_timestamp
  ON common.permission_change_logs (timestamp DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON common.admin_notifications TO authenticated;
GRANT SELECT, INSERT ON common.role_change_logs TO authenticated;
GRANT SELECT, INSERT ON common.system_change_logs TO authenticated;
GRANT SELECT, INSERT ON common.permission_change_logs TO authenticated;

ALTER TABLE common.admin_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE common.role_change_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE common.system_change_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE common.permission_change_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin_notifications_insert_authenticated" ON common.admin_notifications;
DROP POLICY IF EXISTS "admin_notifications_select_admins" ON common.admin_notifications;
DROP POLICY IF EXISTS "admin_notifications_update_admins" ON common.admin_notifications;
DROP POLICY IF EXISTS "admin_notifications_delete_admins" ON common.admin_notifications;

DROP POLICY IF EXISTS "role_change_logs_select_admins" ON common.role_change_logs;
DROP POLICY IF EXISTS "role_change_logs_select_own" ON common.role_change_logs;
DROP POLICY IF EXISTS "role_change_logs_insert_authenticated" ON common.role_change_logs;

DROP POLICY IF EXISTS "system_change_logs_select_admins" ON common.system_change_logs;
DROP POLICY IF EXISTS "system_change_logs_insert_authenticated" ON common.system_change_logs;

DROP POLICY IF EXISTS "permission_change_logs_select_admins" ON common.permission_change_logs;
DROP POLICY IF EXISTS "permission_change_logs_insert_authenticated" ON common.permission_change_logs;

CREATE OR REPLACE FUNCTION common.can_view_admin_logs()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = common, public
AS $admin_logs_access$
  SELECT
    auth.role() = 'authenticated'
    AND (
      COALESCE(auth.jwt() -> 'user_metadata' ->> 'role', '') IN ('Admin', 'Super Admin')
      OR lower(COALESCE(auth.jwt() ->> 'email', '')) IN (
        'john.chambers@ampqes.com',
        'jack.lyons@ampqes.com'
      )
    );
$admin_logs_access$;

GRANT EXECUTE ON FUNCTION common.can_view_admin_logs() TO authenticated;

CREATE POLICY "admin_notifications_insert_authenticated"
  ON common.admin_notifications
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "admin_notifications_select_admins"
  ON common.admin_notifications
  FOR SELECT
  TO authenticated
  USING (common.can_view_admin_logs());

CREATE POLICY "admin_notifications_update_admins"
  ON common.admin_notifications
  FOR UPDATE
  TO authenticated
  USING (common.can_view_admin_logs())
  WITH CHECK (common.can_view_admin_logs());

CREATE POLICY "admin_notifications_delete_admins"
  ON common.admin_notifications
  FOR DELETE
  TO authenticated
  USING (common.can_view_admin_logs());

CREATE POLICY "role_change_logs_select_admins"
  ON common.role_change_logs
  FOR SELECT
  TO authenticated
  USING (common.can_view_admin_logs());

CREATE POLICY "role_change_logs_select_own"
  ON common.role_change_logs
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid()::text);

CREATE POLICY "role_change_logs_insert_authenticated"
  ON common.role_change_logs
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "system_change_logs_select_admins"
  ON common.system_change_logs
  FOR SELECT
  TO authenticated
  USING (common.can_view_admin_logs());

CREATE POLICY "system_change_logs_insert_authenticated"
  ON common.system_change_logs
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "permission_change_logs_select_admins"
  ON common.permission_change_logs
  FOR SELECT
  TO authenticated
  USING (common.can_view_admin_logs());

CREATE POLICY "permission_change_logs_insert_authenticated"
  ON common.permission_change_logs
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.role() = 'authenticated');
