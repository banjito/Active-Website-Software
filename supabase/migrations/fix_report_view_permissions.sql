-- This script updates the RLS policies for various report tables to allow admins to view all reports.

-- Drop and recreate the SELECT policy for the 20 sets table
DROP POLICY IF EXISTS "Users can view their own cable test reports (20 sets)" ON neta_ops.low_voltage_cable_test_20sets;

CREATE POLICY "Users can view their own cable test reports (20 sets)"
    ON neta_ops.low_voltage_cable_test_20sets FOR SELECT
    USING (
        (LOWER(auth.jwt() -> 'user_metadata' ->> 'role') = 'admin') OR
        auth.uid() = user_id OR
        EXISTS (
            SELECT 1 FROM neta_ops.jobs j
            WHERE j.id = job_id
            AND j.division = (auth.jwt() ->> 'division')
        )
    );

-- Drop and recreate the SELECT policy for the 12 sets table
DROP POLICY IF EXISTS "Users can view their own cable test reports (12 sets)" ON neta_ops.low_voltage_cable_test_12sets;

CREATE POLICY "Users can view their own cable test reports (12 sets)"
    ON neta_ops.low_voltage_cable_test_12sets FOR SELECT
    USING (
        (LOWER(auth.jwt() -> 'user_metadata' ->> 'role') = 'admin') OR
        auth.uid() = user_id OR
        EXISTS (
            SELECT 1 FROM neta_ops.jobs j
            WHERE j.id = job_id
            AND j.division = (auth.jwt() ->> 'division')
        )
    );

-- Drop and recreate the SELECT policy for the 3 sets table
DROP POLICY IF EXISTS "Users can view their own cable test reports (3 sets)" ON neta_ops.low_voltage_cable_test_3sets;

CREATE POLICY "Users can view their own cable test reports (3 sets)"
    ON neta_ops.low_voltage_cable_test_3sets FOR SELECT
    USING (
        (LOWER(auth.jwt() -> 'user_metadata' ->> 'role') = 'admin') OR
        auth.uid() = user_id OR
        EXISTS (
            SELECT 1 FROM neta_ops.jobs j
            WHERE j.id = job_id
            AND j.division = (auth.jwt() ->> 'division')
        )
    );

-- Also update the circuit breaker report policy for consistency
DROP POLICY IF EXISTS "Users can view their own circuit breaker reports" ON neta_ops.low_voltage_circuit_breaker_electronic_trip_ats;

CREATE POLICY "Users can view their own circuit breaker reports"
    ON neta_ops.low_voltage_circuit_breaker_electronic_trip_ats FOR SELECT
    USING (
        (LOWER(auth.jwt() -> 'user_metadata' ->> 'role') = 'admin') OR
        auth.uid() = user_id OR
        EXISTS (
            SELECT 1 FROM neta_ops.jobs j
            WHERE j.id = job_id
            AND j.division = (auth.jwt() ->> 'division')
        )
    ); 