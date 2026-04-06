-- Add custom_fields column to onboarding_e_sign_forms table
-- This allows storing attached documents and other custom data

ALTER TABLE common.onboarding_e_sign_forms 
ADD COLUMN IF NOT EXISTS custom_fields JSONB DEFAULT '{}';

-- Add comment
COMMENT ON COLUMN common.onboarding_e_sign_forms.custom_fields IS 'Custom fields for storing attached documents and other metadata';
