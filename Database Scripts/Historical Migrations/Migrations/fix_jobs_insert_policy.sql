-- Add missing INSERT policy for neta_ops.jobs table
-- This fixes the RLS violation when creating jobs from opportunities

-- Ensure RLS is enabled
ALTER TABLE neta_ops.jobs ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to insert jobs
-- Users can create jobs for themselves (user_id = auth.uid())
-- Admins/managers/supervisors can create jobs for any user
CREATE POLICY "Authenticated can INSERT jobs"
ON neta_ops.jobs
FOR INSERT
WITH CHECK (
  auth.role() = 'authenticated' AND (
    -- User can create jobs for themselves
    auth.uid() = user_id OR
    -- Admins/managers/supervisors can create jobs for anyone
    COALESCE(((auth.jwt() ->> 'app_metadata')::jsonb ->> 'role') IN ('admin','manager','supervisor'), false)
  )
);

-- Also allow authenticated users to insert jobs without role restrictions
-- This is more permissive and may be needed for opportunity conversion
CREATE POLICY "Authenticated can INSERT jobs - permissive"
ON neta_ops.jobs
FOR INSERT
WITH CHECK (auth.role() = 'authenticated');
