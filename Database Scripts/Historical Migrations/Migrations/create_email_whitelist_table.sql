-- Alternative approach: Create a separate table for email whitelist management
-- This provides more flexibility and audit trails

CREATE TABLE IF NOT EXISTS neta_ops.daily_email_exclusions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  job_id UUID NOT NULL REFERENCES neta_ops.jobs(id) ON DELETE CASCADE,
  excluded_by UUID REFERENCES auth.users(id),
  reason TEXT,
  excluded_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes
CREATE INDEX idx_daily_email_exclusions_job_id ON neta_ops.daily_email_exclusions(job_id);
CREATE INDEX idx_daily_email_exclusions_excluded_at ON neta_ops.daily_email_exclusions(excluded_at);

-- Enable RLS
ALTER TABLE neta_ops.daily_email_exclusions ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Enable read access for authenticated users" ON neta_ops.daily_email_exclusions
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Enable insert access for authenticated users" ON neta_ops.daily_email_exclusions
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Enable update access for authenticated users" ON neta_ops.daily_email_exclusions
  FOR UPDATE USING (auth.role() = 'authenticated');

CREATE POLICY "Enable delete access for authenticated users" ON neta_ops.daily_email_exclusions
  FOR DELETE USING (auth.role() = 'authenticated');

-- Grant permissions
GRANT ALL ON neta_ops.daily_email_exclusions TO authenticated;

-- Add updated_at trigger
CREATE OR REPLACE FUNCTION neta_ops.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_daily_email_exclusions_updated_at
BEFORE UPDATE ON neta_ops.daily_email_exclusions
FOR EACH ROW
EXECUTE FUNCTION neta_ops.update_updated_at_column();

-- Example usage:
-- To exclude a job from daily emails:
-- INSERT INTO neta_ops.daily_email_exclusions (job_id, excluded_by, reason)
-- VALUES ('your-job-uuid', 'user-uuid', 'Job is on hold pending client approval');

-- To include a job back in daily emails:
-- DELETE FROM neta_ops.daily_email_exclusions WHERE job_id = 'your-job-uuid';
