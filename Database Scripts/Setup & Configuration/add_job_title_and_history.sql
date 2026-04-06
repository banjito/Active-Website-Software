-- Job title + history: one script. Run once in Supabase SQL Editor.

-- 1. Add employee fields to common.profiles
ALTER TABLE common.profiles
ADD COLUMN IF NOT EXISTS job_title TEXT,
ADD COLUMN IF NOT EXISTS department TEXT;

COMMENT ON COLUMN common.profiles.job_title IS 'Current job title. History in common.job_title_history.';
COMMENT ON COLUMN common.profiles.department IS 'Employee department (e.g. Engineering, HR).';

-- 2. Create job title history table
CREATE TABLE IF NOT EXISTS common.job_title_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NOT NULL REFERENCES common.profiles(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  effective_from TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

COMMENT ON TABLE common.job_title_history IS 'History of job title changes per employee.';

CREATE INDEX IF NOT EXISTS idx_job_title_history_profile_id ON common.job_title_history(profile_id);
CREATE INDEX IF NOT EXISTS idx_job_title_history_effective_from ON common.job_title_history(profile_id, effective_from DESC);

-- 3. No RLS, just GRANTs
ALTER TABLE common.profiles DISABLE ROW LEVEL SECURITY;
ALTER TABLE common.job_title_history DISABLE ROW LEVEL SECURITY;

GRANT SELECT, UPDATE ON common.profiles TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON common.job_title_history TO authenticated;
