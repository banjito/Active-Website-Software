-- ============================================================================
-- Add Sub Components Column to Field Equipment Table
-- ============================================================================
-- Stores a JSON array of sub components per equipment: [{qty, item, serial_number}]
-- Item names can be selected from neta_ops.equipment_sub_component_items (saved items).
-- Run this in the Supabase SQL Editor.
-- ============================================================================

ALTER TABLE neta_ops.field_equipment
ADD COLUMN IF NOT EXISTS sub_components JSONB DEFAULT NULL;

COMMENT ON COLUMN neta_ops.field_equipment.sub_components IS 'JSON array of sub components: [{qty, item, serial_number}]. Item names align with equipment_sub_component_items.';
