-- Assign checklists to onboarding tracking (many-to-many). Employees see assigned checklists in Your Onboarding and complete items.

CREATE TABLE IF NOT EXISTS common.onboarding_tracking_checklists (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tracking_id UUID NOT NULL REFERENCES common.onboarding_tracking(id) ON DELETE CASCADE,
    checklist_id UUID NOT NULL REFERENCES common.onboarding_checklists(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(tracking_id, checklist_id)
);

CREATE INDEX IF NOT EXISTS idx_onboarding_tracking_checklists_tracking_id ON common.onboarding_tracking_checklists(tracking_id);
CREATE INDEX IF NOT EXISTS idx_onboarding_tracking_checklists_checklist_id ON common.onboarding_tracking_checklists(checklist_id);

ALTER TABLE common.onboarding_tracking_checklists DISABLE ROW LEVEL SECURITY;
GRANT ALL ON common.onboarding_tracking_checklists TO authenticated;
GRANT ALL ON common.onboarding_tracking_checklists TO anon;

COMMENT ON TABLE common.onboarding_tracking_checklists IS 'Checklists assigned to onboarding tracking; employee completes them in Your Onboarding';
