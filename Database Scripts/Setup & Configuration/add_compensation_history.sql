-- Compensation history: current compensation on profiles + history table.
-- Run once in Supabase SQL Editor.

-- 1. Add current compensation fields to common.profiles
ALTER TABLE common.profiles
ADD COLUMN IF NOT EXISTS current_compensation_amount NUMERIC(12, 2),
ADD COLUMN IF NOT EXISTS current_pay_type TEXT,
ADD COLUMN IF NOT EXISTS current_pay_frequency TEXT;

COMMENT ON COLUMN common.profiles.current_compensation_amount IS 'Current pay amount (salary or hourly rate). History in common.compensation_history.';
COMMENT ON COLUMN common.profiles.current_pay_type IS 'salary or hourly';
COMMENT ON COLUMN common.profiles.current_pay_frequency IS 'For salary: annual, monthly, biweekly, weekly. Null for hourly.';

-- 2. Create compensation history table
CREATE TABLE IF NOT EXISTS common.compensation_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NOT NULL REFERENCES common.profiles(id) ON DELETE CASCADE,
  amount NUMERIC(12, 2) NOT NULL,
  pay_type TEXT NOT NULL CHECK (pay_type IN ('salary', 'hourly')),
  pay_frequency TEXT,
  effective_from TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

COMMENT ON TABLE common.compensation_history IS 'History of compensation changes per employee.';

CREATE INDEX IF NOT EXISTS idx_compensation_history_profile_id ON common.compensation_history(profile_id);
CREATE INDEX IF NOT EXISTS idx_compensation_history_effective_from ON common.compensation_history(profile_id, effective_from DESC);

ALTER TABLE common.compensation_history DISABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON common.compensation_history TO authenticated;
