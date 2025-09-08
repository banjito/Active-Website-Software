-- Update RLS permissions for low_voltage_circuit_breaker_electronic_trip_ats table
-- This will allow anyone to edit the report (remove user-specific restrictions)

-- First, drop the existing restrictive policies
DROP POLICY IF EXISTS "Users can view their own reports and reports from accessible jobs" 
ON neta_ops.low_voltage_circuit_breaker_electronic_trip_ats;

DROP POLICY IF EXISTS "Users can insert their own reports" 
ON neta_ops.low_voltage_circuit_breaker_electronic_trip_ats;

DROP POLICY IF EXISTS "Users can update their own reports" 
ON neta_ops.low_voltage_circuit_breaker_electronic_trip_ats;

DROP POLICY IF EXISTS "Users can delete their own reports" 
ON neta_ops.low_voltage_circuit_breaker_electronic_trip_ats;

-- Create new permissive policies that allow anyone to edit
-- Policy to allow anyone to view all reports
CREATE POLICY "Anyone can view all reports"
ON neta_ops.low_voltage_circuit_breaker_electronic_trip_ats
FOR SELECT
USING (true);

-- Policy to allow anyone to insert reports
CREATE POLICY "Anyone can insert reports"
ON neta_ops.low_voltage_circuit_breaker_electronic_trip_ats
FOR INSERT
WITH CHECK (true);

-- Policy to allow anyone to update reports
CREATE POLICY "Anyone can update reports"
ON neta_ops.low_voltage_circuit_breaker_electronic_trip_ats
FOR UPDATE
USING (true)
WITH CHECK (true);

-- Policy to allow anyone to delete reports
CREATE POLICY "Anyone can delete reports"
ON neta_ops.low_voltage_circuit_breaker_electronic_trip_ats
FOR DELETE
USING (true);

-- Verify the policies were created successfully
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
FROM pg_policies 
WHERE tablename = 'low_voltage_circuit_breaker_electronic_trip_ats'
AND schemaname = 'neta_ops';
