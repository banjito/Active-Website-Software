-- Proposal Template — branding & images
-- Adds a single JSON column holding the adjustable branding pieces of the
-- generated proposal letter: the logo + banner text above the letter, the logo
-- + title above the safety policy, and the signer's signature image. Storing
-- them together keeps the migration small; each field falls back to a built-in
-- default when missing, so an un-migrated or never-edited row produces exactly
-- the historical letter.
--
-- Shape (see resolveProposalBranding in
-- src/components/estimates/proposalTemplateDefaults.ts):
--   {
--     "letterLogoUrl":    string,  -- logo above the letter (path or data URL)
--     "letterBannerText": string,  -- company text next to the letter logo
--     "safetyLogoUrl":    string,  -- logo above the safety policy page
--     "safetyTitle":      string,  -- heading text on the safety policy page
--     "signatureImage":   string   -- signer's signature image (path or data URL)
--   }

ALTER TABLE business.estimating_presets
    ADD COLUMN IF NOT EXISTS proposal_branding JSONB;

COMMENT ON COLUMN business.estimating_presets.proposal_branding IS 'Proposal letter branding: {letterLogoUrl, letterBannerText, safetyLogoUrl, safetyTitle, signatureImage}. Missing fields fall back to built-in defaults.';
