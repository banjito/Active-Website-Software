-- Fix RLS policies on common.profiles to allow all authenticated users to see all profiles
-- This will allow the Employee Profiles page to show all users, not just 10

-- 1. Check current RLS status
SELECT 
  schemaname,
  tablename,
  rowsecurity as rls_enabled
FROM 
  pg_tables
WHERE 
  schemaname = 'common' 
  AND tablename = 'profiles';

-- 2. Drop existing restrictive policies (if any)
DROP POLICY IF EXISTS "profiles_select_policy" ON common.profiles;
DROP POLICY IF EXISTS "profiles_select_limit" ON common.profiles;
DROP POLICY IF EXISTS "Users can view own profile" ON common.profiles;
DROP POLICY IF EXISTS "Users can view all profiles" ON common.profiles;

-- 3. Create a policy that allows all authenticated users to SELECT all profiles
CREATE POLICY "allow_all_authenticated_select_profiles" 
ON common.profiles 
FOR SELECT 
TO authenticated
USING (true);

-- 4. Verify the policy was created
SELECT 
  policyname,
  cmd as command,
  roles,
  qual as using_expression
FROM 
  pg_policies
WHERE 
  schemaname = 'common'
  AND tablename = 'profiles'
  AND policyname = 'allow_all_authenticated_select_profiles';

-- 5. Test: Count should now return all profiles for authenticated users
-- (Run this as an authenticated user, not superuser)
SELECT COUNT(*) as visible_profiles FROM common.profiles;
