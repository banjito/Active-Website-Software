-- Fix permissions for signature_profiles table
-- Run this if you're getting 404 errors when trying to save signature profiles
-- This grants the necessary permissions for PostgREST API access

-- Grant schema usage
grant usage on schema neta_ops to anon, authenticated;

-- Grant table permissions
grant select, insert, update, delete on neta_ops.signature_profiles to authenticated;

-- Verify permissions were granted
SELECT 
  grantee,
  privilege_type
FROM 
  information_schema.role_table_grants
WHERE 
  table_schema = 'neta_ops'
  AND table_name = 'signature_profiles'
ORDER BY 
  grantee, privilege_type;
