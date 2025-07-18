-- Fix existing technical_reports table by removing foreign key constraints to auth.users
-- Run this if you already created the table with the original script

-- Drop foreign key constraints if they exist
ALTER TABLE neta_ops.technical_reports DROP CONSTRAINT IF EXISTS technical_reports_submitted_by_fkey;
ALTER TABLE neta_ops.technical_reports DROP CONSTRAINT IF EXISTS technical_reports_reviewed_by_fkey;

-- Update RLS policies to be more permissive
DROP POLICY IF EXISTS "Managers can update any technical report" ON neta_ops.technical_reports;

-- Create a more permissive policy for updates
CREATE POLICY "Authenticated users can update technical reports" ON neta_ops.technical_reports
    FOR UPDATE USING (auth.role() = 'authenticated'); 