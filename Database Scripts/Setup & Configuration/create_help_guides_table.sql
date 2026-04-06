-- ============================================================================
-- Help Center Guides Table Migration
-- ============================================================================
-- This script creates the help_guides table for storing help center documentation
-- Run this in the Supabase SQL Editor
-- ============================================================================

-- Create the help_guides table in the common schema
CREATE TABLE IF NOT EXISTS common.help_guides (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title VARCHAR(255) NOT NULL,
    description TEXT,
    category VARCHAR(50) NOT NULL DEFAULT 'general',
    tags TEXT[] DEFAULT '{}',
    content JSONB NOT NULL DEFAULT '{"blocks": [], "settings": {"showTableOfContents": true, "allowComments": false, "showLastUpdated": true}}',
    created_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    is_published BOOLEAN DEFAULT false,
    view_count INTEGER DEFAULT 0
);

-- Add comments for documentation
COMMENT ON TABLE common.help_guides IS 'Stores help center guides and documentation';
COMMENT ON COLUMN common.help_guides.category IS 'Portal category: operations, sales, office-admin, engineering, hr, lab, field-tech, general';
COMMENT ON COLUMN common.help_guides.content IS 'JSON structure containing blocks and settings for the guide content';

-- Create indexes for common queries
CREATE INDEX IF NOT EXISTS idx_help_guides_category ON common.help_guides(category);
CREATE INDEX IF NOT EXISTS idx_help_guides_is_published ON common.help_guides(is_published);
CREATE INDEX IF NOT EXISTS idx_help_guides_created_by ON common.help_guides(created_by);
CREATE INDEX IF NOT EXISTS idx_help_guides_tags ON common.help_guides USING GIN(tags);

-- Enable Row Level Security
ALTER TABLE common.help_guides ENABLE ROW LEVEL SECURITY;

-- Policy: All authenticated users can view published guides
CREATE POLICY "Anyone can view published guides" ON common.help_guides
    FOR SELECT
    USING (is_published = true OR auth.uid() = created_by);

-- Policy: Authenticated users can create guides
CREATE POLICY "Authenticated users can create guides" ON common.help_guides
    FOR INSERT
    WITH CHECK (auth.uid() IS NOT NULL);

-- Policy: Users can update their own guides, admins can update any
CREATE POLICY "Users can update own guides" ON common.help_guides
    FOR UPDATE
    USING (auth.uid() = created_by OR EXISTS (
        SELECT 1 FROM common.profiles 
        WHERE id = auth.uid() 
        AND (role = 'Admin' OR role = 'Super Admin')
    ));

-- Policy: Users can delete their own guides, admins can delete any
CREATE POLICY "Users can delete own guides" ON common.help_guides
    FOR DELETE
    USING (auth.uid() = created_by OR EXISTS (
        SELECT 1 FROM common.profiles 
        WHERE id = auth.uid() 
        AND (role = 'Admin' OR role = 'Super Admin')
    ));

-- Create a function to update the updated_at timestamp
CREATE OR REPLACE FUNCTION common.update_help_guides_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to automatically update updated_at
DROP TRIGGER IF EXISTS help_guides_updated_at ON common.help_guides;
CREATE TRIGGER help_guides_updated_at
    BEFORE UPDATE ON common.help_guides
    FOR EACH ROW
    EXECUTE FUNCTION common.update_help_guides_updated_at();

-- Grant permissions
GRANT SELECT ON common.help_guides TO authenticated;
GRANT INSERT, UPDATE, DELETE ON common.help_guides TO authenticated;

-- ============================================================================
-- Verification Query
-- ============================================================================
-- Run this to verify the table was created correctly:
-- SELECT column_name, data_type, is_nullable 
-- FROM information_schema.columns 
-- WHERE table_schema = 'common' AND table_name = 'help_guides';

