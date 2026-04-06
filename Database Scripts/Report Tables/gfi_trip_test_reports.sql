-- Create table for GFI Trip Test Reports
-- Run this script in Supabase SQL Editor

-- Drop existing table if it exists (optional - comment out if you want to preserve data)
-- DROP TABLE IF EXISTS neta_ops.gfi_trip_test_reports;

-- Create the GFI Trip Test Reports table
CREATE TABLE IF NOT EXISTS neta_ops.gfi_trip_test_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id UUID REFERENCES neta_ops.jobs(id) ON DELETE CASCADE,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    
    -- Job Information
    customer TEXT,
    address TEXT,
    user_name TEXT,
    date DATE,
    job_number TEXT,
    technicians TEXT,
    substation TEXT,
    eqpt_location TEXT,
    identifier TEXT,
    
    -- Test Equipment
    test_equipment JSONB DEFAULT '{}'::jsonb,
    
    -- GFI Data
    manufacturer TEXT,
    rated_current TEXT,
    ground_fault_setting TEXT,
    ground_fault_trip TEXT,
    
    -- Results
    results TEXT,
    
    -- Status
    status TEXT DEFAULT 'PASS' CHECK (status IN ('PASS', 'FAIL')),
    
    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Grant permissions
GRANT ALL ON neta_ops.gfi_trip_test_reports TO authenticated;

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_gfi_trip_test_reports_job_id 
ON neta_ops.gfi_trip_test_reports(job_id);

CREATE INDEX IF NOT EXISTS idx_gfi_trip_test_reports_user_id 
ON neta_ops.gfi_trip_test_reports(user_id);

CREATE INDEX IF NOT EXISTS idx_gfi_trip_test_reports_created_at 
ON neta_ops.gfi_trip_test_reports(created_at);

-- Enable Row Level Security
ALTER TABLE neta_ops.gfi_trip_test_reports ENABLE ROW LEVEL SECURITY;

-- Drop old restrictive policies if they exist (for migration)
DROP POLICY IF EXISTS "Users can view their own reports and reports from accessible jobs" ON neta_ops.gfi_trip_test_reports;
DROP POLICY IF EXISTS "Users can view their own reports" ON neta_ops.gfi_trip_test_reports;
DROP POLICY IF EXISTS "Users can insert their own reports" ON neta_ops.gfi_trip_test_reports;
DROP POLICY IF EXISTS "Users can update their own reports" ON neta_ops.gfi_trip_test_reports;
DROP POLICY IF EXISTS "Users can delete their own reports" ON neta_ops.gfi_trip_test_reports;

-- Drop new policies if re-running script
DROP POLICY IF EXISTS "Authenticated users can view all reports" ON neta_ops.gfi_trip_test_reports;
DROP POLICY IF EXISTS "Authenticated users can insert reports" ON neta_ops.gfi_trip_test_reports;
DROP POLICY IF EXISTS "Authenticated users can update all reports" ON neta_ops.gfi_trip_test_reports;
DROP POLICY IF EXISTS "Authenticated users can delete all reports" ON neta_ops.gfi_trip_test_reports;

-- Policy to allow all authenticated users to view all reports
CREATE POLICY "Authenticated users can view all reports"
ON neta_ops.gfi_trip_test_reports
FOR SELECT
TO authenticated
USING (true);

-- Policy to allow all authenticated users to insert reports
CREATE POLICY "Authenticated users can insert reports"
ON neta_ops.gfi_trip_test_reports
FOR INSERT
TO authenticated
WITH CHECK (true);

-- Policy to allow all authenticated users to update any report
CREATE POLICY "Authenticated users can update all reports"
ON neta_ops.gfi_trip_test_reports
FOR UPDATE
TO authenticated
USING (true)
WITH CHECK (true);

-- Policy to allow all authenticated users to delete any report
CREATE POLICY "Authenticated users can delete all reports"
ON neta_ops.gfi_trip_test_reports
FOR DELETE
TO authenticated
USING (true);

-- Create trigger for updated_at (uses common.set_updated_at if available, otherwise creates inline)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'set_updated_at' AND pronamespace = 'common'::regnamespace) THEN
        EXECUTE 'CREATE TRIGGER set_updated_at
            BEFORE UPDATE ON neta_ops.gfi_trip_test_reports
            FOR EACH ROW
            EXECUTE FUNCTION common.set_updated_at()';
    ELSE
        -- Create inline function if common.set_updated_at doesn't exist
        CREATE OR REPLACE FUNCTION neta_ops.gfi_trip_test_reports_set_updated_at()
        RETURNS TRIGGER AS $func$
        BEGIN
            NEW.updated_at = NOW();
            RETURN NEW;
        END;
        $func$ LANGUAGE plpgsql;
        
        CREATE TRIGGER set_updated_at
            BEFORE UPDATE ON neta_ops.gfi_trip_test_reports
            FOR EACH ROW
            EXECUTE FUNCTION neta_ops.gfi_trip_test_reports_set_updated_at();
    END IF;
END $$;
