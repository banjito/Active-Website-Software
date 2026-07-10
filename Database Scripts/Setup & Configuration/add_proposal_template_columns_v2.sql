-- Proposal Template — expanded editing (v2)
-- Adds admin-editable header/footer sections, an editable NETA-standard option
-- list, and free-form custom sections placed at fixed anchors in the generated
-- letter. NULL / empty on every column means "use the built-in default", so an
-- un-migrated or never-edited row produces exactly the historical letter.

ALTER TABLE business.estimating_presets
    ADD COLUMN IF NOT EXISTS proposal_header_html TEXT,
    ADD COLUMN IF NOT EXISTS proposal_footer_html TEXT,
    ADD COLUMN IF NOT EXISTS proposal_neta_options JSONB,
    ADD COLUMN IF NOT EXISTS proposal_custom_sections JSONB;

COMMENT ON COLUMN business.estimating_presets.proposal_header_html IS 'Proposal letter: top block (letter number, date, customer name/company/address). NULL = built-in default.';
COMMENT ON COLUMN business.estimating_presets.proposal_footer_html IS 'Proposal letter: footer line that follows the main body (address/phone). NULL = built-in default.';
COMMENT ON COLUMN business.estimating_presets.proposal_neta_options IS 'Proposal letter: editable list of {{netaStandardText}} choices. JSON array of {value,label,text}. NULL = built-in defaults.';
COMMENT ON COLUMN business.estimating_presets.proposal_custom_sections IS 'Proposal letter: admin-added sections. JSON array of {id,label,html,anchor,order}. NULL = none.';
