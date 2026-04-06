-- TEMPORARY: Disable RLS on common.profiles to test if that's the issue
-- WARNING: Only use this for testing. Re-enable RLS after testing.
-- This will allow all users to see all profiles without any restrictions

-- 1. Disable RLS temporarily
ALTER TABLE common.profiles DISABLE ROW LEVEL SECURITY;

-- 2. Verify RLS is disabled
SELECT 
  schemaname,
  tablename,
  rowsecurity as rls_enabled
FROM 
  pg_tables
WHERE 
  schemaname = 'common' 
  AND tablename = 'profiles';
-- Should show rls_enabled = false

-- 3. Test query - should now return all profiles
SELECT COUNT(*) as total_profiles FROM common.profiles;

-- TO RE-ENABLE RLS AFTER TESTING:
-- ALTER TABLE common.profiles ENABLE ROW LEVEL SECURITY;
-- Then run fix_profiles_rls_for_all_users.sql to add proper policies
