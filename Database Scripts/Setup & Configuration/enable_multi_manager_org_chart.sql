-- Enables multi-manager reporting lines for org chart assignments.
-- Safe migration: preserves existing data and converts to row-per-relationship.

BEGIN;

-- Remove old single-row-per-profile primary key if it exists.
ALTER TABLE common.org_chart_assignments
DROP CONSTRAINT IF EXISTS org_chart_assignments_pkey;

-- Add stable row id for each reporting relationship.
ALTER TABLE common.org_chart_assignments
ADD COLUMN IF NOT EXISTS id UUID DEFAULT gen_random_uuid();

-- Backfill id values for existing rows.
UPDATE common.org_chart_assignments
SET id = gen_random_uuid()
WHERE id IS NULL;

-- Make id required and primary key.
ALTER TABLE common.org_chart_assignments
ALTER COLUMN id SET NOT NULL;

ALTER TABLE common.org_chart_assignments
DROP CONSTRAINT IF EXISTS org_chart_assignments_id_key;

ALTER TABLE common.org_chart_assignments
ADD CONSTRAINT org_chart_assignments_pkey PRIMARY KEY (id);

-- Prevent duplicate reporting rows for same employee/manager pair.
CREATE UNIQUE INDEX IF NOT EXISTS uq_org_chart_assignments_profile_manager
ON common.org_chart_assignments(profile_id, reports_to_profile_id);

-- Ensure each employee has at most one top-level row (manager is NULL).
CREATE UNIQUE INDEX IF NOT EXISTS uq_org_chart_assignments_profile_top_level
ON common.org_chart_assignments(profile_id)
WHERE reports_to_profile_id IS NULL;

COMMIT;

