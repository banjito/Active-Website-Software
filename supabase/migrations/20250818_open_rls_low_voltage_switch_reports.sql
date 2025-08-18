-- Open RLS policies for low_voltage_switch_reports so any authenticated user can read/write

-- Ensure RLS is enabled
ALTER TABLE IF EXISTS neta_ops.low_voltage_switch_reports ENABLE ROW LEVEL SECURITY;

-- Drop restrictive policies if they exist
DROP POLICY IF EXISTS "Users can view their own reports and accessible jobs" ON neta_ops.low_voltage_switch_reports;
DROP POLICY IF EXISTS "Users can insert their own reports" ON neta_ops.low_voltage_switch_reports;
DROP POLICY IF EXISTS "Users can update their own reports" ON neta_ops.low_voltage_switch_reports;
DROP POLICY IF EXISTS "Users can delete their own reports" ON neta_ops.low_voltage_switch_reports;

-- Allow all authenticated users to select
CREATE POLICY "Allow authenticated select on low_voltage_switch_reports"
ON neta_ops.low_voltage_switch_reports
FOR SELECT
USING (auth.role() = 'authenticated');

-- Allow all authenticated users to insert
CREATE POLICY "Allow authenticated insert on low_voltage_switch_reports"
ON neta_ops.low_voltage_switch_reports
FOR INSERT
WITH CHECK (auth.role() = 'authenticated');

-- Allow all authenticated users to update
CREATE POLICY "Allow authenticated update on low_voltage_switch_reports"
ON neta_ops.low_voltage_switch_reports
FOR UPDATE
USING (auth.role() = 'authenticated')
WITH CHECK (auth.role() = 'authenticated');

-- Allow all authenticated users to delete
CREATE POLICY "Allow authenticated delete on low_voltage_switch_reports"
ON neta_ops.low_voltage_switch_reports
FOR DELETE
USING (auth.role() = 'authenticated');


