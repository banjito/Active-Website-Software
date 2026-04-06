-- Allow onboarding tracking to assign ampOS users (not only candidates from offers).
-- A record is either: (candidate_id + offer_id) from recruiting, OR (user_id) for an assigned user.

-- Add user_id; keep candidate_id and offer_id for existing candidate-based records
ALTER TABLE common.onboarding_tracking
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

-- Allow NULL for candidate/offer so we can have user-only records
ALTER TABLE common.onboarding_tracking
  ALTER COLUMN candidate_id DROP NOT NULL,
  ALTER COLUMN offer_id DROP NOT NULL;

-- Ensure exactly one mode: either candidate+offer OR user
ALTER TABLE common.onboarding_tracking
  DROP CONSTRAINT IF EXISTS onboarding_tracking_person_check;

ALTER TABLE common.onboarding_tracking
  ADD CONSTRAINT onboarding_tracking_person_check CHECK (
    (candidate_id IS NOT NULL AND offer_id IS NOT NULL) OR (user_id IS NOT NULL)
  );

-- Drop the table UNIQUE(offer_id) so we can have multiple rows with NULL offer_id (user-assigned records)
ALTER TABLE common.onboarding_tracking DROP CONSTRAINT IF EXISTS onboarding_tracking_offer_id_key;
-- Recreate unique only on non-null offer_id so one offer = one tracking record
CREATE UNIQUE INDEX IF NOT EXISTS idx_onboarding_tracking_offer_id_unique
  ON common.onboarding_tracking (offer_id) WHERE offer_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_onboarding_tracking_user_id ON common.onboarding_tracking(user_id);

COMMENT ON COLUMN common.onboarding_tracking.user_id IS 'When set, this tracking record is for an assigned ampOS user; candidate_id and offer_id are null.';
