-- ============================================================================
-- Add In Service Column to Field Equipment Table
-- ============================================================================
-- This script adds an in_service column to the field_equipment table.
-- Equipment can be taken out of service (e.g. for repair) and later placed
-- back in service. Out-of-service equipment is hidden from test report
-- equipment selection but remains visible in the Field Equipment List.
-- Run this in the Supabase SQL Editor
-- ============================================================================

-- Add in_service column (default true so existing rows remain in service)
ALTER TABLE neta_ops.field_equipment
ADD COLUMN IF NOT EXISTS in_service BOOLEAN DEFAULT true;

-- Backfill any existing rows that might have NULL (e.g. from prior partial run)
UPDATE neta_ops.field_equipment
SET in_service = true
WHERE in_service IS NULL;

-- Optional: make non-null so new rows always have a value
ALTER TABLE neta_ops.field_equipment
ALTER COLUMN in_service SET DEFAULT true;

COMMENT ON COLUMN neta_ops.field_equipment.in_service IS 'When false, equipment is out of service and excluded from test report equipment selection; viewable only in Field Equipment List.';

-- Index for filtering in-service equipment in reports
CREATE INDEX IF NOT EXISTS idx_field_equipment_in_service ON neta_ops.field_equipment(in_service);

