-- Drop existing table if it exists
DROP TABLE IF EXISTS neta_ops.medium_voltage_vlf_mts_reports;

-- Create the table
CREATE TABLE neta_ops.medium_voltage_vlf_mts_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id UUID REFERENCES neta_ops.jobs(id),
    user_id UUID REFERENCES auth.users(id),
    data JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Grant permissions
GRANT ALL ON neta_ops.medium_voltage_vlf_mts_reports TO authenticated;

-- Add RLS (Row Level Security) policies
ALTER TABLE neta_ops.medium_voltage_vlf_mts_reports ENABLE ROW LEVEL SECURITY;

-- Replace selective policies with broad authenticated access
DROP POLICY IF EXISTS "Users can view their own Medium Voltage VLF MTS reports and accessible job reports" ON neta_ops.medium_voltage_vlf_mts_reports;
CREATE POLICY "Authenticated can SELECT Medium Voltage VLF MTS reports"
ON neta_ops.medium_voltage_vlf_mts_reports
FOR SELECT
USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Users can insert their own Medium Voltage VLF MTS reports" ON neta_ops.medium_voltage_vlf_mts_reports;
CREATE POLICY "Authenticated can INSERT Medium Voltage VLF MTS reports"
ON neta_ops.medium_voltage_vlf_mts_reports
FOR INSERT
WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Users can update Medium Voltage VLF MTS reports for accessible jobs" ON neta_ops.medium_voltage_vlf_mts_reports;
CREATE POLICY "Authenticated can UPDATE Medium Voltage VLF MTS reports"
ON neta_ops.medium_voltage_vlf_mts_reports
FOR UPDATE
USING (auth.uid() IS NOT NULL)
WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Users can delete their own Medium Voltage VLF MTS reports" ON neta_ops.medium_voltage_vlf_mts_reports;
CREATE POLICY "Authenticated can DELETE Medium Voltage VLF MTS reports"
ON neta_ops.medium_voltage_vlf_mts_reports
FOR DELETE
USING (auth.uid() IS NOT NULL);