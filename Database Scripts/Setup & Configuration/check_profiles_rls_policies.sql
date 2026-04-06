-- Check RLS status and policies on common.profiles table
-- Run this to diagnose why only 10 profiles are being returned

-- 1. Check if RLS is enabled
SELECT 
  schemaname,
  tablename,
  rowsecurity as rls_enabled
FROM 
  pg_tables
WHERE 
  schemaname = 'common' 
  AND tablename = 'profiles';

-- 2. Check all RLS policies on profiles table
SELECT 
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd as command,
  qual as using_expression,
  with_check as with_check_expression
FROM 
  pg_policies
WHERE 
  schemaname = 'common'
  AND tablename = 'profiles'
ORDER BY 
  policyname;

-- 3. Count total rows in profiles table (bypasses RLS if run as superuser)
SELECT COUNT(*) as total_profiles FROM common.profiles;

-- 4. Check if there's a LIMIT in any view or function
SELECT 
  routine_schema,
  routine_name,
  routine_definition
FROM 
  information_schema.routines
WHERE 
  routine_schema = 'common'
  AND routine_definition LIKE '%profiles%'
  AND routine_definition LIKE '%LIMIT%10%';
