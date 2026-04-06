-- Create applied_voltage_test_ats_reports table
-- This table stores Applied Voltage Test ATS reports for transformer testing
CREATE TABLE IF NOT EXISTS neta_ops.applied_voltage_test_ats_reports (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    job_id UUID NOT NULL REFERENCES neta_ops.jobs(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    report_info JSONB,
    applied_voltage_tests JSONB,
    test_equipment JSONB,
    comments TEXT,
    data JSONB
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_applied_voltage_test_ats_reports_job_id ON neta_ops.applied_voltage_test_ats_reports(job_id);
CREATE INDEX IF NOT EXISTS idx_applied_voltage_test_ats_reports_user_id ON neta_ops.applied_voltage_test_ats_reports(user_id);
CREATE INDEX IF NOT EXISTS idx_applied_voltage_test_ats_reports_created_at ON neta_ops.applied_voltage_test_ats_reports(created_at);

-- Enable Row Level Security
ALTER TABLE neta_ops.applied_voltage_test_ats_reports ENABLE ROW LEVEL SECURITY;

-- Create RLS policies - All authenticated users can view, insert, update, and delete all reports
CREATE POLICY "Authenticated users can view all applied voltage test reports" ON neta_ops.applied_voltage_test_ats_reports
    FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can insert applied voltage test reports" ON neta_ops.applied_voltage_test_ats_reports
    FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can update all applied voltage test reports" ON neta_ops.applied_voltage_test_ats_reports
    FOR UPDATE USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can delete all applied voltage test reports" ON neta_ops.applied_voltage_test_ats_reports
    FOR DELETE USING (auth.role() = 'authenticated');

-- Grant permissions
GRANT ALL ON neta_ops.applied_voltage_test_ats_reports TO authenticated;
GRANT USAGE ON SCHEMA neta_ops TO authenticated;

