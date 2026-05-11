-- ============================================================================
-- Field Equipment: Job Sites & Trucks Assignment Migration
-- ============================================================================
-- This migration extends the "Assigned To" feature on neta_ops.field_equipment
-- so that equipment can be assigned to:
--   * a user        (existing behavior)
--   * a job site    (new)
--   * a truck       (new)
--
-- Saved job sites and trucks are managed in their own lookup tables, mirroring
-- the pattern used by equipment_categories / equipment_locations so the user
-- can add and delete the saved values from the UI.
--
-- Run this in the Supabase SQL Editor.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) Saved job sites lookup table
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS neta_ops.equipment_job_sites (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(150) NOT NULL UNIQUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE neta_ops.equipment_job_sites IS 'Saved job sites available for field equipment assignment.';
COMMENT ON COLUMN neta_ops.equipment_job_sites.name IS 'Display name of the job site.';

CREATE INDEX IF NOT EXISTS idx_equipment_job_sites_name ON neta_ops.equipment_job_sites(name);

ALTER TABLE neta_ops.equipment_job_sites ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can view job sites" ON neta_ops.equipment_job_sites;
CREATE POLICY "Authenticated users can view job sites" ON neta_ops.equipment_job_sites
    FOR SELECT
    USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Authenticated users can create job sites" ON neta_ops.equipment_job_sites;
CREATE POLICY "Authenticated users can create job sites" ON neta_ops.equipment_job_sites
    FOR INSERT
    WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Authenticated users can update job sites" ON neta_ops.equipment_job_sites;
CREATE POLICY "Authenticated users can update job sites" ON neta_ops.equipment_job_sites
    FOR UPDATE
    USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Authenticated users can delete job sites" ON neta_ops.equipment_job_sites;
CREATE POLICY "Authenticated users can delete job sites" ON neta_ops.equipment_job_sites
    FOR DELETE
    USING (auth.uid() IS NOT NULL);

CREATE OR REPLACE FUNCTION neta_ops.update_equipment_job_sites_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS equipment_job_sites_updated_at ON neta_ops.equipment_job_sites;
CREATE TRIGGER equipment_job_sites_updated_at
    BEFORE UPDATE ON neta_ops.equipment_job_sites
    FOR EACH ROW
    EXECUTE FUNCTION neta_ops.update_equipment_job_sites_updated_at();

GRANT SELECT, INSERT, UPDATE, DELETE ON neta_ops.equipment_job_sites TO authenticated;

-- ----------------------------------------------------------------------------
-- 2) Saved trucks lookup table
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS neta_ops.equipment_trucks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(150) NOT NULL UNIQUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE neta_ops.equipment_trucks IS 'Saved trucks available for field equipment assignment.';
COMMENT ON COLUMN neta_ops.equipment_trucks.name IS 'Display name / identifier of the truck.';

CREATE INDEX IF NOT EXISTS idx_equipment_trucks_name ON neta_ops.equipment_trucks(name);

ALTER TABLE neta_ops.equipment_trucks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can view trucks" ON neta_ops.equipment_trucks;
CREATE POLICY "Authenticated users can view trucks" ON neta_ops.equipment_trucks
    FOR SELECT
    USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Authenticated users can create trucks" ON neta_ops.equipment_trucks;
CREATE POLICY "Authenticated users can create trucks" ON neta_ops.equipment_trucks
    FOR INSERT
    WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Authenticated users can update trucks" ON neta_ops.equipment_trucks;
CREATE POLICY "Authenticated users can update trucks" ON neta_ops.equipment_trucks
    FOR UPDATE
    USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Authenticated users can delete trucks" ON neta_ops.equipment_trucks;
CREATE POLICY "Authenticated users can delete trucks" ON neta_ops.equipment_trucks
    FOR DELETE
    USING (auth.uid() IS NOT NULL);

CREATE OR REPLACE FUNCTION neta_ops.update_equipment_trucks_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS equipment_trucks_updated_at ON neta_ops.equipment_trucks;
CREATE TRIGGER equipment_trucks_updated_at
    BEFORE UPDATE ON neta_ops.equipment_trucks
    FOR EACH ROW
    EXECUTE FUNCTION neta_ops.update_equipment_trucks_updated_at();

GRANT SELECT, INSERT, UPDATE, DELETE ON neta_ops.equipment_trucks TO authenticated;

-- ----------------------------------------------------------------------------
-- 3) Extend field_equipment to support multiple assignment types
-- ----------------------------------------------------------------------------
-- We need to:
--   a) Add assigned_type column ('user' | 'job_site' | 'truck'), nullable.
--   b) Convert assigned_to from UUID -> TEXT so it can hold either a user UUID
--      or a job-site / truck name. Drop the FK to auth.users first.
--   c) Backfill assigned_type = 'user' for rows that already have a value.

-- a) Add assigned_type column
ALTER TABLE neta_ops.field_equipment
ADD COLUMN IF NOT EXISTS assigned_type TEXT;

ALTER TABLE neta_ops.field_equipment
DROP CONSTRAINT IF EXISTS field_equipment_assigned_type_check;

ALTER TABLE neta_ops.field_equipment
ADD CONSTRAINT field_equipment_assigned_type_check
CHECK (assigned_type IS NULL OR assigned_type IN ('user', 'job_site', 'truck'));

COMMENT ON COLUMN neta_ops.field_equipment.assigned_type IS
'Type of the assignee referenced by assigned_to: user (UUID), job_site (name), or truck (name).';

-- b) Drop the FK to auth.users (it would block converting the column to TEXT,
--    and we need to allow non-UUID values now).
DO $$
DECLARE
    fk_name TEXT;
BEGIN
    SELECT conname INTO fk_name
    FROM pg_constraint
    WHERE conrelid = 'neta_ops.field_equipment'::regclass
      AND contype = 'f'
      AND pg_get_constraintdef(oid) ILIKE '%assigned_to%REFERENCES%auth.users%';

    IF fk_name IS NOT NULL THEN
        EXECUTE format('ALTER TABLE neta_ops.field_equipment DROP CONSTRAINT %I', fk_name);
    END IF;
END $$;

-- Convert assigned_to to TEXT (safe if it was already TEXT; UUID -> TEXT is
-- an implicit cast). USING handles either current type.
ALTER TABLE neta_ops.field_equipment
ALTER COLUMN assigned_to TYPE TEXT USING assigned_to::text;

COMMENT ON COLUMN neta_ops.field_equipment.assigned_to IS
'Identifier of the assignee. Interpretation depends on assigned_type: user UUID, job-site name, or truck name.';

-- c) Backfill assigned_type for existing assignments (any existing assigned_to
--    value pre-migration was a user UUID).
UPDATE neta_ops.field_equipment
SET assigned_type = 'user'
WHERE assigned_to IS NOT NULL AND assigned_type IS NULL;

-- Keep the existing index on assigned_to (it still exists from the original
-- table create; TEXT indexes work fine for equality lookups).
CREATE INDEX IF NOT EXISTS idx_field_equipment_assigned_type
    ON neta_ops.field_equipment(assigned_type);

-- ============================================================================
-- Verification
-- ============================================================================
-- SELECT column_name, data_type FROM information_schema.columns
-- WHERE table_schema = 'neta_ops' AND table_name = 'field_equipment'
--   AND column_name IN ('assigned_to', 'assigned_type');
-- SELECT * FROM neta_ops.equipment_job_sites ORDER BY name;
-- SELECT * FROM neta_ops.equipment_trucks ORDER BY name;
