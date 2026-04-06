-- Onboarding tracking: one row per candidate sent to onboarding from an accepted offer.
-- Links recruiting (candidate + offer) to onboarding (new_hire_packet).

CREATE TABLE IF NOT EXISTS common.onboarding_tracking (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    candidate_id UUID NOT NULL REFERENCES common.candidates(id) ON DELETE CASCADE,
    offer_id UUID NOT NULL REFERENCES common.offers(id) ON DELETE CASCADE,
    new_hire_packet_id UUID REFERENCES common.new_hire_packets(id) ON DELETE SET NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed')),
    created_by UUID NOT NULL REFERENCES auth.users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(offer_id)
);

CREATE INDEX IF NOT EXISTS idx_onboarding_tracking_candidate_id ON common.onboarding_tracking(candidate_id);
CREATE INDEX IF NOT EXISTS idx_onboarding_tracking_offer_id ON common.onboarding_tracking(offer_id);
CREATE INDEX IF NOT EXISTS idx_onboarding_tracking_status ON common.onboarding_tracking(status);

ALTER TABLE common.onboarding_tracking DISABLE ROW LEVEL SECURITY;
GRANT ALL ON common.onboarding_tracking TO authenticated;
GRANT ALL ON common.onboarding_tracking TO anon;

COMMENT ON TABLE common.onboarding_tracking IS 'Tracks candidates sent to onboarding from accepted offers; one record per offer';

DROP TRIGGER IF EXISTS update_onboarding_tracking_updated_at ON common.onboarding_tracking;
CREATE TRIGGER update_onboarding_tracking_updated_at
    BEFORE UPDATE ON common.onboarding_tracking
    FOR EACH ROW
    EXECUTE FUNCTION common.update_updated_at_column();
