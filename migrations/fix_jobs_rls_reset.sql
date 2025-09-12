-- Reset jobs RLS policies to avoid references to auth.users
-- Drops all existing policies on neta_ops.jobs, then recreates safe policies

-- Ensure RLS is enabled
ALTER TABLE neta_ops.jobs ENABLE ROW LEVEL SECURITY;

-- Drop all existing policies on neta_ops.jobs
DO $$
DECLARE
  pol RECORD;
BEGIN
  FOR pol IN 
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'neta_ops' AND tablename = 'jobs'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON neta_ops.jobs', pol.policyname);
  END LOOP;
END $$;

-- Broad read policy (optional but commonly needed by UI)
CREATE POLICY "Authenticated can SELECT jobs"
ON neta_ops.jobs
FOR SELECT
USING (auth.role() = 'authenticated');

-- Admins/managers/supervisors may update any job (JWT app_metadata.role)
CREATE POLICY "Admins can UPDATE jobs"
ON neta_ops.jobs
FOR UPDATE
USING (
  auth.role() = 'authenticated' AND
  COALESCE(((auth.jwt() ->> 'app_metadata')::jsonb ->> 'role') IN ('admin','manager','supervisor'), false)
)
WITH CHECK (
  auth.role() = 'authenticated' AND
  COALESCE(((auth.jwt() ->> 'app_metadata')::jsonb ->> 'role') IN ('admin','manager','supervisor'), false)
);

-- Job owner can update their job (no auth.users reads)
CREATE POLICY "Owner can UPDATE own job"
ON neta_ops.jobs
FOR UPDATE
USING (auth.role() = 'authenticated' AND auth.uid() = user_id)
WITH CHECK (auth.role() = 'authenticated' AND auth.uid() = user_id);


