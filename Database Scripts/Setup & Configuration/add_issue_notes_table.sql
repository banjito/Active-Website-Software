-- Issue notes: comments/feedback on issues and feature requests (reporter + interested parties can add)

CREATE TABLE IF NOT EXISTS common.issue_notes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  issue_id UUID NOT NULL REFERENCES common.issue_reports(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  attachment_url TEXT,
  attachment_name TEXT,
  attachment_type TEXT,
  attachment_size INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  edited BOOLEAN DEFAULT FALSE,
  deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_issue_notes_issue_id ON common.issue_notes(issue_id);
CREATE INDEX IF NOT EXISTS idx_issue_notes_user_id ON common.issue_notes(user_id);
CREATE INDEX IF NOT EXISTS idx_issue_notes_created_at ON common.issue_notes(created_at DESC);

ALTER TABLE common.issue_notes ENABLE ROW LEVEL SECURITY;

-- Any authenticated user can view non-deleted notes on issues
CREATE POLICY "issue_notes_select" ON common.issue_notes
  FOR SELECT USING (auth.role() = 'authenticated' AND deleted_at IS NULL);

-- Only reporter or interested party can insert (enforced in app; DB allows any authenticated for simplicity)
CREATE POLICY "issue_notes_insert" ON common.issue_notes
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "issue_notes_update_own" ON common.issue_notes
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "issue_notes_delete_own" ON common.issue_notes
  FOR DELETE USING (auth.uid() = user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON common.issue_notes TO authenticated;
GRANT SELECT ON common.issue_notes TO service_role;

CREATE OR REPLACE FUNCTION common.issue_notes_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  NEW.edited = TRUE;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS issue_notes_updated_at ON common.issue_notes;
CREATE TRIGGER issue_notes_updated_at
  BEFORE UPDATE ON common.issue_notes
  FOR EACH ROW EXECUTE FUNCTION common.issue_notes_updated_at();

COMMENT ON TABLE common.issue_notes IS 'Comments and feedback on issues/feature requests from reporter and interested parties';
