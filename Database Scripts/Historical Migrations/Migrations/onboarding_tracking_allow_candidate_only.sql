-- Allow onboarding tracking records with just candidate_id (no offer required).
-- This enables "Send to Onboarding" directly from the ATS when a candidate is hired,
-- without requiring a formal offer letter to be accepted first.

-- Relax the check constraint: allow candidate_id alone OR candidate_id + offer_id OR user_id
ALTER TABLE common.onboarding_tracking
  DROP CONSTRAINT IF EXISTS onboarding_tracking_person_check;

ALTER TABLE common.onboarding_tracking
  ADD CONSTRAINT onboarding_tracking_person_check CHECK (
    (candidate_id IS NOT NULL) OR (user_id IS NOT NULL)
  );

COMMENT ON CONSTRAINT onboarding_tracking_person_check ON common.onboarding_tracking
  IS 'A tracking record must have at least a candidate_id (from ATS) or a user_id (ampOS user).';
