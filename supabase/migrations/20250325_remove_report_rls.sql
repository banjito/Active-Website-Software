-- Disable RLS on report tables
ALTER TABLE panelboard_reports DISABLE ROW LEVEL SECURITY;
ALTER TABLE switchgear_reports DISABLE ROW LEVEL SECURITY;
ALTER TABLE transformer_reports DISABLE ROW LEVEL SECURITY;
ALTER TABLE largedrytransformer_tests DISABLE ROW LEVEL SECURITY;
ALTER TABLE job_assets DISABLE ROW LEVEL SECURITY;
ALTER TABLE assets DISABLE ROW LEVEL SECURITY;

-- Drop existing policies on job_assets
DROP POLICY IF EXISTS "Users can view their own job assets" ON job_assets;
DROP POLICY IF EXISTS "Users can create their own job assets" ON job_assets;
DROP POLICY IF EXISTS "Users can delete their own job assets" ON job_assets;

-- Drop existing policies on assets
DROP POLICY IF EXISTS "Users can view their own assets" ON assets;
DROP POLICY IF EXISTS "Users can create their own assets" ON assets;
DROP POLICY IF EXISTS "Users can update their own assets" ON assets;
DROP POLICY IF EXISTS "Users can delete their own assets" ON assets;

-- Create permissive policies for job_assets
CREATE POLICY "Allow all authenticated users to access job assets"
  ON job_assets
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Create permissive policies for assets
CREATE POLICY "Allow all authenticated users to access assets"
  ON assets
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);
