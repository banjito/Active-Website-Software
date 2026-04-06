-- ============================================================================
-- Add Notes Column to Field Equipment Table
-- ============================================================================
-- This script adds a notes column to the field_equipment table
-- Run this in the Supabase SQL Editor
-- ============================================================================

-- Add notes column
ALTER TABLE neta_ops.field_equipment 
ADD COLUMN IF NOT EXISTS notes TEXT;

-- Add comment for documentation
COMMENT ON COLUMN neta_ops.field_equipment.notes IS 'Additional notes or comments about the equipment';



