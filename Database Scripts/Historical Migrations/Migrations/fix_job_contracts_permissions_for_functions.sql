-- Fix permissions for job_contracts table to allow edge functions to access it
-- This is needed for the weekly PO report function

-- Grant access to the service role (used by edge functions)
GRANT SELECT ON neta_ops.job_contracts TO service_role;

-- If RLS is enabled, create a policy for service role
-- First check if RLS is enabled and create bypass policy if needed
DO $$ 
BEGIN
  -- Create a policy that allows service role to bypass RLS
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'neta_ops' 
    AND tablename = 'job_contracts' 
    AND policyname = 'Service role can access all job_contracts'
  ) THEN
    CREATE POLICY "Service role can access all job_contracts"
      ON neta_ops.job_contracts
      FOR SELECT
      TO service_role
      USING (true);
  END IF;
END $$;

-- Verify the permissions
SELECT 
  'Permissions verified for job_contracts' as status,
  has_table_privilege('service_role', 'neta_ops.job_contracts', 'SELECT') as can_select;

