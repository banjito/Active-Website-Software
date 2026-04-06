-- ============================================================================
-- Employee Documents Table Migration
-- ============================================================================
-- This script creates the employee_documents table for storing employee files
-- in the HR Employee Files section. Supports document storage with folders,
-- tags, categories, and version tracking.
-- Run this in the Supabase SQL Editor
-- ============================================================================

-- Create the employee_documents table in the common schema
CREATE TABLE IF NOT EXISTS common.employee_documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    employee_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    category VARCHAR(100) DEFAULT 'general', -- e.g., 'contracts', 'certifications', 'performance', 'hr', 'payroll', 'general'
    file_path TEXT NOT NULL,
    file_url TEXT NOT NULL,
    file_type VARCHAR(50),
    file_size BIGINT NOT NULL,
    folder_id UUID, -- For folder organization (self-referencing)
    tags TEXT[] DEFAULT '{}',
    
    -- Version/Expiration Tracking
    version INTEGER DEFAULT 1,
    expiration_date DATE,
    
    -- Metadata
    uploaded_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    archived BOOLEAN DEFAULT FALSE
);

-- Create employee_document_folders table for organizing documents
CREATE TABLE IF NOT EXISTS common.employee_document_folders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    employee_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    parent_folder_id UUID REFERENCES common.employee_document_folders(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(employee_id, name, parent_folder_id)
);

-- Add foreign key for folder_id in employee_documents
-- Drop constraint if it exists first to avoid errors on re-run
ALTER TABLE common.employee_documents 
DROP CONSTRAINT IF EXISTS fk_employee_documents_folder;

ALTER TABLE common.employee_documents 
ADD CONSTRAINT fk_employee_documents_folder 
FOREIGN KEY (folder_id) REFERENCES common.employee_document_folders(id) ON DELETE SET NULL;

-- Add comments for documentation
COMMENT ON TABLE common.employee_documents IS 'Stores employee documents and files for HR Employee Files section';
COMMENT ON COLUMN common.employee_documents.category IS 'Document category: contracts, certifications, performance, hr, payroll, general, etc.';
COMMENT ON COLUMN common.employee_documents.expiration_date IS 'Optional expiration date for documents that expire (certifications, licenses, etc.)';

-- Create indexes for common queries
CREATE INDEX IF NOT EXISTS idx_employee_documents_employee_id ON common.employee_documents(employee_id);
CREATE INDEX IF NOT EXISTS idx_employee_documents_category ON common.employee_documents(category);
CREATE INDEX IF NOT EXISTS idx_employee_documents_folder_id ON common.employee_documents(folder_id);
CREATE INDEX IF NOT EXISTS idx_employee_documents_uploaded_by ON common.employee_documents(uploaded_by);
CREATE INDEX IF NOT EXISTS idx_employee_documents_created_at ON common.employee_documents(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_employee_documents_expiration_date ON common.employee_documents(expiration_date);
CREATE INDEX IF NOT EXISTS idx_employee_documents_archived ON common.employee_documents(archived);
CREATE INDEX IF NOT EXISTS idx_employee_documents_tags ON common.employee_documents USING GIN(tags);

CREATE INDEX IF NOT EXISTS idx_employee_document_folders_employee_id ON common.employee_document_folders(employee_id);
CREATE INDEX IF NOT EXISTS idx_employee_document_folders_parent ON common.employee_document_folders(parent_folder_id);

-- Enable Row Level Security
ALTER TABLE common.employee_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE common.employee_document_folders ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist (to allow re-running the script)
DROP POLICY IF EXISTS "Authenticated users can view employee documents" ON common.employee_documents;
DROP POLICY IF EXISTS "Authenticated users can create employee documents" ON common.employee_documents;
DROP POLICY IF EXISTS "Users can update employee documents" ON common.employee_documents;
DROP POLICY IF EXISTS "Users can delete employee documents" ON common.employee_documents;
DROP POLICY IF EXISTS "Authenticated users can view employee document folders" ON common.employee_document_folders;
DROP POLICY IF EXISTS "Authenticated users can create employee document folders" ON common.employee_document_folders;
DROP POLICY IF EXISTS "Authenticated users can update employee document folders" ON common.employee_document_folders;
DROP POLICY IF EXISTS "Authenticated users can delete employee document folders" ON common.employee_document_folders;

-- Policy: Authenticated users can view employee documents (HR staff)
CREATE POLICY "Authenticated users can view employee documents" ON common.employee_documents
    FOR SELECT
    USING (auth.uid() IS NOT NULL);

-- Policy: Authenticated users can create documents (HR staff)
CREATE POLICY "Authenticated users can create employee documents" ON common.employee_documents
    FOR INSERT
    WITH CHECK (auth.uid() IS NOT NULL);

-- Policy: Users can update documents they uploaded, or admins can update any
CREATE POLICY "Users can update employee documents" ON common.employee_documents
    FOR UPDATE
    USING (
        auth.uid() = uploaded_by OR 
        EXISTS (
            SELECT 1 FROM common.profiles 
            WHERE id = auth.uid() 
            AND (role = 'Admin' OR role = 'Super Admin' OR role = 'HR')
        )
    );

-- Policy: Users can delete documents they uploaded, or admins can delete any
CREATE POLICY "Users can delete employee documents" ON common.employee_documents
    FOR DELETE
    USING (
        auth.uid() = uploaded_by OR 
        EXISTS (
            SELECT 1 FROM common.profiles 
            WHERE id = auth.uid() 
            AND (role = 'Admin' OR role = 'Super Admin' OR role = 'HR')
        )
    );

-- Policies for folders
CREATE POLICY "Authenticated users can view employee document folders" ON common.employee_document_folders
    FOR SELECT
    USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can create employee document folders" ON common.employee_document_folders
    FOR INSERT
    WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can update employee document folders" ON common.employee_document_folders
    FOR UPDATE
    USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can delete employee document folders" ON common.employee_document_folders
    FOR DELETE
    USING (auth.uid() IS NOT NULL);

-- Create a function to update the updated_at timestamp
CREATE OR REPLACE FUNCTION common.update_employee_documents_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION common.update_employee_document_folders_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create triggers to automatically update updated_at
DROP TRIGGER IF EXISTS employee_documents_updated_at ON common.employee_documents;
CREATE TRIGGER employee_documents_updated_at
    BEFORE UPDATE ON common.employee_documents
    FOR EACH ROW
    EXECUTE FUNCTION common.update_employee_documents_updated_at();

DROP TRIGGER IF EXISTS employee_document_folders_updated_at ON common.employee_document_folders;
CREATE TRIGGER employee_document_folders_updated_at
    BEFORE UPDATE ON common.employee_document_folders
    FOR EACH ROW
    EXECUTE FUNCTION common.update_employee_document_folders_updated_at();

-- Grant permissions
GRANT SELECT ON common.employee_documents TO authenticated;
GRANT INSERT, UPDATE, DELETE ON common.employee_documents TO authenticated;
GRANT SELECT ON common.employee_document_folders TO authenticated;
GRANT INSERT, UPDATE, DELETE ON common.employee_document_folders TO authenticated;

-- ============================================================================
-- Verification Query
-- ============================================================================
-- Run this to verify the table was created correctly:
-- SELECT column_name, data_type, is_nullable 
-- FROM information_schema.columns 
-- WHERE table_schema = 'common' AND table_name = 'employee_documents'
-- ORDER BY ordinal_position;
