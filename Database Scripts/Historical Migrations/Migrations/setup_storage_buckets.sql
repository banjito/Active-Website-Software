-- Setup Storage Buckets for Document Management
-- This script sets up all necessary Supabase storage buckets with proper policies
-- Run this in your Supabase SQL editor

-- ============================================================================
-- 1. CREATE STORAGE BUCKETS
-- ============================================================================

-- Create job-documents bucket (if it doesn't exist)
-- Used for: Subcontractor agreements, contracts, job-related documents
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'job-documents',
  'job-documents', 
  true,
  52428800, -- 50MB limit
  ARRAY[
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'image/jpeg',
    'image/png',
    'image/gif',
    'text/plain'
  ]::text[]
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Create one-line-drawings bucket
-- Used for: Electrical one-line drawings, schematics, technical drawings
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'one-line-drawings',
  'one-line-drawings',
  true,
  104857600, -- 100MB limit for large drawings
  ARRAY[
    'application/pdf',
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/tiff',
    'image/bmp',
    'application/vnd.ms-visio',
    'application/x-autocad',
    'image/vnd.dwg',
    'image/vnd.dxf'
  ]::text[]
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Create documents bucket (general documents)
-- Used for: General company documents, manuals, forms, reports
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'documents',
  'documents',
  false, -- Private bucket for general documents
  52428800, -- 50MB limit
  ARRAY[
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'image/jpeg',
    'image/png',
    'image/gif',
    'text/plain',
    'text/csv'
  ]::text[]
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Create user-uploads bucket (for profile pictures, etc.)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'user-uploads',
  'user-uploads',
  true,
  10485760, -- 10MB limit
  ARRAY[
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/webp'
  ]::text[]
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- ============================================================================
-- 2. SET UP STORAGE POLICIES
-- ============================================================================

-- Drop existing policies to avoid conflicts
DROP POLICY IF EXISTS "job_documents_select" ON storage.objects;
DROP POLICY IF EXISTS "job_documents_insert" ON storage.objects;
DROP POLICY IF EXISTS "job_documents_update" ON storage.objects;
DROP POLICY IF EXISTS "job_documents_delete" ON storage.objects;

DROP POLICY IF EXISTS "one_line_drawings_select" ON storage.objects;
DROP POLICY IF EXISTS "one_line_drawings_insert" ON storage.objects;
DROP POLICY IF EXISTS "one_line_drawings_update" ON storage.objects;
DROP POLICY IF EXISTS "one_line_drawings_delete" ON storage.objects;

DROP POLICY IF EXISTS "documents_select" ON storage.objects;
DROP POLICY IF EXISTS "documents_insert" ON storage.objects;
DROP POLICY IF EXISTS "documents_update" ON storage.objects;
DROP POLICY IF EXISTS "documents_delete" ON storage.objects;

DROP POLICY IF EXISTS "user_uploads_select" ON storage.objects;
DROP POLICY IF EXISTS "user_uploads_insert" ON storage.objects;
DROP POLICY IF EXISTS "user_uploads_update" ON storage.objects;
DROP POLICY IF EXISTS "user_uploads_delete" ON storage.objects;

-- ============================================================================
-- JOB-DOCUMENTS BUCKET POLICIES
-- ============================================================================

-- Allow authenticated users to view job documents
CREATE POLICY "job_documents_select" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'job-documents' AND 
    auth.role() = 'authenticated'
  );

-- Allow authenticated users to upload job documents
CREATE POLICY "job_documents_insert" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'job-documents' AND 
    auth.role() = 'authenticated'
  );

-- Allow users to update their own uploaded job documents
CREATE POLICY "job_documents_update" ON storage.objects
  FOR UPDATE USING (
    bucket_id = 'job-documents' AND 
    auth.uid() = owner
  );

-- Allow users to delete their own uploaded job documents
CREATE POLICY "job_documents_delete" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'job-documents' AND 
    auth.uid() = owner
  );

-- ============================================================================
-- ONE-LINE-DRAWINGS BUCKET POLICIES
-- ============================================================================

-- Allow authenticated users to view one-line drawings
CREATE POLICY "one_line_drawings_select" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'one-line-drawings' AND 
    auth.role() = 'authenticated'
  );

