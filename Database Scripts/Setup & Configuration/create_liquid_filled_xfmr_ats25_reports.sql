-- Create table for 7.2.2 Liquid Filled Xfmr. Visual, Mechanical, Insulation Resistance Test ATS 25 reports
-- Before running: Disable event triggers that might interfere
-- Run: ALTER EVENT TRIGGER attach_report_snapshot_on_create DISABLE;
-- Run: ALTER EVENT TRIGGER neta_ops_backup_attach_on_create DISABLE;

CREATE TABLE IF NOT EXISTS neta_ops.liquid_filled_xfmr_ats25_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES neta_ops.jobs(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  report_info JSONB DEFAULT '{}'::jsonb,
  visual_mechanical JSONB DEFAULT '{}'::jsonb,
  insulation_resistance JSONB DEFAULT '{}'::jsonb,
  test_equipment JSONB DEFAULT '{}'::jsonb,
  comments TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Create indexes for faster lookups
CREATE INDEX IF NOT EXISTS idx_liquid_filled_xfmr_ats25_reports_job_id ON neta_ops.liquid_filled_xfmr_ats25_reports(job_id);
CREATE INDEX IF NOT EXISTS idx_liquid_filled_xfmr_ats25_reports_user_id ON neta_ops.liquid_filled_xfmr_ats25_reports(user_id);

-- Grant permissions
GRANT ALL ON neta_ops.liquid_filled_xfmr_ats25_reports TO authenticated;
GRANT ALL ON neta_ops.liquid_filled_xfmr_ats25_reports TO service_role;

-- After running: Re-enable event triggers
-- Run: ALTER EVENT TRIGGER attach_report_snapshot_on_create ENABLE;
-- Run: ALTER EVENT TRIGGER neta_ops_backup_attach_on_create ENABLE;
