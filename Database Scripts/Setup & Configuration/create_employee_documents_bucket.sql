-- ============================================================================
-- Create Employee Documents Storage Bucket
-- ============================================================================
-- This script attempts to create the storage bucket for employee documents
-- Note: If this doesn't work, you may need to create it via Supabase Dashboard
-- ============================================================================

-- Try to create the bucket (this may not work in all Supabase setups)
-- If this fails, use the Supabase Dashboard method below

-- Method 1: Try creating via storage API (if available)
-- Note: This typically requires the Supabase Management API or Dashboard

-- ============================================================================
-- MANUAL SETUP INSTRUCTIONS (Recommended)
-- ============================================================================
-- If the above doesn't work, create the bucket manually:
--
-- 1. Go to your Supabase Dashboard
-- 2. Navigate to Storage in the left sidebar
-- 3. Click "New bucket" button
-- 4. Configure the bucket:
--    - Name: employee-documents
--    - Public: No (unchecked) - This is a private bucket
--    - File size limit: 50MB (or as needed)
--    - Allowed MIME types: Leave empty (allows all file types)
-- 5. Click "Create bucket"
--
-- After creating the bucket, run the setup_employee_documents_storage.sql
-- script to set up the RLS policies.
-- ============================================================================

-- Check if bucket already exists
SELECT 
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
FROM storage.buckets
WHERE name = 'employee-documents';

-- If the bucket doesn't exist, you'll need to create it via Dashboard
-- The RLS policies are in setup_employee_documents_storage.sql
