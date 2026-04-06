-- Check PostgREST configuration and expose common schema

-- 1. Check current PostgREST schemas
SHOW pgrst.db_schemas;

-- 2. Check if common schema exists and has the tables
SELECT table_schema, table_name 
FROM information_schema.tables 
WHERE table_schema = 'common' 
  AND table_name IN ('technician_assignments', 'technician_availability', 'technician_exceptions', 'available_technicians')
ORDER BY table_name;

-- 3. Check current schema search path
SHOW search_path;

-- 4. Grant access to anon and authenticated roles on common schema (already done but verify)
GRANT USAGE ON SCHEMA common TO anon, authenticated;

-- 5. If common is not in the exposed schemas, you need to add it via Supabase Dashboard:
-- Go to: Settings > API > Extra search path
-- Add: common
-- Or set db_schemas to include common: common, neta_ops, business, lab_ops

-- 6. Verify the view exists
SELECT schemaname, viewname, viewowner
FROM pg_views
WHERE schemaname = 'common' AND viewname = 'available_technicians';

-- 7. Check RLS is enabled
SELECT schemaname, tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'common'
  AND tablename IN ('technician_assignments', 'technician_availability', 'technician_exceptions');

