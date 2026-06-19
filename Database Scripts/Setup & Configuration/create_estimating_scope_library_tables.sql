-- ===========================================================
-- ESTIMATING SCOPE ITEM LIBRARY TABLES
-- ===========================================================
-- Description: Stores reusable estimating scope items and the test
-- equipment commonly needed to perform those scope items.
--
-- Library entries can be searched from an estimate and used to populate
-- a single editable estimate row with item name, material cost, tech
-- count, labor hours, and estimate notes.
-- ===========================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ===========================================================
-- Test Equipment Library
-- ===========================================================
CREATE TABLE IF NOT EXISTS business.estimating_test_equipment (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    description TEXT,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    created_by UUID REFERENCES auth.users(id),
    updated_by UUID REFERENCES auth.users(id)
);

CREATE INDEX IF NOT EXISTS idx_estimating_test_equipment_name
    ON business.estimating_test_equipment(name);

CREATE INDEX IF NOT EXISTS idx_estimating_test_equipment_is_active
    ON business.estimating_test_equipment(is_active);

-- ===========================================================
-- Scope Item Library
-- ===========================================================
CREATE TABLE IF NOT EXISTS business.estimating_scope_library_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    item_name TEXT NOT NULL,
    activity TEXT,
    material_cost NUMERIC(12,2) NOT NULL DEFAULT 0,
    tech_count NUMERIC(10,2) NOT NULL DEFAULT 0,
    hours NUMERIC(10,2) NOT NULL DEFAULT 0,
    estimate_notes TEXT,
    library_notes TEXT,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    created_by UUID REFERENCES auth.users(id),
    updated_by UUID REFERENCES auth.users(id)
);

CREATE INDEX IF NOT EXISTS idx_estimating_scope_library_items_item_name
    ON business.estimating_scope_library_items(item_name);

CREATE INDEX IF NOT EXISTS idx_estimating_scope_library_items_activity
    ON business.estimating_scope_library_items(activity);

CREATE INDEX IF NOT EXISTS idx_estimating_scope_library_items_is_active
    ON business.estimating_scope_library_items(is_active);

