-- Create table for Small Low Voltage Dry Type Transformer ATS 25 Reports
-- This table stores data for the 7.2.1.1 Small Low Voltage Dry Type Transformer Test Sheet ATS 25

CREATE TABLE IF NOT EXISTS neta_ops.small_lv_dry_type_transformer_ats25_reports (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    job_id UUID REFERENCES neta_ops.jobs(id) ON DELETE CASCADE,
    user_id UUID REFERENCES auth.users(id),
    report_info JSONB DEFAULT '{}',
    visual_mechanical JSONB DEFAULT '{}',
    insulation_resistance JSONB DEFAULT '{}',
    turns_ratio JSONB DEFAULT '{}',
    test_equipment JSONB DEFAULT '{}',
    comments TEXT DEFAULT '',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for faster lookups
CREATE INDEX IF NOT EXISTS idx_small_lv_dry_type_transformer_ats25_reports_job_id 
ON neta_ops.small_lv_dry_type_transformer_ats25_reports(job_id);

CREATE INDEX IF NOT EXISTS idx_small_lv_dry_type_transformer_ats25_reports_user_id 
ON neta_ops.small_lv_dry_type_transformer_ats25_reports(user_id);

-- Create updated_at trigger
CREATE TRIGGER update_small_lv_dry_type_transformer_ats25_reports_updated_at
    BEFORE UPDATE ON neta_ops.small_lv_dry_type_transformer_ats25_reports
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Grant permissions
GRANT ALL ON neta_ops.small_lv_dry_type_transformer_ats25_reports TO authenticated;
GRANT ALL ON neta_ops.small_lv_dry_type_transformer_ats25_reports TO service_role;

COMMENT ON TABLE neta_ops.small_lv_dry_type_transformer_ats25_reports IS 
'Stores 7.2.1.1 Small Low Voltage Dry Type Transformer Test Sheet ATS 25 reports including nameplate data, visual/mechanical inspection, insulation resistance tests, and turns ratio tests.';
