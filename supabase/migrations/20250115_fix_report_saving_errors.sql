-- Fix Report Saving Errors Migration
-- This migration creates the missing database tables that are causing save failures

-- ========================================
-- 1. Low Voltage Cable Test Tables
-- ========================================

-- Drop existing tables if they exist
DROP TABLE IF EXISTS neta_ops.low_voltage_cable_test_20sets CASCADE;
DROP TABLE IF EXISTS neta_ops.low_voltage_cable_test_12sets CASCADE;
DROP TABLE IF EXISTS neta_ops.low_voltage_cable_test_3sets CASCADE;

-- Create 20 Sets Low Voltage Cable Test Table
CREATE TABLE neta_ops.low_voltage_cable_test_20sets (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    job_id UUID NOT NULL REFERENCES neta_ops.jobs(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    data JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create 12 Sets Low Voltage Cable Test Table
CREATE TABLE neta_ops.low_voltage_cable_test_12sets (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    job_id UUID NOT NULL REFERENCES neta_ops.jobs(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    data JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create 3 Sets Low Voltage Cable Test Table (MTS)
CREATE TABLE neta_ops.low_voltage_cable_test_3sets (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    job_id UUID NOT NULL REFERENCES neta_ops.jobs(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    data JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Grant permissions
GRANT ALL ON neta_ops.low_voltage_cable_test_20sets TO authenticated;
GRANT ALL ON neta_ops.low_voltage_cable_test_12sets TO authenticated;
GRANT ALL ON neta_ops.low_voltage_cable_test_3sets TO authenticated;

-- Create indexes for better performance
CREATE INDEX idx_lv_cable_20sets_job_id ON neta_ops.low_voltage_cable_test_20sets(job_id);
CREATE INDEX idx_lv_cable_20sets_user_id ON neta_ops.low_voltage_cable_test_20sets(user_id);
CREATE INDEX idx_lv_cable_12sets_job_id ON neta_ops.low_voltage_cable_test_12sets(job_id);
CREATE INDEX idx_lv_cable_12sets_user_id ON neta_ops.low_voltage_cable_test_12sets(user_id);
CREATE INDEX idx_lv_cable_3sets_job_id ON neta_ops.low_voltage_cable_test_3sets(job_id);
CREATE INDEX idx_lv_cable_3sets_user_id ON neta_ops.low_voltage_cable_test_3sets(user_id);

-- Enable Row Level Security
ALTER TABLE neta_ops.low_voltage_cable_test_20sets ENABLE ROW LEVEL SECURITY;
ALTER TABLE neta_ops.low_voltage_cable_test_12sets ENABLE ROW LEVEL SECURITY;
ALTER TABLE neta_ops.low_voltage_cable_test_3sets ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for 20 sets table
CREATE POLICY "Users can view their own cable test reports (20 sets)"
    ON neta_ops.low_voltage_cable_test_20sets FOR SELECT
    USING (
        auth.uid() = user_id OR
        EXISTS (
            SELECT 1 FROM neta_ops.jobs j 
            WHERE j.id = job_id 
            AND j.division = (auth.jwt() ->> 'division')
        )
    );

CREATE POLICY "Users can insert their own cable test reports (20 sets)"
    ON neta_ops.low_voltage_cable_test_20sets FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own cable test reports (20 sets)"
    ON neta_ops.low_voltage_cable_test_20sets FOR UPDATE
    USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own cable test reports (20 sets)"
    ON neta_ops.low_voltage_cable_test_20sets FOR DELETE
    USING (auth.uid() = user_id);

-- Create RLS policies for 12 sets table
CREATE POLICY "Users can view their own cable test reports (12 sets)"
    ON neta_ops.low_voltage_cable_test_12sets FOR SELECT
    USING (
        auth.uid() = user_id OR
        EXISTS (
            SELECT 1 FROM neta_ops.jobs j 
            WHERE j.id = job_id 
            AND j.division = (auth.jwt() ->> 'division')
        )
    );

CREATE POLICY "Users can insert their own cable test reports (12 sets)"
    ON neta_ops.low_voltage_cable_test_12sets FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own cable test reports (12 sets)"
    ON neta_ops.low_voltage_cable_test_12sets FOR UPDATE
    USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own cable test reports (12 sets)"
    ON neta_ops.low_voltage_cable_test_12sets FOR DELETE
    USING (auth.uid() = user_id);

-- Create RLS policies for 3 sets table
CREATE POLICY "Users can view their own cable test reports (3 sets)"
    ON neta_ops.low_voltage_cable_test_3sets FOR SELECT
    USING (
        auth.uid() = user_id OR
        EXISTS (
            SELECT 1 FROM neta_ops.jobs j 
            WHERE j.id = job_id 
            AND j.division = (auth.jwt() ->> 'division')
        )
    );

CREATE POLICY "Users can insert their own cable test reports (3 sets)"
    ON neta_ops.low_voltage_cable_test_3sets FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own cable test reports (3 sets)"
    ON neta_ops.low_voltage_cable_test_3sets FOR UPDATE
    USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own cable test reports (3 sets)"
    ON neta_ops.low_voltage_cable_test_3sets FOR DELETE
    USING (auth.uid() = user_id);

-- ========================================
-- 2. Low Voltage Circuit Breaker Electronic Trip ATS Table
-- ========================================

-- Drop existing table if it exists
DROP TABLE IF EXISTS neta_ops.low_voltage_circuit_breaker_electronic_trip_ats CASCADE;

-- Create the table
CREATE TABLE neta_ops.low_voltage_circuit_breaker_electronic_trip_ats (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    job_id UUID NOT NULL REFERENCES neta_ops.jobs(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    report_info JSONB DEFAULT '{}',
    nameplate_data JSONB DEFAULT '{}',
    visual_mechanical JSONB DEFAULT '{}',
    device_settings JSONB DEFAULT '{}',
    contact_resistance JSONB DEFAULT '{}',
    insulation_resistance JSONB DEFAULT '{}',
    primary_injection JSONB DEFAULT '{}',  -- For primary injection testing
    trip_testing JSONB DEFAULT '{}',       -- For secondary injection testing
    test_equipment JSONB DEFAULT '{}',
    comments TEXT DEFAULT ''
);

-- Grant permissions
GRANT ALL ON neta_ops.low_voltage_circuit_breaker_electronic_trip_ats TO authenticated;

-- Create indexes
CREATE INDEX idx_lv_cb_et_ats_job_id ON neta_ops.low_voltage_circuit_breaker_electronic_trip_ats(job_id);
CREATE INDEX idx_lv_cb_et_ats_user_id ON neta_ops.low_voltage_circuit_breaker_electronic_trip_ats(user_id);

-- Enable Row Level Security
ALTER TABLE neta_ops.low_voltage_circuit_breaker_electronic_trip_ats ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
CREATE POLICY "Users can view their own circuit breaker reports"
    ON neta_ops.low_voltage_circuit_breaker_electronic_trip_ats FOR SELECT
    USING (
        auth.uid() = user_id OR
        EXISTS (
            SELECT 1 FROM neta_ops.jobs j 
            WHERE j.id = job_id 
            AND j.division = (auth.jwt() ->> 'division')
        )
    );

CREATE POLICY "Users can insert their own circuit breaker reports"
    ON neta_ops.low_voltage_circuit_breaker_electronic_trip_ats FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own circuit breaker reports"
    ON neta_ops.low_voltage_circuit_breaker_electronic_trip_ats FOR UPDATE
    USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own circuit breaker reports"
    ON neta_ops.low_voltage_circuit_breaker_electronic_trip_ats FOR DELETE
    USING (auth.uid() = user_id);

-- ========================================
-- 3. Create triggers for updated_at timestamps
-- ========================================

-- Create or replace the update function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create triggers for all tables
CREATE TRIGGER update_lv_cable_20sets_updated_at
    BEFORE UPDATE ON neta_ops.low_voltage_cable_test_20sets
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_lv_cable_12sets_updated_at
    BEFORE UPDATE ON neta_ops.low_voltage_cable_test_12sets
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_lv_cable_3sets_updated_at
    BEFORE UPDATE ON neta_ops.low_voltage_cable_test_3sets
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_lv_cb_et_ats_updated_at
    BEFORE UPDATE ON neta_ops.low_voltage_circuit_breaker_electronic_trip_ats
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ========================================
-- 4. Verification queries (optional - comment out if not needed)
-- ========================================

-- Verify tables were created successfully
-- SELECT 'low_voltage_cable_test_20sets' as table_name, count(*) as record_count FROM neta_ops.low_voltage_cable_test_20sets
-- UNION ALL
-- SELECT 'low_voltage_cable_test_12sets' as table_name, count(*) as record_count FROM neta_ops.low_voltage_cable_test_12sets
-- UNION ALL
-- SELECT 'low_voltage_cable_test_3sets' as table_name, count(*) as record_count FROM neta_ops.low_voltage_cable_test_3sets
-- UNION ALL
-- SELECT 'low_voltage_circuit_breaker_electronic_trip_ats' as table_name, count(*) as record_count FROM neta_ops.low_voltage_circuit_breaker_electronic_trip_ats; 