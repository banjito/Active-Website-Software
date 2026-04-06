
-- Create medium voltage cable VLF test table for the combined VLF + Tan Delta MTS report
-- This table is used by MediumVoltageCableVLFTest.jsx component
-- This script is safe to run multiple times - it won't drop existing data

-- Create the table only if it doesn't exist
CREATE TABLE IF NOT EXISTS neta_ops.medium_voltage_cable_vlf_test (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id UUID REFERENCES neta_ops.jobs(id),
    user_id UUID REFERENCES auth.users(id),
    data JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Grant permissions
GRANT ALL ON neta_ops.medium_voltage_cable_vlf_test TO authenticated;

-- Add RLS (Row Level Security) policies
ALTER TABLE neta_ops.medium_voltage_cable_vlf_test ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist and recreate them
DROP POLICY IF EXISTS "Authenticated can SELECT Medium Voltage Cable VLF Test reports" ON neta_ops.medium_voltage_cable_vlf_test;
DROP POLICY IF EXISTS "Authenticated can INSERT Medium Voltage Cable VLF Test reports" ON neta_ops.medium_voltage_cable_vlf_test;
DROP POLICY IF EXISTS "Authenticated can UPDATE Medium Voltage Cable VLF Test reports" ON neta_ops.medium_voltage_cable_vlf_test;
DROP POLICY IF EXISTS "Authenticated can DELETE Medium Voltage Cable VLF Test reports" ON neta_ops.medium_voltage_cable_vlf_test;

-- Broad authenticated access policies - anyone authenticated can edit reports
CREATE POLICY "Authenticated can SELECT Medium Voltage Cable VLF Test reports"
ON neta_ops.medium_voltage_cable_vlf_test
FOR SELECT
USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated can INSERT Medium Voltage Cable VLF Test reports"
ON neta_ops.medium_voltage_cable_vlf_test
FOR INSERT
WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated can UPDATE Medium Voltage Cable VLF Test reports"
ON neta_ops.medium_voltage_cable_vlf_test
FOR UPDATE
USING (auth.uid() IS NOT NULL)
WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated can DELETE Medium Voltage Cable VLF Test reports"
ON neta_ops.medium_voltage_cable_vlf_test
FOR DELETE
USING (auth.uid() IS NOT NULL);

-- Create updated_at trigger
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER set_updated_at
    BEFORE UPDATE ON neta_ops.medium_voltage_cable_vlf_test
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Add indexes for performance (only if they don't exist)
CREATE INDEX IF NOT EXISTS idx_medium_voltage_cable_vlf_test_job_id ON neta_ops.medium_voltage_cable_vlf_test(job_id);
CREATE INDEX IF NOT EXISTS idx_medium_voltage_cable_vlf_test_user_id ON neta_ops.medium_voltage_cable_vlf_test(user_id);
