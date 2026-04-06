-- ============================================================================
-- HR Analytics Fields for Custom Reports
-- ============================================================================
-- Adds fields required for Headcount & Turnover, New Hires & Terminations,
-- and related HR analytics. Run once in Supabase SQL Editor.
-- ============================================================================

-- 1. common.profiles: termination and labor type for headcount/turnover reports
ALTER TABLE common.profiles
  ADD COLUMN IF NOT EXISTS hire_date DATE,
  ADD COLUMN IF NOT EXISTS termination_date DATE,
  ADD COLUMN IF NOT EXISTS termination_type TEXT CHECK (termination_type IN ('voluntary', 'involuntary', 'retirement', 'other') OR termination_type IS NULL),
  ADD COLUMN IF NOT EXISTS termination_reason TEXT,
  ADD COLUMN IF NOT EXISTS employment_status TEXT DEFAULT 'active' CHECK (employment_status IN ('active', 'terminated', 'leave', 'other') OR employment_status IS NULL),
  ADD COLUMN IF NOT EXISTS labor_type TEXT CHECK (labor_type IN ('Direct Labor', 'Indirect Labor') OR labor_type IS NULL),
  ADD COLUMN IF NOT EXISTS location TEXT;

COMMENT ON COLUMN common.profiles.hire_date IS 'Employee hire date for headcount and tenure.';
COMMENT ON COLUMN common.profiles.termination_date IS 'Date of termination for turnover reports.';
COMMENT ON COLUMN common.profiles.termination_type IS 'Voluntary, Involuntary, Retirement, Other.';
COMMENT ON COLUMN common.profiles.termination_reason IS 'Free-text or code for termination reason.';
COMMENT ON COLUMN common.profiles.employment_status IS 'active, terminated, leave, other.';
COMMENT ON COLUMN common.profiles.labor_type IS 'Direct Labor or Indirect Labor for cost reporting.';
COMMENT ON COLUMN common.profiles.location IS 'Work location for headcount by location.';

-- 2. common.job_requisitions: hiring manager for Open Requisitions report
ALTER TABLE common.job_requisitions
  ADD COLUMN IF NOT EXISTS hiring_manager_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;

COMMENT ON COLUMN common.job_requisitions.hiring_manager_id IS 'User ID of hiring manager for time-to-fill reporting.';

-- 3. common.candidates: offer status for pipeline/acceptance rate
ALTER TABLE common.candidates
  ADD COLUMN IF NOT EXISTS offer_status TEXT CHECK (offer_status IN ('pending', 'accepted', 'declined', 'expired') OR offer_status IS NULL);

COMMENT ON COLUMN common.candidates.offer_status IS 'Offer status for acceptance rate reporting.';
