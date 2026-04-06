-- ============================================================================
-- Setup Employee Documents Storage Bucket
-- ============================================================================
-- This script sets up the storage bucket for employee documents
-- Note: Storage buckets must be created through the Supabase Dashboard or API
-- This script provides the RLS policies for the bucket
-- ============================================================================

-- IMPORTANT: First create the bucket manually:
-- 1. Go to Supabase Dashboard → Storage
-- 2. Click "New bucket"
-- 3. Name: employee-documents
-- 4. Public: No (private bucket for employee files)
-- 5. File size limit: Set as needed (e.g., 50MB)
-- 6. Allowed MIME types: Leave empty or specify as needed

-- ============================================================================
-- Storage Bucket Policies (Run these AFTER creating the bucket)
-- ============================================================================

-- Policy: Allow authenticated users to upload employee documents
CREATE POLICY "Authenticated users can upload employee documents"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'employee-documents' AND
  (storage.foldername(name))[1] IS NOT NULL
);

-- Policy: Allow authenticated users to view/download employee documents
CREATE POLICY "Authenticated users can view employee documents"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'employee-documents');

-- Policy: Allow authenticated users to update employee documents
CREATE POLICY "Authenticated users can update employee documents"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'employee-documents')
WITH CHECK (bucket_id = 'employee-documents');

-- Policy: Allow authenticated users to delete employee documents
CREATE POLICY "Authenticated users can delete employee documents"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'employee-documents');

-- ============================================================================
-- Note: This is a private bucket for security
-- Documents will be accessed via signed URLs
-- ============================================================================
