-- Admin notifications table used by WelcomePopup, SystemLogsCard, and Admin Dashboard health checks.
-- Run this in Supabase SQL Editor.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.admin_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type text NOT NULL,
  message text NOT NULL,
  is_read boolean NOT NULL DEFAULT false,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.admin_notifications
  ADD COLUMN IF NOT EXISTS type text,
  ADD COLUMN IF NOT EXISTS message text,
  ADD COLUMN IF NOT EXISTS is_read boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS metadata jsonb DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_admin_notifications_created_at
  ON public.admin_notifications (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_admin_notifications_is_read
  ON public.admin_notifications (is_read);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.admin_notifications TO authenticated;

ALTER TABLE public.admin_notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin_notifications_insert_authenticated" ON public.admin_notifications;
DROP POLICY IF EXISTS "admin_notifications_select_admins" ON public.admin_notifications;
DROP POLICY IF EXISTS "admin_notifications_update_admins" ON public.admin_notifications;
DROP POLICY IF EXISTS "admin_notifications_delete_admins" ON public.admin_notifications;

CREATE POLICY "admin_notifications_insert_authenticated"
  ON public.admin_notifications
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "admin_notifications_select_admins"
  ON public.admin_notifications
  FOR SELECT
  TO authenticated
  USING (
    COALESCE(auth.jwt() -> 'user_metadata' ->> 'role', '') IN ('Admin', 'Super Admin')
    OR lower(COALESCE(auth.jwt() ->> 'email', '')) IN (
      'john.chambers@ampqes.com',
      'jack.lyons@ampqes.com'
    )
  );

CREATE POLICY "admin_notifications_update_admins"
  ON public.admin_notifications
  FOR UPDATE
  TO authenticated
  USING (
    COALESCE(auth.jwt() -> 'user_metadata' ->> 'role', '') IN ('Admin', 'Super Admin')
    OR lower(COALESCE(auth.jwt() ->> 'email', '')) IN (
      'john.chambers@ampqes.com',
      'jack.lyons@ampqes.com'
    )
  )
  WITH CHECK (
    COALESCE(auth.jwt() -> 'user_metadata' ->> 'role', '') IN ('Admin', 'Super Admin')
    OR lower(COALESCE(auth.jwt() ->> 'email', '')) IN (
      'john.chambers@ampqes.com',
      'jack.lyons@ampqes.com'
    )
  );

CREATE POLICY "admin_notifications_delete_admins"
  ON public.admin_notifications
  FOR DELETE
  TO authenticated
  USING (
    COALESCE(auth.jwt() -> 'user_metadata' ->> 'role', '') IN ('Admin', 'Super Admin')
    OR lower(COALESCE(auth.jwt() ->> 'email', '')) IN (
      'john.chambers@ampqes.com',
      'jack.lyons@ampqes.com'
    )
  );
