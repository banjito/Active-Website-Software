-- ============================================================================
-- Field Equipment Table Migration
-- ============================================================================
-- This script creates the field_equipment table for managing field equipment
-- Run this in the Supabase SQL Editor
-- ============================================================================

-- Create the field_equipment table in the neta_ops schema
CREATE TABLE IF NOT EXISTS neta_ops.field_equipment (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    equipment_name VARCHAR(255) NOT NULL,
    amp_id VARCHAR(100),
    serial_number VARCHAR(100),
    calibration_date DATE,
    calibration_due_date DATE,
    category VARCHAR(100),
    assigned_to UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add comments for documentation
COMMENT ON TABLE neta_ops.field_equipment IS 'Stores field equipment information including calibration dates and assignments';
COMMENT ON COLUMN neta_ops.field_equipment.equipment_name IS 'Name of the equipment';
COMMENT ON COLUMN neta_ops.field_equipment.amp_id IS 'AMP internal ID for the equipment';
COMMENT ON COLUMN neta_ops.field_equipment.serial_number IS 'Serial number of the equipment';
COMMENT ON COLUMN neta_ops.field_equipment.calibration_date IS 'Date when equipment was last calibrated';
COMMENT ON COLUMN neta_ops.field_equipment.calibration_due_date IS 'Date when equipment calibration is due';
COMMENT ON COLUMN neta_ops.field_equipment.category IS 'Category/type of equipment';
COMMENT ON COLUMN neta_ops.field_equipment.assigned_to IS 'User ID of the person assigned to this equipment';

-- Create indexes for common queries
CREATE INDEX IF NOT EXISTS idx_field_equipment_assigned_to ON neta_ops.field_equipment(assigned_to);
CREATE INDEX IF NOT EXISTS idx_field_equipment_category ON neta_ops.field_equipment(category);
CREATE INDEX IF NOT EXISTS idx_field_equipment_calibration_due_date ON neta_ops.field_equipment(calibration_due_date);
CREATE INDEX IF NOT EXISTS idx_field_equipment_amp_id ON neta_ops.field_equipment(amp_id);
CREATE INDEX IF NOT EXISTS idx_field_equipment_serial_number ON neta_ops.field_equipment(serial_number);
CREATE INDEX IF NOT EXISTS idx_field_equipment_created_by ON neta_ops.field_equipment(created_by);

-- Enable Row Level Security
ALTER TABLE neta_ops.field_equipment ENABLE ROW LEVEL SECURITY;

-- Policy: All authenticated users can view equipment
CREATE POLICY "Authenticated users can view equipment" ON neta_ops.field_equipment
    FOR SELECT
    USING (auth.uid() IS NOT NULL);

-- Policy: Authenticated users can create equipment
CREATE POLICY "Authenticated users can create equipment" ON neta_ops.field_equipment
    FOR INSERT
    WITH CHECK (auth.uid() IS NOT NULL);

-- Policy: Authenticated users can update equipment
CREATE POLICY "Authenticated users can update equipment" ON neta_ops.field_equipment
    FOR UPDATE
    USING (auth.uid() IS NOT NULL);

-- Policy: Authenticated users can delete equipment
CREATE POLICY "Authenticated users can delete equipment" ON neta_ops.field_equipment
    FOR DELETE
    USING (auth.uid() IS NOT NULL);

-- Create a function to update the updated_at timestamp
CREATE OR REPLACE FUNCTION neta_ops.update_field_equipment_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to automatically update updated_at
DROP TRIGGER IF EXISTS field_equipment_updated_at ON neta_ops.field_equipment;
CREATE TRIGGER field_equipment_updated_at
    BEFORE UPDATE ON neta_ops.field_equipment
    FOR EACH ROW
    EXECUTE FUNCTION neta_ops.update_field_equipment_updated_at();

-- Grant permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON neta_ops.field_equipment TO authenticated;

-- ============================================================================
-- Verification Query
-- ============================================================================
-- Run this to verify the table was created correctly:
-- SELECT column_name, data_type, is_nullable 
-- FROM information_schema.columns 
-- WHERE table_schema = 'neta_ops' AND table_name = 'field_equipment';



