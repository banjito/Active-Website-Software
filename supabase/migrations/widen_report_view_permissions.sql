-- This script updates the RLS policies for various report tables to allow any authenticated user to view all reports.

-- Drop and recreate the SELECT policy for the 20 sets table
DROP POLICY IF EXISTS "Users can view their own cable test reports (20 sets)" ON neta_ops.low_voltage_cable_test_20sets;
CREATE POLICY "Any authenticated user can view reports (20 sets)"
    ON neta_ops.low_voltage_cable_test_20sets FOR SELECT
    USING ( auth.role() = 'authenticated' );

-- Drop and recreate the SELECT policy for the 12 sets table
DROP POLICY IF EXISTS "Users can view their own cable test reports (12 sets)" ON neta_ops.low_voltage_cable_test_12sets;
CREATE POLICY "Any authenticated user can view reports (12 sets)"
    ON neta_ops.low_voltage_cable_test_12sets FOR SELECT
    USING ( auth.role() = 'authenticated' );

-- Drop and recreate the SELECT policy for the 3 sets table
DROP POLICY IF EXISTS "Users can view their own cable test reports (3 sets)" ON neta_ops.low_voltage_cable_test_3sets;
CREATE POLICY "Any authenticated user can view reports (3 sets)"
    ON neta_ops.low_voltage_cable_test_3sets FOR SELECT
    USING ( auth.role() = 'authenticated' );

-- Also update the circuit breaker report policy for consistency
DROP POLICY IF EXISTS "Users can view their own circuit breaker reports" ON neta_ops.low_voltage_circuit_breaker_electronic_trip_ats;
CREATE POLICY "Any authenticated user can view circuit breaker reports"
    ON neta_ops.low_voltage_circuit_breaker_electronic_trip_ats FOR SELECT
    USING ( auth.role() = 'authenticated' ); 