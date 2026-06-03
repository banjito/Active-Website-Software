-- Allow HR to mark ampOS users inactive instead of deleting auth.users rows.
-- Run once in Supabase SQL Editor.

ALTER TABLE common.profiles
  ADD COLUMN IF NOT EXISTS employment_status TEXT DEFAULT 'active';

ALTER TABLE common.profiles
  DROP CONSTRAINT IF EXISTS profiles_employment_status_check;

ALTER TABLE common.profiles
  ADD CONSTRAINT profiles_employment_status_check
  CHECK (
    employment_status IN ('active', 'inactive', 'terminated', 'leave', 'other')
    OR employment_status IS NULL
  );

UPDATE common.profiles
SET employment_status = 'active'
WHERE employment_status IS NULL;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'common'
      AND table_name = 'profiles'
      AND column_name = 'hidden'
  ) THEN
    UPDATE common.profiles
    SET employment_status = 'inactive',
        hidden = false
    WHERE hidden = true;
  END IF;
END $$;

COMMENT ON COLUMN common.profiles.employment_status IS
'active or inactive for ampOS access lists; terminated, leave, other for HR reporting.';
