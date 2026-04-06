-- ============================================================================
-- Setup Equipment Certificates Storage Bucket
-- ============================================================================
-- This script sets up the storage bucket for equipment calibration certificates
-- Note: Storage buckets must be created through the Supabase Dashboard or API
-- This script provides the RLS policies for the bucket
-- ============================================================================

-- IMPORTANT: First create the bucket manually:
-- 1. Go to Supabase Dashboard → Storage
-- 2. Click "New bucket"
-- 3. Name: equipment-certificates
-- 4. Public: Yes (or configure RLS as needed)
-- 5. File size limit: Set as needed (e.g., 10MB for PDFs)
-- 6. Allowed MIME types: application/pdf

-- ============================================================================
-- Storage Bucket Policies (Run these AFTER creating the bucket)
-- ============================================================================

-- Policy: Allow authenticated users to upload files
CREATE POLICY "Authenticated users can upload certificates"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'equipment-certificates' AND
  (storage.foldername(name))[1] IS NOT NULL
);

-- Policy: Allow authenticated users to view/download files
CREATE POLICY "Authenticated users can view certificates"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'equipment-certificates');

-- Policy: Allow authenticated users to update files
CREATE POLICY "Authenticated users can update certificates"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'equipment-certificates')
WITH CHECK (bucket_id = 'equipment-certificates');

-- Policy: Allow authenticated users to delete files
CREATE POLICY "Authenticated users can delete certificates"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'equipment-certificates');

-- ============================================================================
-- Alternative: If you want public access (no authentication required)
-- ============================================================================
-- Uncomment the following policies if you want public read access:

-- CREATE POLICY "Public can view certificates"
-- ON storage.objects FOR SELECT
-- TO public
-- USING (bucket_id = 'equipment-certificates');

-- ============================================================================
-- Verification
-- ============================================================================
-- After creating the bucket and running these policies, verify with:
-- SELECT * FROM storage.buckets WHERE name = 'equipment-certificates';
-- SELECT * FROM pg_policies WHERE tablename = 'objects' AND policyname LIKE '%certificates%';



