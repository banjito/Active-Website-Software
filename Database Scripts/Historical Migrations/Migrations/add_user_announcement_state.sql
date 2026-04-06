-- Per-user state for announcements: acknowledged (opened/clicked into) and dismissed (hidden from home).
-- Run in Supabase SQL Editor.
-- Users can only read/insert/update their own rows. HR > Announcements still shows all announcements.

CREATE TABLE IF NOT EXISTS common.user_announcement_state (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  announcement_id UUID NOT NULL,
  acknowledged_at TIMESTAMPTZ,
  dismissed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, announcement_id)
);

-- Optional FK to announcements; omit if common.announcements is in a different migration cycle
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_schema = 'common' AND table_name = 'user_announcement_state'
    AND constraint_name = 'user_announcement_state_announcement_id_fkey'
  ) THEN
    ALTER TABLE common.user_announcement_state
    ADD CONSTRAINT user_announcement_state_announcement_id_fkey
    FOREIGN KEY (announcement_id) REFERENCES common.announcements(id) ON DELETE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_user_announcement_state_user_id ON common.user_announcement_state(user_id);
CREATE INDEX IF NOT EXISTS idx_user_announcement_state_dismissed ON common.user_announcement_state(user_id, dismissed_at) WHERE dismissed_at IS NOT NULL;

ALTER TABLE common.user_announcement_state ENABLE ROW LEVEL SECURITY;

-- Users can only select/insert/update their own state
DROP POLICY IF EXISTS user_announcement_state_select_own ON common.user_announcement_state;
CREATE POLICY user_announcement_state_select_own ON common.user_announcement_state
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS user_announcement_state_insert_own ON common.user_announcement_state;
CREATE POLICY user_announcement_state_insert_own ON common.user_announcement_state
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS user_announcement_state_update_own ON common.user_announcement_state;
CREATE POLICY user_announcement_state_update_own ON common.user_announcement_state
  FOR UPDATE USING (auth.uid() = user_id);

COMMENT ON TABLE common.user_announcement_state IS 'Per-user acknowledgment and dismiss state for portal announcements; dismissed announcements are hidden on home but still visible under HR > Announcements';
COMMENT ON COLUMN common.user_announcement_state.acknowledged_at IS 'When the user opened/expanded the announcement (required before dismiss is allowed)';
COMMENT ON COLUMN common.user_announcement_state.dismissed_at IS 'When the user dismissed the announcement; hide from portal home after this';

GRANT SELECT, INSERT, UPDATE ON common.user_announcement_state TO authenticated;