-- Allow authenticated users to upload one-line drawings
CREATE POLICY "one_line_drawings_insert" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'one-line-drawings' AND 
    auth.role() = 'authenticated'
  );

-- Allow users to update their own uploaded one-line drawings
CREATE POLICY "one_line_drawings_update" ON storage.objects
  FOR UPDATE USING (
    bucket_id = 'one-line-drawings' AND 
    auth.uid() = owner
  );

-- Allow users to delete their own uploaded one-line drawings
CREATE POLICY "one_line_drawings_delete" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'one-line-drawings' AND 
    auth.uid() = owner
  );

-- ============================================================================
-- DOCUMENTS BUCKET POLICIES (Private bucket)
-- ============================================================================

-- Allow authenticated users to view documents
CREATE POLICY "documents_select" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'documents' AND 
    auth.role() = 'authenticated'
  );

-- Allow authenticated users to upload documents
CREATE POLICY "documents_insert" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'documents' AND 
    auth.role() = 'authenticated'
  );

-- Allow users to update their own uploaded documents
CREATE POLICY "documents_update" ON storage.objects
  FOR UPDATE USING (
    bucket_id = 'documents' AND 
    auth.uid() = owner
  );

-- Allow users to delete their own uploaded documents
CREATE POLICY "documents_delete" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'documents' AND 
    auth.uid() = owner
  );

-- ============================================================================
-- USER-UPLOADS BUCKET POLICIES
-- ============================================================================

-- Allow authenticated users to view user uploads (profile pictures, etc.)
CREATE POLICY "user_uploads_select" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'user-uploads' AND 
    auth.role() = 'authenticated'
  );

-- Allow authenticated users to upload user files
CREATE POLICY "user_uploads_insert" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'user-uploads' AND 
    auth.role() = 'authenticated'
  );

-- Allow users to update their own uploaded files
CREATE POLICY "user_uploads_update" ON storage.objects
  FOR UPDATE USING (
    bucket_id = 'user-uploads' AND 
    auth.uid() = owner
  );

-- Allow users to delete their own uploaded files
CREATE POLICY "user_uploads_delete" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'user-uploads' AND 
    auth.uid() = owner
  );

-- ============================================================================
-- 3. CREATE ONE-LINE DRAWINGS TABLE
-- ============================================================================

-- Create one_line_drawings table to track drawing metadata
CREATE TABLE IF NOT EXISTS neta_ops.one_line_drawings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  job_id UUID REFERENCES neta_ops.jobs(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id),
  name TEXT NOT NULL,
  description TEXT,
  file_url TEXT NOT NULL,
  file_path TEXT NOT NULL,
  file_type TEXT,
  file_size INTEGER,
  version TEXT DEFAULT '1.0',
  is_current BOOLEAN DEFAULT true,
  upload_date TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for faster lookups
CREATE INDEX IF NOT EXISTS idx_one_line_drawings_job_id ON neta_ops.one_line_drawings(job_id);
CREATE INDEX IF NOT EXISTS idx_one_line_drawings_user_id ON neta_ops.one_line_drawings(user_id);
CREATE INDEX IF NOT EXISTS idx_one_line_drawings_current ON neta_ops.one_line_drawings(is_current);

-- Enable RLS
ALTER TABLE neta_ops.one_line_drawings ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Enable read access for authenticated users" ON neta_ops.one_line_drawings;
DROP POLICY IF EXISTS "Enable insert access for authenticated users" ON neta_ops.one_line_drawings;
DROP POLICY IF EXISTS "Enable update access for authenticated users" ON neta_ops.one_line_drawings;
DROP POLICY IF EXISTS "Enable delete access for authenticated users" ON neta_ops.one_line_drawings;

-- Create RLS policies for one_line_drawings
CREATE POLICY "Enable read access for authenticated users" ON neta_ops.one_line_drawings
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Enable insert access for authenticated users" ON neta_ops.one_line_drawings
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Enable update access for authenticated users" ON neta_ops.one_line_drawings
  FOR UPDATE USING (auth.role() = 'authenticated');

CREATE POLICY "Enable delete access for authenticated users" ON neta_ops.one_line_drawings
  FOR DELETE USING (auth.role() = 'authenticated');

-- Grant permissions
GRANT ALL ON neta_ops.one_line_drawings TO authenticated;

