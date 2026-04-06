-- Add custom_fields to onboarding_e_sign_forms so attached documents (PDFs) are stored.
-- Run in Supabase SQL editor if Document Acknowledgment uploads show no attachment.

ALTER TABLE common.onboarding_e_sign_forms
  ADD COLUMN IF NOT EXISTS custom_fields JSONB DEFAULT '{}';

COMMENT ON COLUMN common.onboarding_e_sign_forms.custom_fields IS 'Stores attached_documents (e.g. PDFs) for compliance and e-sign forms';
