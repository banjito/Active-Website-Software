-- Add linked_user_id and linked_user_email to candidates table
-- This links a candidate to their ampOS employee account after hire

ALTER TABLE common.candidates
  ADD COLUMN IF NOT EXISTS linked_user_id UUID,
  ADD COLUMN IF NOT EXISTS linked_user_email TEXT;

CREATE INDEX IF NOT EXISTS idx_candidates_linked_user
  ON common.candidates(linked_user_id)
  WHERE linked_user_id IS NOT NULL;
