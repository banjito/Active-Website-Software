-- Setup Storage Bucket for Resume Uploads (Public Career Page)
-- This script sets up storage policies for candidate resumes with anonymous upload permissions
-- 
-- IMPORTANT: You may need to create the bucket via Supabase Dashboard first:
-- 1. Go to Supabase Dashboard → Storage
-- 2. Click "New bucket"
-- 3. Name: resumes
-- 4. Public: Yes (checked)
-- 5. File size limit: 10MB (10485760 bytes)
-- 6. Allowed MIME types: application/pdf, application/msword, application/vnd.openxmlformats-officedocument.wordprocessingml.document
--
-- Then run this script to set up the policies

-- ============================================================================
-- 1. CREATE RESUMES STORAGE BUCKET (Try this first, if it fails use Dashboard)
-- ============================================================================

-- Try to create the bucket (may require superuser permissions)
-- If this fails with permission error, create it via Supabase Dashboard instead
DO $$
BEGIN
  INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  VALUES (
    'resumes',
    'resumes', 
    true, -- Public bucket so resumes can be accessed
    10485760, -- 10MB limit (sufficient for resumes)
    ARRAY[
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ]::text[]
  )
  ON CONFLICT (id) DO UPDATE SET
    public = EXCLUDED.public,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Could not create bucket via SQL. Please create it via Supabase Dashboard first.';
END $$;

-- ============================================================================
-- 2. SET UP STORAGE POLICIES FOR ANONYMOUS UPLOADS
-- ============================================================================

-- Drop existing policies to avoid conflicts
DROP POLICY IF EXISTS "resumes_select" ON storage.objects;
DROP POLICY IF EXISTS "resumes_insert" ON storage.objects;
DROP POLICY IF EXISTS "resumes_update" ON storage.objects;
DROP POLICY IF EXISTS "resumes_delete" ON storage.objects;

-- Allow anyone (including anonymous users) to upload resumes
-- This is critical for the public career page to work
CREATE POLICY "resumes_insert"
ON storage.objects FOR INSERT
TO public
WITH CHECK (bucket_id = 'resumes');

-- Allow anyone to read resumes (for HR team to access)
CREATE POLICY "resumes_select"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'resumes');

-- Allow authenticated users to update resumes (for HR team)
CREATE POLICY "resumes_update"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'resumes')
WITH CHECK (bucket_id = 'resumes');

-- Allow authenticated users to delete resumes (for HR team)
CREATE POLICY "resumes_delete"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'resumes');

-- ============================================================================
-- Verify Setup
-- ============================================================================

-- Check if bucket exists
SELECT 
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
FROM storage.buckets
WHERE id = 'resumes';

-- Check if policies exist
SELECT 
  policyname,
  cmd,
  roles
FROM pg_policies
WHERE schemaname = 'storage' 
  AND tablename = 'objects'
  AND policyname LIKE 'resumes%';

-- ============================================================================
-- Comments for Documentation
-- ============================================================================

COMMENT ON POLICY "resumes_insert" ON storage.objects IS 'Allows anonymous users to upload resumes from the public career page';
COMMENT ON POLICY "resumes_select" ON storage.objects IS 'Allows anyone to read resumes (for HR team access)';
COMMENT ON POLICY "resumes_update" ON storage.objects IS 'Allows authenticated users to update resume files';
COMMENT ON POLICY "resumes_delete" ON storage.objects IS 'Allows authenticated users to delete resume files';
