-- Assign E-Sign forms to onboarding tracking (many-to-many). Employees see assigned forms in Your Onboarding and sign them.

CREATE TABLE IF NOT EXISTS common.onboarding_tracking_forms (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tracking_id UUID NOT NULL REFERENCES common.onboarding_tracking(id) ON DELETE CASCADE,
    form_id UUID NOT NULL REFERENCES common.onboarding_e_sign_forms(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(tracking_id, form_id)
);

CREATE INDEX IF NOT EXISTS idx_onboarding_tracking_forms_tracking_id ON common.onboarding_tracking_forms(tracking_id);
CREATE INDEX IF NOT EXISTS idx_onboarding_tracking_forms_form_id ON common.onboarding_tracking_forms(form_id);

ALTER TABLE common.onboarding_tracking_forms DISABLE ROW LEVEL SECURITY;
GRANT ALL ON common.onboarding_tracking_forms TO authenticated;
GRANT ALL ON common.onboarding_tracking_forms TO anon;

COMMENT ON TABLE common.onboarding_tracking_forms IS 'E-Sign forms assigned to onboarding tracking; employee signs them in Your Onboarding';
