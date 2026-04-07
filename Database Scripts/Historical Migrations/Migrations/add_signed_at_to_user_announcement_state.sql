-- Add signed_at column to track when a user actually signed/acknowledged an announcement's document.
-- Separate from acknowledged_at (which only tracks when the card was expanded).
-- Announcements with attached documents require signed_at before they can be dismissed.

ALTER TABLE common.user_announcement_state
ADD COLUMN IF NOT EXISTS signed_at TIMESTAMPTZ;

COMMENT ON COLUMN common.user_announcement_state.signed_at IS 'When the user submitted their e-signature for the announcement document; required before dismiss for document-based announcements';
