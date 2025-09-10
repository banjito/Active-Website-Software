-- Step 3: Fix permissions
-- Run this in your Supabase SQL editor

-- Disable RLS completely
ALTER TABLE business.subcontractor_agreements DISABLE ROW LEVEL SECURITY;

-- Grant permissions to authenticated users
GRANT ALL ON business.subcontractor_agreements TO authenticated;
