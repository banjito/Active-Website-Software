-- Setup Storage Policies for Resumes Bucket (Public Career Page)
-- IMPORTANT: Create the bucket via Supabase Dashboard first, then run this script
-- 
-- Dashboard Steps:
-- 1. Go to Supabase Dashboard → Storage
-- 2. Click "New bucket"
-- 3. Name: resumes
-- 4. Public: Yes (checked) - REQUIRED for anonymous uploads
-- 5. File size limit: 10MB
-- 6. Allowed MIME types: application/pdf, application/msword, application/vnd.openxmlformats-officedocument.wordprocessingml.document
--
-- Then run this script to set up the policies

-- ============================================================================
-- SET UP STORAGE POLICIES FOR ANONYMOUS UPLOADS
-- ============================================================================

-- Drop existing policies to avoid conflicts
DROP POLICY IF EXISTS "resumes_select" ON storage.objects;
DROP POLICY IF EXISTS "resumes_insert" ON storage.objects;
DROP POLICY IF EXISTS "resumes_update" ON storage.objects;
DROP POLICY IF EXISTS "resumes_delete" ON storage.objects;

-- CRITICAL: Allow anyone (including anonymous users) to upload resumes
-- This is what makes the public career page work for non-logged-in users
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
  file_size_limit
FROM storage.buckets
WHERE id = 'resumes';

-- Check if policies were created
SELECT 
  policyname,
  cmd,
  roles
FROM pg_policies
WHERE schemaname = 'storage' 
  AND tablename = 'objects'
  AND policyname LIKE 'resumes%'
ORDER BY policyname;
