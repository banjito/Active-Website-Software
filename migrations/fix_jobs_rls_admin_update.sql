-- Ensure admins/managers can update jobs without referencing auth.users
-- This avoids RLS policy expressions that require access to the users table

-- Enable RLS (safe if already enabled)
ALTER TABLE neta_ops.jobs ENABLE ROW LEVEL SECURITY;

-- Allow admins/managers/supervisors (from JWT app_metadata.role) to UPDATE any job
-- Uses JWT claims only; does not touch auth.users
DROP POLICY IF EXISTS "Admins can update any job" ON neta_ops.jobs;
CREATE POLICY "Admins can update any job"
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

-- Optional: widen SELECT for authenticated users if needed (uncomment if reads are failing)
-- CREATE POLICY IF NOT EXISTS "Authenticated can select jobs"
-- ON neta_ops.jobs FOR SELECT USING (auth.role() = 'authenticated');


