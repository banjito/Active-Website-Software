-- Create low_voltage_switch_maint_mts_reports table
CREATE TABLE IF NOT EXISTS neta_ops.low_voltage_switch_maint_mts_reports (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  job_id UUID NOT NULL REFERENCES neta_ops.jobs(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id),
  report_info JSONB NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create index on job_id for faster lookups
CREATE INDEX IF NOT EXISTS idx_low_voltage_switch_maint_mts_reports_job_id 
  ON neta_ops.low_voltage_switch_maint_mts_reports(job_id);

-- Create index on user_id for faster lookups
CREATE INDEX IF NOT EXISTS idx_low_voltage_switch_maint_mts_reports_user_id 
  ON neta_ops.low_voltage_switch_maint_mts_reports(user_id);

-- Enable RLS
ALTER TABLE neta_ops.low_voltage_switch_maint_mts_reports ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
CREATE POLICY "Users can view their division's low_voltage_switch_maint_mts_reports"
  ON neta_ops.low_voltage_switch_maint_mts_reports
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM neta_ops.jobs j
      WHERE j.id = low_voltage_switch_maint_mts_reports.job_id
      AND j.division = (
        SELECT division FROM neta_ops.user_profiles
        WHERE user_id = auth.uid()
      )
    )
  );

CREATE POLICY "Users can insert low_voltage_switch_maint_mts_reports for their division"
  ON neta_ops.low_voltage_switch_maint_mts_reports
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM neta_ops.jobs j
      WHERE j.id = job_id
      AND j.division = (
        SELECT division FROM neta_ops.user_profiles
        WHERE user_id = auth.uid()
      )
    )
  );

CREATE POLICY "Users can update their division's low_voltage_switch_maint_mts_reports"
  ON neta_ops.low_voltage_switch_maint_mts_reports
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM neta_ops.jobs j
      WHERE j.id = low_voltage_switch_maint_mts_reports.job_id
      AND j.division = (
        SELECT division FROM neta_ops.user_profiles
        WHERE user_id = auth.uid()
      )
    )
  );

CREATE POLICY "Users can delete their division's low_voltage_switch_maint_mts_reports"
  ON neta_ops.low_voltage_switch_maint_mts_reports
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM neta_ops.jobs j
      WHERE j.id = low_voltage_switch_maint_mts_reports.job_id
      AND j.division = (
        SELECT division FROM neta_ops.user_profiles
        WHERE user_id = auth.uid()
      )
    )
  );

-- Grant permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON neta_ops.low_voltage_switch_maint_mts_reports TO authenticated;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA neta_ops TO authenticated;

-- Add comment
COMMENT ON TABLE neta_ops.low_voltage_switch_maint_mts_reports IS 'Stores 6-Low Voltage Switch Maintenance MTS reports';



