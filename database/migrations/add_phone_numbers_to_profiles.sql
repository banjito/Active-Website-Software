-- Add work phone and personal phone columns to common.profiles
ALTER TABLE common.profiles
  ADD COLUMN IF NOT EXISTS work_phone TEXT,
  ADD COLUMN IF NOT EXISTS personal_phone TEXT;
