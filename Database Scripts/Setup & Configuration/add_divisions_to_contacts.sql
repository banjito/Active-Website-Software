-- Add divisions column to common.contacts table
-- Mirrors the divisions column on common.customers.
-- This enables tagging contacts with one or more divisions (Field, Scavenger,
-- Armadillo, Engineering) so that contacts can be filtered independently of
-- their customer's divisions. When a contact has no divisions of its own the
-- UI falls back to the customer's divisions.

ALTER TABLE common.contacts
  ADD COLUMN IF NOT EXISTS divisions text[] DEFAULT NULL;

-- GIN index for efficient array overlap queries used by the contact list filter.
CREATE INDEX IF NOT EXISTS idx_contacts_divisions ON common.contacts USING GIN (divisions);

-- Verify
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'common'
  AND table_name = 'contacts'
  AND column_name = 'divisions';
