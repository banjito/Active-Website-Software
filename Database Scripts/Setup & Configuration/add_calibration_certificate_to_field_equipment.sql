-- ============================================================================
-- Add Calibration Certificate Column to Field Equipment Table
-- ============================================================================
-- This script adds a calibration_certificate_url column to store PDF certificate URLs
-- Run this in the Supabase SQL Editor
-- ============================================================================

-- Add calibration_certificate_url column
ALTER TABLE neta_ops.field_equipment 
ADD COLUMN IF NOT EXISTS calibration_certificate_url TEXT;

-- Add comment for documentation
COMMENT ON COLUMN neta_ops.field_equipment.calibration_certificate_url IS 'URL to the calibration certificate PDF file stored in Supabase Storage';



