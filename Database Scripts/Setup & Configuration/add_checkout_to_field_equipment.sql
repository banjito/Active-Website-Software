-- ============================================================================
-- Field Equipment: Check-out tracking columns
-- ============================================================================
-- Adds support for "checking out" a piece of field equipment without affecting
-- its existing assignment. The equipment remains assigned to the user / job
-- site / truck recorded in assigned_to/assigned_type, while these columns
-- record who currently has it in hand and when they picked it up.
--
-- Run this in the Supabase SQL Editor.
-- ============================================================================

ALTER TABLE neta_ops.field_equipment
ADD COLUMN IF NOT EXISTS checked_out_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE neta_ops.field_equipment
ADD COLUMN IF NOT EXISTS checked_out_at TIMESTAMPTZ;

COMMENT ON COLUMN neta_ops.field_equipment.checked_out_by IS
'User who currently has the equipment checked out. NULL means it is not checked out.';

COMMENT ON COLUMN neta_ops.field_equipment.checked_out_at IS
'Timestamp the equipment was checked out. NULL means it is not checked out.';

CREATE INDEX IF NOT EXISTS idx_field_equipment_checked_out_by
    ON neta_ops.field_equipment(checked_out_by);

-- ============================================================================
-- Verification
-- ============================================================================
-- SELECT column_name, data_type FROM information_schema.columns
-- WHERE table_schema = 'neta_ops' AND table_name = 'field_equipment'
--   AND column_name IN ('checked_out_by', 'checked_out_at');
