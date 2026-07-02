ALTER TABLE business.estimating_presets
    ADD COLUMN IF NOT EXISTS proposal_intro_html TEXT,
    ADD COLUMN IF NOT EXISTS proposal_terms_html TEXT,
    ADD COLUMN IF NOT EXISTS proposal_conclusion_html TEXT,
    ADD COLUMN IF NOT EXISTS proposal_signature_html TEXT,
    ADD COLUMN IF NOT EXISTS proposal_safety_policy_html TEXT,
    ADD COLUMN IF NOT EXISTS proposal_signer_name TEXT,
    ADD COLUMN IF NOT EXISTS proposal_signer_title TEXT;

COMMENT ON COLUMN business.estimating_presets.proposal_intro_html IS 'Proposal letter: greeting + furnish-services sentence + NETA line. NULL = built-in default.';
COMMENT ON COLUMN business.estimating_presets.proposal_terms_html IS 'Proposal letter: payment-terms sentence + "This price is based upon the following" list. NULL = built-in default.';
COMMENT ON COLUMN business.estimating_presets.proposal_conclusion_html IS 'Proposal letter: Conclusion paragraph, PO email line, validity statement. NULL = built-in default.';
COMMENT ON COLUMN business.estimating_presets.proposal_signature_html IS 'Proposal letter: sign-off + signature image + signer name/title. NULL = built-in default.';
COMMENT ON COLUMN business.estimating_presets.proposal_safety_policy_html IS 'Proposal letter: Lockout/Tagout safety policy body. NULL = built-in default.';
COMMENT ON COLUMN business.estimating_presets.proposal_signer_name IS 'Proposal letter signer name. NULL = built-in default (Brian Rodgers).';
COMMENT ON COLUMN business.estimating_presets.proposal_signer_title IS 'Proposal letter signer title. NULL = built-in default (Chief Executive Officer).';
