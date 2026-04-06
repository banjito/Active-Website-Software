-- ============================================================================
-- Setup Help Center Documents Storage Bucket
-- ============================================================================
-- This script sets up the storage bucket for Help Center PDF documents
-- Note: Storage buckets must be created through the Supabase Dashboard or API
-- This script provides the RLS policies for the bucket
-- ============================================================================

-- IMPORTANT: First create the bucket manually:
-- 1. Go to Supabase Dashboard → Storage
-- 2. Click "New bucket"
-- 3. Name: help-center-documents
-- 4. Public: Yes (so PDFs and videos can be viewed)
-- 5. File size limit: 50MB for PDFs only; for video (e.g. 3-hour) use 2GB or higher
-- 6. Allowed MIME types: application/pdf, video/mp4, video/webm, video/quicktime

-- ============================================================================
-- Storage Bucket Policies (Run these AFTER creating the bucket)
-- Drop existing policies first so this script can be re-run safely.
-- ============================================================================

DROP POLICY IF EXISTS "Authenticated users can upload help center documents" ON storage.objects;
CREATE POLICY "Authenticated users can upload help center documents"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'help-center-documents' AND
  (storage.foldername(name))[1] IS NOT NULL
);

DROP POLICY IF EXISTS "Authenticated users can view help center documents" ON storage.objects;
CREATE POLICY "Authenticated users can view help center documents"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'help-center-documents');

DROP POLICY IF EXISTS "Authenticated users can update help center documents" ON storage.objects;
CREATE POLICY "Authenticated users can update help center documents"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'help-center-documents')
WITH CHECK (bucket_id = 'help-center-documents');

DROP POLICY IF EXISTS "Authenticated users can delete help center documents" ON storage.objects;
CREATE POLICY "Authenticated users can delete help center documents"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'help-center-documents');

-- ============================================================================
-- Note: For public access (if needed), you can add:
-- ============================================================================
-- CREATE POLICY "Public can view help center documents"
-- ON storage.objects FOR SELECT
-- TO public
-- USING (bucket_id = 'help-center-documents');
