-- ===========================================================
-- PROPOSAL SCOPE NOTES TABLE
-- ===========================================================
-- Description: Stores pre-defined scope notes/clarifications
-- that can be added to letter proposals. These are reusable
-- templates for common scope clarifications (e.g., breaker
-- testing thresholds, equipment exclusions, etc.)
-- ===========================================================

-- Create the proposal_scope_notes table in the business schema
CREATE TABLE IF NOT EXISTS business.proposal_scope_notes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Note Content
    title TEXT NOT NULL,                                        -- Short descriptive title (e.g., "Breaker Testing Size Threshold")
    content TEXT NOT NULL,                                      -- The note text to insert into proposals
    category TEXT DEFAULT 'General',                            -- Category for grouping (e.g., "Circuit Breakers", "Transformers", "General")
    
    -- Status & Ordering
    is_active BOOLEAN DEFAULT true,                             -- Soft toggle to enable/disable without deleting
    sort_order INTEGER DEFAULT 0,                               -- For ordering in the selection list
    
    -- Metadata
    created_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_proposal_scope_notes_category 
    ON business.proposal_scope_notes(category);

CREATE INDEX IF NOT EXISTS idx_proposal_scope_notes_is_active 
    ON business.proposal_scope_notes(is_active);

CREATE INDEX IF NOT EXISTS idx_proposal_scope_notes_sort_order 
    ON business.proposal_scope_notes(sort_order);

-- Enable RLS
ALTER TABLE business.proposal_scope_notes ENABLE ROW LEVEL SECURITY;

-- Policy: Allow authenticated users to view active scope notes
CREATE POLICY "Anyone can view proposal scope notes"
    ON business.proposal_scope_notes
    FOR SELECT
    TO authenticated
    USING (true);

-- Policy: Allow authenticated users to insert scope notes
CREATE POLICY "Authenticated users can insert proposal scope notes"
    ON business.proposal_scope_notes
    FOR INSERT
    TO authenticated
    WITH CHECK (true);

-- Policy: Allow authenticated users to update scope notes
CREATE POLICY "Authenticated users can update proposal scope notes"
    ON business.proposal_scope_notes
    FOR UPDATE
    TO authenticated
    USING (true)
    WITH CHECK (true);

-- Policy: Allow authenticated users to delete scope notes
CREATE POLICY "Authenticated users can delete proposal scope notes"
    ON business.proposal_scope_notes
    FOR DELETE
    TO authenticated
    USING (true);

-- Create trigger to update the updated_at timestamp
CREATE OR REPLACE FUNCTION business.update_proposal_scope_notes_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_proposal_scope_notes_timestamp 
    ON business.proposal_scope_notes;
    
CREATE TRIGGER trigger_update_proposal_scope_notes_timestamp
    BEFORE UPDATE ON business.proposal_scope_notes
    FOR EACH ROW
    EXECUTE FUNCTION business.update_proposal_scope_notes_updated_at();

-- Grant necessary permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON business.proposal_scope_notes TO authenticated;

-- Add helpful comment to the table
COMMENT ON TABLE business.proposal_scope_notes IS 'Stores pre-defined scope notes/clarifications that can be added to letter proposals. Common examples include breaker testing thresholds, equipment exclusions, and other scope-specific clarifications.';

-- Comments on columns
COMMENT ON COLUMN business.proposal_scope_notes.title IS 'Short descriptive title for the scope note (shown in selection list)';
COMMENT ON COLUMN business.proposal_scope_notes.content IS 'The full note text that gets inserted into the letter proposal';
COMMENT ON COLUMN business.proposal_scope_notes.category IS 'Category for grouping related notes (e.g., Circuit Breakers, Transformers, General)';
COMMENT ON COLUMN business.proposal_scope_notes.is_active IS 'Whether this note is available for selection (soft delete)';
COMMENT ON COLUMN business.proposal_scope_notes.sort_order IS 'Display order in the selection list (lower numbers first)';

-- Insert some common default scope notes
INSERT INTO business.proposal_scope_notes (title, content, category, sort_order) VALUES
(
    'Breaker Testing Size Threshold',
    'Circuit breaker testing is required only for breakers rated 100A and above per project specifications.',
    'Circuit Breakers',
    1
),
(
    'Breaker Testing - Thermal Magnetic Only',
    'Testing of low voltage circuit breakers applies to thermal magnetic trip units only. Electronic trip units will be tested separately if required.',
    'Circuit Breakers',
    2
),
(
    'Transformer Oil Sampling',
    'Transformer oil sampling and analysis is included for liquid-filled transformers only. Dry-type transformers do not require oil sampling.',
    'Transformers',
    3
),
(
    'Arc Flash Labels',
    'Arc flash warning labels will be provided and installed on equipment where arc flash analysis has been performed.',
    'General',
    4
),
(
    'Medium Voltage Cable Testing',
    'Medium voltage cable testing includes VLF withstand testing. Tan Delta diagnostic testing is available as an add-on if requested.',
    'Cables',
    5
),
(
    'Protective Relay Testing',
    'Protective relay testing includes functional trip testing of all relay elements. Relay coordination settings will be verified against the provided coordination study.',
    'Relays',
    6
),
(
    'Ground Grid Testing',
    'Ground grid testing includes fall-of-potential ground resistance testing. Touch and step potential measurements are not included unless specifically requested.',
    'General',
    7
),
(
    'Infrared Thermography',
    'Infrared thermography scanning will be performed on energized equipment where accessible and safe to do so. Equipment must be under load at the time of scanning.',
    'General',
    8
);
