-- ============================================================================
-- Equipment Categories Table Migration
-- ============================================================================
-- This script creates the equipment_categories table for managing equipment categories
-- Run this in the Supabase SQL Editor
-- ============================================================================

-- Create the equipment_categories table in the neta_ops schema
CREATE TABLE IF NOT EXISTS neta_ops.equipment_categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL UNIQUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add comments for documentation
COMMENT ON TABLE neta_ops.equipment_categories IS 'Stores available equipment categories that can be assigned to field equipment';
COMMENT ON COLUMN neta_ops.equipment_categories.name IS 'Name of the equipment category';

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_equipment_categories_name ON neta_ops.equipment_categories(name);

-- Enable Row Level Security
ALTER TABLE neta_ops.equipment_categories ENABLE ROW LEVEL SECURITY;

-- Policy: All authenticated users can view categories
CREATE POLICY "Authenticated users can view categories" ON neta_ops.equipment_categories
    FOR SELECT
    USING (auth.uid() IS NOT NULL);

-- Policy: All authenticated users can create categories
CREATE POLICY "Authenticated users can create categories" ON neta_ops.equipment_categories
    FOR INSERT
    WITH CHECK (auth.uid() IS NOT NULL);

-- Policy: All authenticated users can update categories
CREATE POLICY "Authenticated users can update categories" ON neta_ops.equipment_categories
    FOR UPDATE
    USING (auth.uid() IS NOT NULL);

-- Policy: All authenticated users can delete categories
CREATE POLICY "Authenticated users can delete categories" ON neta_ops.equipment_categories
    FOR DELETE
    USING (auth.uid() IS NOT NULL);

-- Create a function to update the updated_at timestamp
CREATE OR REPLACE FUNCTION neta_ops.update_equipment_categories_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to automatically update updated_at
DROP TRIGGER IF EXISTS equipment_categories_updated_at ON neta_ops.equipment_categories;
CREATE TRIGGER equipment_categories_updated_at
    BEFORE UPDATE ON neta_ops.equipment_categories
    FOR EACH ROW
    EXECUTE FUNCTION neta_ops.update_equipment_categories_updated_at();

-- Grant permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON neta_ops.equipment_categories TO authenticated;

-- ============================================================================
-- Migration: Populate categories from existing equipment
-- ============================================================================
-- This will extract unique categories from existing field_equipment and add them to the categories table
INSERT INTO neta_ops.equipment_categories (name)
SELECT DISTINCT category
FROM neta_ops.field_equipment
WHERE category IS NOT NULL AND category != ''
ON CONFLICT (name) DO NOTHING;

-- ============================================================================
-- Verification Query
-- ============================================================================
-- Run this to verify the table was created correctly:
-- SELECT * FROM neta_ops.equipment_categories ORDER BY name;
