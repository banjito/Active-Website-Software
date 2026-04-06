-- ============================================================================
-- Add Tracking URL Column to Field Equipment Table
-- ============================================================================
-- This script adds a tracking_url column to the field_equipment table
-- Run this in the Supabase SQL Editor
-- ============================================================================

-- Add tracking_url column
ALTER TABLE neta_ops.field_equipment
ADD COLUMN IF NOT EXISTS tracking_url TEXT;

-- Add comment for documentation
COMMENT ON COLUMN neta_ops.field_equipment.tracking_url IS 'URL for tracking the equipment';

-- ============================================================================
-- Verification Query
-- ============================================================================
-- Run this to verify the column was added correctly:
-- SELECT column_name, data_type, is_nullable 
-- FROM information_schema.columns 
-- WHERE table_schema = 'neta_ops' AND table_name = 'field_equipment' AND column_name = 'tracking_url';
