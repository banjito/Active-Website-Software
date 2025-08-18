-- Enable RLS and add policies for Low Voltage Switch ATS reports

-- Ensure table exists before applying policies
DO $$ BEGIN
  PERFORM 1 FROM information_schema.tables 
  WHERE table_schema = 'neta_ops' AND table_name = 'low_voltage_switch_reports';
  IF NOT FOUND THEN
    RAISE NOTICE 'Table neta_ops.low_voltage_switch_reports does not exist; skipping policy creation.';
  END IF;
END $$;

-- Enable Row Level Security
ALTER TABLE IF EXISTS neta_ops.low_voltage_switch_reports ENABLE ROW LEVEL SECURITY;

-- Clean up any existing policies to avoid duplicates when re-running
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'neta_ops' AND tablename = 'low_voltage_switch_reports'
  ) THEN
    DROP POLICY IF EXISTS "Users can view their own reports and accessible jobs" ON neta_ops.low_voltage_switch_reports;
    DROP POLICY IF EXISTS "Users can insert their own reports" ON neta_ops.low_voltage_switch_reports;
    DROP POLICY IF EXISTS "Users can update their own reports" ON neta_ops.low_voltage_switch_reports;
    DROP POLICY IF EXISTS "Users can delete their own reports" ON neta_ops.low_voltage_switch_reports;
  END IF;
END $$;

-- Allow users to read their own reports and reports for jobs they own
CREATE POLICY "Users can view their own reports and accessible jobs"
ON neta_ops.low_voltage_switch_reports
FOR SELECT
USING (
  auth.uid() = user_id
  OR job_id IN (
    SELECT j.id FROM neta_ops.jobs j WHERE j.user_id = auth.uid()
  )
);

-- Allow users to insert their own reports
CREATE POLICY "Users can insert their own reports"
ON neta_ops.low_voltage_switch_reports
FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Allow users to update their own reports
CREATE POLICY "Users can update their own reports"
ON neta_ops.low_voltage_switch_reports
FOR UPDATE
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Allow users to delete their own reports
CREATE POLICY "Users can delete their own reports"
ON neta_ops.low_voltage_switch_reports
FOR DELETE
USING (auth.uid() = user_id);


