-- Let a call-list entry be pinned to an ampOS account.
--
-- Why: the header contacts dropdown links a contact to their profile by email,
-- falling back to name. That covers most people but not nicknames the two
-- systems disagree on (call list "Zechariah Freeborn" vs account "Zach
-- Freeborn", "Liam Laidlaw" vs "William Laidlaw"). Guessing harder is unsafe:
-- Josh Palacios has no account and Marcos Palacios does, so any surname-only
-- rule would link Josh to Marcos. A pinned id is exact.
--
-- NULL profile_id keeps the automatic email/name matching. A set value wins.
-- Safe to re-run.

ALTER TABLE common.amp_contacts
  ADD COLUMN IF NOT EXISTS profile_id uuid REFERENCES common.profiles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS amp_contacts_profile_id_idx
  ON common.amp_contacts (profile_id);

COMMENT ON COLUMN common.amp_contacts.profile_id IS
  'Pinned ampOS account for this contact. NULL = match automatically by email, then name.';

-- Seed the two known nickname mismatches. Reads auth.users so it works whether
-- or not backfill_profiles_email.sql has run yet; no-ops on an instance that
-- has neither the contact nor the account.
UPDATE common.amp_contacts c
SET profile_id = u.id
FROM auth.users u
WHERE c.profile_id IS NULL
  AND EXISTS (SELECT 1 FROM common.profiles p WHERE p.id = u.id)
  AND (
    (lower(btrim(c.name)) = 'zechariah freeborn' AND lower(u.email) = 'zach.freeborn@ampqes.com')
    OR (lower(btrim(c.name)) = 'liam laidlaw' AND lower(u.email) = 'william.laidlaw@ampqes.com')
  );
