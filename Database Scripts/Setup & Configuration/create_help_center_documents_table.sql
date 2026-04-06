-- ============================================================================
-- Help Center Documents Table Migration
-- ============================================================================
-- This script creates the help_center_documents table for storing PDF documents
-- in the Help Center. This allows uploading existing SOPs without recreating them.
-- Run this in the Supabase SQL Editor
-- ============================================================================

-- Create the help_center_documents table in the common schema
CREATE TABLE IF NOT EXISTS common.help_center_documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    category VARCHAR(50) NOT NULL DEFAULT 'general',
    file_path TEXT NOT NULL,
    file_url TEXT NOT NULL,
    file_size BIGINT NOT NULL,
    file_type VARCHAR(50) DEFAULT 'application/pdf',
    created_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    view_count INTEGER DEFAULT 0
);

-- Add comments for documentation
COMMENT ON TABLE common.help_center_documents IS 'Stores PDF documents uploaded to the Help Center';
COMMENT ON COLUMN common.help_center_documents.category IS 'Portal category: operations, sales, office-admin, engineering, hr, lab, field-tech, general';
COMMENT ON COLUMN common.help_center_documents.file_path IS 'Storage path to the PDF file';
COMMENT ON COLUMN common.help_center_documents.file_url IS 'Public URL to access the PDF file';

-- Create indexes for common queries
CREATE INDEX IF NOT EXISTS idx_help_center_documents_category ON common.help_center_documents(category);
CREATE INDEX IF NOT EXISTS idx_help_center_documents_created_by ON common.help_center_documents(created_by);
CREATE INDEX IF NOT EXISTS idx_help_center_documents_created_at ON common.help_center_documents(created_at DESC);

-- Enable Row Level Security
ALTER TABLE common.help_center_documents ENABLE ROW LEVEL SECURITY;

-- Policy: All authenticated users can view documents
CREATE POLICY "Anyone can view help center documents" ON common.help_center_documents
    FOR SELECT
    USING (auth.uid() IS NOT NULL);

-- Policy: Authenticated users can create documents (admins only in practice)
CREATE POLICY "Authenticated users can create documents" ON common.help_center_documents
    FOR INSERT
    WITH CHECK (auth.uid() IS NOT NULL);

-- Policy: Users can update their own documents, admins can update any
CREATE POLICY "Users can update own documents" ON common.help_center_documents
    FOR UPDATE
    USING (auth.uid() = created_by OR EXISTS (
        SELECT 1 FROM common.profiles 
        WHERE id = auth.uid() 
        AND (role = 'Admin' OR role = 'Super Admin')
    ));

-- Policy: Users can delete their own documents, admins can delete any
CREATE POLICY "Users can delete own documents" ON common.help_center_documents
    FOR DELETE
    USING (auth.uid() = created_by OR EXISTS (
        SELECT 1 FROM common.profiles 
        WHERE id = auth.uid() 
        AND (role = 'Admin' OR role = 'Super Admin')
    ));

-- Create a function to update the updated_at timestamp
CREATE OR REPLACE FUNCTION common.update_help_center_documents_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to automatically update updated_at
DROP TRIGGER IF EXISTS help_center_documents_updated_at ON common.help_center_documents;
CREATE TRIGGER help_center_documents_updated_at
    BEFORE UPDATE ON common.help_center_documents
    FOR EACH ROW
    EXECUTE FUNCTION common.update_help_center_documents_updated_at();

-- Grant permissions
GRANT SELECT ON common.help_center_documents TO authenticated;
GRANT INSERT, UPDATE, DELETE ON common.help_center_documents TO authenticated;

-- ============================================================================
-- Verification Query
-- ============================================================================
-- Run this to verify the table was created correctly:
-- SELECT column_name, data_type, is_nullable 
-- FROM information_schema.columns 
-- WHERE table_schema = 'common' AND table_name = 'help_center_documents';
