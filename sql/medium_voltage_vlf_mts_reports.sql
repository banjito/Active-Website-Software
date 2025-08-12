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

-- Policy to allow users to select their own reports and reports from jobs they have access to
CREATE POLICY "Users can view their own Medium Voltage VLF MTS reports and accessible job reports"
ON neta_ops.medium_voltage_vlf_mts_reports
FOR SELECT
USING (auth.uid() = user_id OR job_id IN (SELECT id FROM neta_ops.jobs WHERE user_id = auth.uid()));

-- Policy to allow users to insert their own reports
CREATE POLICY "Users can insert their own Medium Voltage VLF MTS reports"
ON neta_ops.medium_voltage_vlf_mts_reports
FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Policy to allow users to update their own reports
CREATE POLICY "Users can update their own Medium Voltage VLF MTS reports"
ON neta_ops.medium_voltage_vlf_mts_reports
FOR UPDATE
USING (auth.uid() = user_id);

-- Policy to allow users to delete their own reports
CREATE POLICY "Users can delete their own Medium Voltage VLF MTS reports"
ON neta_ops.medium_voltage_vlf_mts_reports
FOR DELETE
USING (auth.uid() = user_id); 