-- ===========================================================
-- Scope Item <-> Test Equipment Associations
-- ===========================================================
CREATE TABLE IF NOT EXISTS business.estimating_scope_library_item_equipment (
    scope_item_id UUID NOT NULL REFERENCES business.estimating_scope_library_items(id) ON DELETE CASCADE,
    equipment_id UUID NOT NULL REFERENCES business.estimating_test_equipment(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    PRIMARY KEY (scope_item_id, equipment_id)
);

CREATE INDEX IF NOT EXISTS idx_estimating_scope_library_item_equipment_scope_item_id
    ON business.estimating_scope_library_item_equipment(scope_item_id);

CREATE INDEX IF NOT EXISTS idx_estimating_scope_library_item_equipment_equipment_id
    ON business.estimating_scope_library_item_equipment(equipment_id);

-- ===========================================================
-- Updated-at Triggers
-- ===========================================================
CREATE OR REPLACE FUNCTION business.update_estimating_scope_library_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_estimating_test_equipment_timestamp
    ON business.estimating_test_equipment;

CREATE TRIGGER trigger_update_estimating_test_equipment_timestamp
    BEFORE UPDATE ON business.estimating_test_equipment
    FOR EACH ROW
    EXECUTE FUNCTION business.update_estimating_scope_library_updated_at();

DROP TRIGGER IF EXISTS trigger_update_estimating_scope_library_items_timestamp
    ON business.estimating_scope_library_items;

CREATE TRIGGER trigger_update_estimating_scope_library_items_timestamp
    BEFORE UPDATE ON business.estimating_scope_library_items
    FOR EACH ROW
    EXECUTE FUNCTION business.update_estimating_scope_library_updated_at();

-- ===========================================================
-- Row Level Security
-- ===========================================================
ALTER TABLE business.estimating_test_equipment ENABLE ROW LEVEL SECURITY;
ALTER TABLE business.estimating_scope_library_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE business.estimating_scope_library_item_equipment ENABLE ROW LEVEL SECURITY;

-- Test equipment policies
DROP POLICY IF EXISTS "Authenticated users can view estimating test equipment"
    ON business.estimating_test_equipment;
DROP POLICY IF EXISTS "Authenticated users can insert estimating test equipment"
    ON business.estimating_test_equipment;
DROP POLICY IF EXISTS "Authenticated users can update estimating test equipment"
    ON business.estimating_test_equipment;
DROP POLICY IF EXISTS "Authenticated users can delete estimating test equipment"
    ON business.estimating_test_equipment;

CREATE POLICY "Authenticated users can view estimating test equipment"
    ON business.estimating_test_equipment
    FOR SELECT
    TO authenticated
    USING (true);

CREATE POLICY "Authenticated users can insert estimating test equipment"
    ON business.estimating_test_equipment
    FOR INSERT
    TO authenticated
    WITH CHECK (true);

CREATE POLICY "Authenticated users can update estimating test equipment"
    ON business.estimating_test_equipment
    FOR UPDATE
    TO authenticated
    USING (true)
    WITH CHECK (true);

CREATE POLICY "Authenticated users can delete estimating test equipment"
    ON business.estimating_test_equipment
    FOR DELETE
    TO authenticated
    USING (true);

-- Scope library item policies
DROP POLICY IF EXISTS "Authenticated users can view estimating scope library items"
    ON business.estimating_scope_library_items;
DROP POLICY IF EXISTS "Authenticated users can insert estimating scope library items"
    ON business.estimating_scope_library_items;
DROP POLICY IF EXISTS "Authenticated users can update estimating scope library items"
    ON business.estimating_scope_library_items;
DROP POLICY IF EXISTS "Authenticated users can delete estimating scope library items"
    ON business.estimating_scope_library_items;

CREATE POLICY "Authenticated users can view estimating scope library items"
    ON business.estimating_scope_library_items
    FOR SELECT
    TO authenticated
    USING (true);

CREATE POLICY "Authenticated users can insert estimating scope library items"
    ON business.estimating_scope_library_items
    FOR INSERT
    TO authenticated
    WITH CHECK (true);

CREATE POLICY "Authenticated users can update estimating scope library items"
    ON business.estimating_scope_library_items
    FOR UPDATE
    TO authenticated
    USING (true)
    WITH CHECK (true);

CREATE POLICY "Authenticated users can delete estimating scope library items"
    ON business.estimating_scope_library_items
    FOR DELETE
    TO authenticated
    USING (true);

-- Scope item equipment join policies
DROP POLICY IF EXISTS "Authenticated users can view estimating scope library item equipment"
    ON business.estimating_scope_library_item_equipment;
DROP POLICY IF EXISTS "Authenticated users can insert estimating scope library item equipment"
    ON business.estimating_scope_library_item_equipment;
DROP POLICY IF EXISTS "Authenticated users can update estimating scope library item equipment"
    ON business.estimating_scope_library_item_equipment;
DROP POLICY IF EXISTS "Authenticated users can delete estimating scope library item equipment"
    ON business.estimating_scope_library_item_equipment;

CREATE POLICY "Authenticated users can view estimating scope library item equipment"
    ON business.estimating_scope_library_item_equipment
    FOR SELECT
    TO authenticated
    USING (true);

CREATE POLICY "Authenticated users can insert estimating scope library item equipment"
    ON business.estimating_scope_library_item_equipment
    FOR INSERT
    TO authenticated
    WITH CHECK (true);

CREATE POLICY "Authenticated users can update estimating scope library item equipment"
    ON business.estimating_scope_library_item_equipment
    FOR UPDATE
    TO authenticated
    USING (true)
    WITH CHECK (true);

CREATE POLICY "Authenticated users can delete estimating scope library item equipment"
    ON business.estimating_scope_library_item_equipment
    FOR DELETE
    TO authenticated
    USING (true);

-- ===========================================================
-- Grants
-- ===========================================================
GRANT USAGE ON SCHEMA business TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON business.estimating_test_equipment TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON business.estimating_scope_library_items TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON business.estimating_scope_library_item_equipment TO authenticated;

-- ===========================================================
-- Comments
-- ===========================================================
COMMENT ON TABLE business.estimating_test_equipment IS 'Reusable estimating test equipment entries that can be associated with scope library items.';
COMMENT ON TABLE business.estimating_scope_library_items IS 'Reusable estimating scope item presets used to populate editable estimate rows.';
COMMENT ON TABLE business.estimating_scope_library_item_equipment IS 'Many-to-many associations between estimating scope library items and test equipment.';

COMMENT ON COLUMN business.estimating_scope_library_items.item_name IS 'Item name imported into the estimate row item field.';
COMMENT ON COLUMN business.estimating_scope_library_items.activity IS 'Library-only classification such as maintenance, acceptance, or engineering.';
COMMENT ON COLUMN business.estimating_scope_library_items.material_cost IS 'Material cost imported into the estimate row material price field.';
COMMENT ON COLUMN business.estimating_scope_library_items.tech_count IS 'Number of technicians imported into the estimate row labor men field.';
COMMENT ON COLUMN business.estimating_scope_library_items.hours IS 'Number of hours imported into the estimate row labor hours field.';
COMMENT ON COLUMN business.estimating_scope_library_items.estimate_notes IS 'Notes imported into the estimate row notes field.';
COMMENT ON COLUMN business.estimating_scope_library_items.library_notes IS 'Library-only notes shown to estimators but not imported into estimates.';
