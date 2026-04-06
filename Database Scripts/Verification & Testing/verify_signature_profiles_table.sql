-- Verify signature_profiles table exists and is accessible
-- Run this to check if the table was created correctly

-- 1. Check if table exists
SELECT 
  table_schema, 
  table_name,
  table_type
FROM 
  information_schema.tables 
WHERE 
  table_schema = 'neta_ops' 
  AND table_name = 'signature_profiles';

-- 2. Check table structure
SELECT 
  column_name,
  data_type,
  is_nullable,
  column_default
FROM 
  information_schema.columns
WHERE 
  table_schema = 'neta_ops'
  AND table_name = 'signature_profiles'
ORDER BY 
  ordinal_position;

-- 3. Check RLS status
SELECT
  schemaname,
  tablename,
  rowsecurity
FROM
  pg_tables
WHERE
  schemaname = 'neta_ops'
  AND tablename = 'signature_profiles';

-- 4. Check RLS policies
SELECT 
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
FROM 
  pg_policies
WHERE 
  schemaname = 'neta_ops'
  AND tablename = 'signature_profiles'
ORDER BY 
  policyname;

-- 5. Test insert (this will fail if there are permission issues)
-- Uncomment to test:
-- INSERT INTO neta_ops.signature_profiles (name, created_by) 
-- VALUES ('Test Profile', '00000000-0000-0000-0000-000000000000'::uuid)
-- ON CONFLICT DO NOTHING;

-- 6. Check if table is accessible via PostgREST
-- Note: This requires checking Supabase Dashboard -> API Settings -> Exposed Schemas
-- The neta_ops schema should be in the list of exposed schemas
