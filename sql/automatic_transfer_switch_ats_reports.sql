-- Create automatic_transfer_switch_ats_reports table
CREATE TABLE IF NOT EXISTS neta_ops.automatic_transfer_switch_ats_reports (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    job_id UUID NOT NULL REFERENCES neta_ops.jobs(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    report_info JSONB,
    visual_inspection_items JSONB,
    insulation_resistance JSONB,
    contact_resistance JSONB,
    test_equipment_used JSONB,
    comments TEXT
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_automatic_transfer_switch_ats_reports_job_id ON neta_ops.automatic_transfer_switch_ats_reports(job_id);
CREATE INDEX IF NOT EXISTS idx_automatic_transfer_switch_ats_reports_user_id ON neta_ops.automatic_transfer_switch_ats_reports(user_id);
CREATE INDEX IF NOT EXISTS idx_automatic_transfer_switch_ats_reports_created_at ON neta_ops.automatic_transfer_switch_ats_reports(created_at);

-- Enable Row Level Security
ALTER TABLE neta_ops.automatic_transfer_switch_ats_reports ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
CREATE POLICY "Users can view their own reports" ON neta_ops.automatic_transfer_switch_ats_reports
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own reports" ON neta_ops.automatic_transfer_switch_ats_reports
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own reports" ON neta_ops.automatic_transfer_switch_ats_reports
    FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own reports" ON neta_ops.automatic_transfer_switch_ats_reports
    FOR DELETE USING (auth.uid() = user_id);

-- Grant permissions
GRANT ALL ON neta_ops.automatic_transfer_switch_ats_reports TO authenticated;
GRANT USAGE ON SCHEMA neta_ops TO authenticated;