-- ============================================================================
-- 6. CREATE JOB CONTRACTS TABLE
-- ============================================================================

-- Create job_contracts table to track contract metadata
CREATE TABLE IF NOT EXISTS neta_ops.job_contracts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  job_id UUID REFERENCES neta_ops.jobs(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id),
  name TEXT NOT NULL,
  type TEXT DEFAULT 'main' CHECK (type IN ('main', 'subcontract', 'amendment', 'change_order')),
  description TEXT,
  file_url TEXT NOT NULL,
  file_path TEXT NOT NULL,
  file_type TEXT,
  file_size INTEGER,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'signed', 'expired', 'cancelled')),
  value NUMERIC,
  start_date DATE,
  end_date DATE,
  uploaded_date TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for faster lookups
CREATE INDEX IF NOT EXISTS idx_job_contracts_job_id ON neta_ops.job_contracts(job_id);
CREATE INDEX IF NOT EXISTS idx_job_contracts_user_id ON neta_ops.job_contracts(user_id);
CREATE INDEX IF NOT EXISTS idx_job_contracts_status ON neta_ops.job_contracts(status);
CREATE INDEX IF NOT EXISTS idx_job_contracts_type ON neta_ops.job_contracts(type);

-- Enable RLS
ALTER TABLE neta_ops.job_contracts ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Enable read access for authenticated users" ON neta_ops.job_contracts;
DROP POLICY IF EXISTS "Enable insert access for authenticated users" ON neta_ops.job_contracts;
DROP POLICY IF EXISTS "Enable update access for authenticated users" ON neta_ops.job_contracts;
DROP POLICY IF EXISTS "Enable delete access for authenticated users" ON neta_ops.job_contracts;

-- Create RLS policies for job_contracts
CREATE POLICY "Enable read access for authenticated users" ON neta_ops.job_contracts
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Enable insert access for authenticated users" ON neta_ops.job_contracts
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Enable update access for authenticated users" ON neta_ops.job_contracts
  FOR UPDATE USING (auth.role() = 'authenticated');

CREATE POLICY "Enable delete access for authenticated users" ON neta_ops.job_contracts
  FOR DELETE USING (auth.role() = 'authenticated');

-- Grant permissions
GRANT ALL ON neta_ops.job_contracts TO authenticated;

-- ============================================================================
-- 4. CREATE UPDATED_AT TRIGGER
-- ============================================================================

-- Create or update trigger for updated_at on one_line_drawings
CREATE OR REPLACE FUNCTION neta_ops.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_one_line_drawings_updated_at ON neta_ops.one_line_drawings;

CREATE TRIGGER update_one_line_drawings_updated_at
BEFORE UPDATE ON neta_ops.one_line_drawings
FOR EACH ROW
EXECUTE FUNCTION neta_ops.update_updated_at_column();

-- Create trigger for job_contracts updated_at
DROP TRIGGER IF EXISTS update_job_contracts_updated_at ON neta_ops.job_contracts;

CREATE TRIGGER update_job_contracts_updated_at
BEFORE UPDATE ON neta_ops.job_contracts
FOR EACH ROW
EXECUTE FUNCTION neta_ops.update_updated_at_column();

-- ============================================================================
-- 5. VERIFICATION QUERIES
-- ============================================================================

-- Verify buckets were created
SELECT id, name, public, file_size_limit, allowed_mime_types 
FROM storage.buckets 
WHERE id IN ('job-documents', 'one-line-drawings', 'documents', 'user-uploads');

-- Verify policies were created
SELECT policyname, cmd, roles, qual 
FROM pg_policies 
WHERE tablename = 'objects' AND schemaname = 'storage'
AND policyname LIKE '%job_documents%' 
   OR policyname LIKE '%one_line_drawings%' 
   OR policyname LIKE '%documents%' 
   OR policyname LIKE '%user_uploads%';

-- Verify tables were created
SELECT table_name, column_name, data_type 
FROM information_schema.columns 
WHERE table_schema = 'neta_ops' AND table_name IN ('one_line_drawings', 'job_contracts')
ORDER BY table_name, ordinal_position;

-- Show success message
SELECT 'Storage buckets, one-line drawings, and job contracts tables setup completed successfully!' as status;
