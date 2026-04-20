-- Fix permissions for common.user_preferences
-- Symptom: GET /rest/v1/user_preferences returns 403
--   { code: '42501', message: 'permission denied for table users' }
--
-- Root cause: The RLS policy (or a trigger on user_preferences) references
-- the `users` table (either public.users or auth.users) which the `authenticated`
-- role doesn't have SELECT on. We rewrite the policies to use auth.uid()
-- directly so they don't need to read the users table at all.
--
-- Safe to run multiple times.

-- 1. Ensure the table exists. If it doesn't, create a minimal version so the
--    notification service has somewhere to write preferences.
CREATE TABLE IF NOT EXISTS common.user_preferences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  notification_preferences jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 2. Make sure RLS is enabled.
ALTER TABLE common.user_preferences ENABLE ROW LEVEL SECURITY;

-- 3. Drop any existing policies that might reference `users`.
DO $$
DECLARE
  pol record;
BEGIN
  FOR pol IN
    SELECT policyname FROM pg_policies
    WHERE schemaname = 'common' AND tablename = 'user_preferences'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON common.user_preferences', pol.policyname);
  END LOOP;
END $$;

-- 4. Recreate policies using auth.uid() directly (no users-table lookup).
CREATE POLICY "user_preferences_select_own"
  ON common.user_preferences
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "user_preferences_insert_own"
  ON common.user_preferences
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "user_preferences_update_own"
  ON common.user_preferences
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "user_preferences_delete_own"
  ON common.user_preferences
  FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

-- 5. Ensure role can see the table + schema.
GRANT USAGE ON SCHEMA common TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON common.user_preferences TO authenticated;

-- 6. Make sure PostgREST sees the change immediately.
NOTIFY pgrst, 'reload schema';
