-- Verify and expose scheduling tables for PostgREST
-- Run this in Supabase SQL Editor after running the main migration

-- 1. Verify tables exist
SELECT 
  schemaname, 
  tablename 
FROM pg_tables 
WHERE schemaname = 'neta_ops' 
  AND tablename IN ('technician_availability', 'technician_exceptions', 'technician_assignments')
ORDER BY tablename;

-- 2. Grant usage on schema (neta_ops already exposed)
GRANT USAGE ON SCHEMA neta_ops TO anon, authenticated;

-- 3. Grant permissions on tables
GRANT SELECT, INSERT, UPDATE, DELETE ON neta_ops.technician_availability TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON neta_ops.technician_exceptions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON neta_ops.technician_assignments TO authenticated;

-- 4. Grant permissions on view
GRANT SELECT ON neta_ops.available_technicians TO authenticated;

-- 5. Enable RLS on all tables
ALTER TABLE neta_ops.technician_availability ENABLE ROW LEVEL SECURITY;
ALTER TABLE neta_ops.technician_exceptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE neta_ops.technician_assignments ENABLE ROW LEVEL SECURITY;

-- 6. Create RLS policies for technician_availability
DROP POLICY IF EXISTS "Anyone can view all availability" ON neta_ops.technician_availability;
CREATE POLICY "Anyone can view all availability" 
  ON neta_ops.technician_availability FOR SELECT 
  TO authenticated 
  USING (true);

DROP POLICY IF EXISTS "Only admins can manage availability" ON neta_ops.technician_availability;
CREATE POLICY "Only admins can manage availability" 
  ON neta_ops.technician_availability FOR ALL 
  TO authenticated 
  USING (auth.jwt() ->> 'role' = 'Admin' OR auth.jwt() ->> 'role' ILIKE '%Scheduler%')
  WITH CHECK (auth.jwt() ->> 'role' = 'Admin' OR auth.jwt() ->> 'role' ILIKE '%Scheduler%');

-- 7. Create RLS policies for technician_exceptions
DROP POLICY IF EXISTS "Anyone can view all exceptions" ON neta_ops.technician_exceptions;
CREATE POLICY "Anyone can view all exceptions" 
  ON neta_ops.technician_exceptions FOR SELECT 
  TO authenticated 
  USING (true);

DROP POLICY IF EXISTS "Only admins can manage exceptions" ON neta_ops.technician_exceptions;
CREATE POLICY "Only admins can manage exceptions" 
  ON neta_ops.technician_exceptions FOR ALL 
  TO authenticated 
  USING (auth.jwt() ->> 'role' = 'Admin' OR auth.jwt() ->> 'role' ILIKE '%Scheduler%')
  WITH CHECK (auth.jwt() ->> 'role' = 'Admin' OR auth.jwt() ->> 'role' ILIKE '%Scheduler%');

-- 8. Create RLS policies for technician_assignments
DROP POLICY IF EXISTS "Anyone can view all assignments" ON neta_ops.technician_assignments;
CREATE POLICY "Anyone can view all assignments" 
  ON neta_ops.technician_assignments FOR SELECT 
  TO authenticated 
  USING (true);

DROP POLICY IF EXISTS "Only admins can manage assignments" ON neta_ops.technician_assignments;
CREATE POLICY "Only admins can manage assignments" 
  ON neta_ops.technician_assignments FOR ALL 
  TO authenticated 
  USING (auth.jwt() ->> 'role' = 'Admin' OR auth.jwt() ->> 'role' ILIKE '%Scheduler%')
  WITH CHECK (auth.jwt() ->> 'role' = 'Admin' OR auth.jwt() ->> 'role' ILIKE '%Scheduler%');

-- 9. Verify RLS is enabled
SELECT 
  schemaname, 
  tablename, 
  rowsecurity 
FROM pg_tables 
WHERE schemaname = 'neta_ops' 
  AND tablename IN ('technician_availability', 'technician_exceptions', 'technician_assignments');

-- 10. List all policies
SELECT 
  schemaname, 
  tablename, 
  policyname,
  permissive,
  roles,
  cmd
FROM pg_policies 
WHERE schemaname = 'neta_ops' 
  AND tablename IN ('technician_availability', 'technician_exceptions', 'technician_assignments')
ORDER BY tablename, policyname;

