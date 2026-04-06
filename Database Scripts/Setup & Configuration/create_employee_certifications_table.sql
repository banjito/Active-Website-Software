-- ============================================================================
-- Employee Certifications/Licenses Table Migration
-- ============================================================================
-- This script creates the employee_certifications table for tracking employee
-- certifications, licenses, and renewals (similar to field equipment tracking)
-- Run this in the Supabase SQL Editor
-- ============================================================================

-- Create the employee_certifications table in the common schema
CREATE TABLE IF NOT EXISTS common.employee_certifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    employee_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    
    -- Certification Details
    cert_name VARCHAR(255) NOT NULL,
    cert_type VARCHAR(100) NOT NULL, -- e.g., 'license', 'certification', 'training', 'clearance', 'other'
    cert_category VARCHAR(100), -- Tab/category for organization (e.g., 'professional', 'safety', 'technical', 'compliance')
    cert_number VARCHAR(255), -- Certificate/license number
    issuing_organization VARCHAR(255), -- Who issued the cert
    
    -- Dates
    cert_date DATE NOT NULL, -- Date certification was obtained
    expiration_date DATE, -- When it expires (if applicable)
    renewal_date DATE, -- Next renewal date
    renewal_required BOOLEAN DEFAULT TRUE, -- Whether this cert requires renewal
    
    -- Status
    status VARCHAR(50) DEFAULT 'active' CHECK (status IN ('active', 'expired', 'pending_renewal', 'revoked', 'inactive')),
    
    -- Document Link
    document_id UUID REFERENCES common.employee_documents(id) ON DELETE SET NULL, -- Link to uploaded cert document
    
    -- Notes
    notes TEXT,
    
    -- Metadata
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add comments for documentation
COMMENT ON TABLE common.employee_certifications IS 'Stores employee certifications, licenses, and renewal tracking';
COMMENT ON COLUMN common.employee_certifications.cert_name IS 'Name of the certification/license';
COMMENT ON COLUMN common.employee_certifications.cert_type IS 'Type: license, certification, training, clearance, other';
COMMENT ON COLUMN common.employee_certifications.cert_category IS 'Category/tab for organization (professional, safety, technical, compliance, etc.)';
COMMENT ON COLUMN common.employee_certifications.cert_date IS 'Date when certification was obtained';
COMMENT ON COLUMN common.employee_certifications.expiration_date IS 'Date when certification expires';
COMMENT ON COLUMN common.employee_certifications.renewal_date IS 'Next renewal date';
COMMENT ON COLUMN common.employee_certifications.document_id IS 'Link to uploaded certificate document in employee_documents table';

-- Create indexes for common queries
CREATE INDEX IF NOT EXISTS idx_employee_certifications_employee_id ON common.employee_certifications(employee_id);
CREATE INDEX IF NOT EXISTS idx_employee_certifications_cert_type ON common.employee_certifications(cert_type);
CREATE INDEX IF NOT EXISTS idx_employee_certifications_cert_category ON common.employee_certifications(cert_category);
CREATE INDEX IF NOT EXISTS idx_employee_certifications_status ON common.employee_certifications(status);
CREATE INDEX IF NOT EXISTS idx_employee_certifications_expiration_date ON common.employee_certifications(expiration_date);
CREATE INDEX IF NOT EXISTS idx_employee_certifications_renewal_date ON common.employee_certifications(renewal_date);
CREATE INDEX IF NOT EXISTS idx_employee_certifications_document_id ON common.employee_certifications(document_id);
CREATE INDEX IF NOT EXISTS idx_employee_certifications_created_at ON common.employee_certifications(created_at DESC);

-- Enable Row Level Security
ALTER TABLE common.employee_certifications ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist (to allow re-running the script)
DROP POLICY IF EXISTS "Authenticated users can view employee certifications" ON common.employee_certifications;
DROP POLICY IF EXISTS "Authenticated users can create employee certifications" ON common.employee_certifications;
DROP POLICY IF EXISTS "Authenticated users can update employee certifications" ON common.employee_certifications;
DROP POLICY IF EXISTS "Authenticated users can delete employee certifications" ON common.employee_certifications;

-- Policy: Authenticated users can view employee certifications
CREATE POLICY "Authenticated users can view employee certifications" ON common.employee_certifications
    FOR SELECT
    USING (auth.uid() IS NOT NULL);

-- Policy: Authenticated users can create certifications
CREATE POLICY "Authenticated users can create employee certifications" ON common.employee_certifications
    FOR INSERT
    WITH CHECK (auth.uid() IS NOT NULL);

-- Policy: Authenticated users can update certifications
CREATE POLICY "Authenticated users can update employee certifications" ON common.employee_certifications
    FOR UPDATE
    USING (auth.uid() IS NOT NULL);

-- Policy: Authenticated users can delete certifications
CREATE POLICY "Authenticated users can delete employee certifications" ON common.employee_certifications
    FOR DELETE
    USING (auth.uid() IS NOT NULL);

-- Create a function to update the updated_at timestamp
CREATE OR REPLACE FUNCTION common.update_employee_certifications_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to automatically update updated_at
DROP TRIGGER IF EXISTS employee_certifications_updated_at ON common.employee_certifications;
CREATE TRIGGER employee_certifications_updated_at
    BEFORE UPDATE ON common.employee_certifications
    FOR EACH ROW
    EXECUTE FUNCTION common.update_employee_certifications_updated_at();

-- Grant permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON common.employee_certifications TO authenticated;

-- ============================================================================
-- Verification Query
-- ============================================================================
-- Run this to verify the table was created correctly:
-- SELECT column_name, data_type, is_nullable 
-- FROM information_schema.columns 
-- WHERE table_schema = 'common' AND table_name = 'employee_certifications'
-- ORDER BY ordinal_position;
