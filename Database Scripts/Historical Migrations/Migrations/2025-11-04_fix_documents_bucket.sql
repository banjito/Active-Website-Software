-- Fix documents storage bucket to make issue attachments publicly accessible
-- Run this in your Supabase SQL Editor

-- Update the documents bucket to be public so issue attachments can be viewed
UPDATE storage.buckets 
SET public = true 
WHERE id = 'documents';

-- Create/update storage policies for documents bucket
-- Allow authenticated users to read all files
DROP POLICY IF EXISTS "documents_select_authenticated" ON storage.objects;
CREATE POLICY "documents_select_authenticated"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'documents');

-- Allow public read access for issue attachments specifically
DROP POLICY IF EXISTS "documents_select_public_issues" ON storage.objects;
CREATE POLICY "documents_select_public_issues"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'documents' AND (storage.foldername(name))[1] = 'issues');

-- Allow authenticated users to upload to documents bucket
DROP POLICY IF EXISTS "documents_insert_authenticated" ON storage.objects;
CREATE POLICY "documents_insert_authenticated"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'documents');

-- Allow authenticated users to update their own files
DROP POLICY IF EXISTS "documents_update_authenticated" ON storage.objects;
CREATE POLICY "documents_update_authenticated"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'documents' AND auth.uid() = owner);

-- Allow authenticated users to delete their own files
DROP POLICY IF EXISTS "documents_delete_authenticated" ON storage.objects;
CREATE POLICY "documents_delete_authenticated"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'documents' AND auth.uid() = owner);

-- Verify the changes
SELECT 
  id,
  name,
  public,
  file_size_limit,
  created_at
FROM storage.buckets
WHERE id = 'documents';

