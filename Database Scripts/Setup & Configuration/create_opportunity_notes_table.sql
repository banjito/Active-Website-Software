-- Create opportunity_notes table for timestamped notes on opportunities
-- Chat-style notes in opportunity details: who wrote and when

CREATE TABLE IF NOT EXISTS business.opportunity_notes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    opportunity_id UUID NOT NULL REFERENCES business.opportunities(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id),
    content TEXT NOT NULL,
    attachment_url TEXT,
    attachment_name TEXT,
    attachment_type TEXT,
    attachment_size INTEGER,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    edited BOOLEAN DEFAULT FALSE,
    deleted_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX IF NOT EXISTS idx_opportunity_notes_opportunity_id ON business.opportunity_notes(opportunity_id);
CREATE INDEX IF NOT EXISTS idx_opportunity_notes_user_id ON business.opportunity_notes(user_id);
CREATE INDEX IF NOT EXISTS idx_opportunity_notes_created_at ON business.opportunity_notes(created_at DESC);

ALTER TABLE business.opportunity_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view opportunity notes" ON business.opportunity_notes
    FOR SELECT USING (auth.uid() IS NOT NULL AND deleted_at IS NULL);

CREATE POLICY "Users can create opportunity notes" ON business.opportunity_notes
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own opportunity notes" ON business.opportunity_notes
    FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own opportunity notes" ON business.opportunity_notes
    FOR DELETE USING (auth.uid() = user_id);

GRANT ALL ON business.opportunity_notes TO authenticated;
GRANT ALL ON business.opportunity_notes TO service_role;

CREATE OR REPLACE FUNCTION business.update_opportunity_note_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    NEW.edited = TRUE;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS opportunity_notes_updated_at ON business.opportunity_notes;
CREATE TRIGGER opportunity_notes_updated_at
    BEFORE UPDATE ON business.opportunity_notes
    FOR EACH ROW
    EXECUTE FUNCTION business.update_opportunity_note_updated_at();

COMMENT ON TABLE business.opportunity_notes IS 'Timestamped notes on opportunities - chat-style with author and time';
