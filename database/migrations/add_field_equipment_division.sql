-- Field equipment by division.
--
-- The Divisions switcher on /field-tech/field-equipment did nothing: equipment had no
-- division, only the free-text `location` and the assignment (person / truck / job
-- site). This adds one.
--
-- Meaning, as agreed with the field team 2026-11-11: the division is where the item is
-- being USED right now, not a permanent home. When it moves to another office, any tech
-- changes it. Location and assignment stay as they are.
--
-- NULL = not assigned to a division yet. Field Tech (All) shows every item, including
-- those, and has a "No division" filter so each office can claim theirs.
--
-- ON UPDATE CASCADE matches neta_ops.jobs.division: renaming a division id carries the
-- equipment with it. ON DELETE SET NULL: deleting a division (rare; deactivating is the
-- normal path) drops its equipment back to no division instead of blocking the delete.
--
-- Safe to re-run.

SET lock_timeout = '5s';

DO $$
BEGIN
  IF to_regclass('common.divisions') IS NULL THEN
    RAISE EXCEPTION 'common.divisions does not exist. Run database/migrations/create_divisions_table.sql first, then re-run this file.';
  END IF;
END $$;

ALTER TABLE neta_ops.field_equipment
  ADD COLUMN IF NOT EXISTS division text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'field_equipment_division_fkey'
  ) THEN
    ALTER TABLE neta_ops.field_equipment
      ADD CONSTRAINT field_equipment_division_fkey
      FOREIGN KEY (division) REFERENCES common.divisions(id)
      ON UPDATE CASCADE ON DELETE SET NULL;
  END IF;

  -- "Field Tech (All)" is the combined view, not a place equipment can be.
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'field_equipment_division_not_aggregate'
  ) THEN
    ALTER TABLE neta_ops.field_equipment
      ADD CONSTRAINT field_equipment_division_not_aggregate
      CHECK (division IS NULL OR division <> 'field_tech');
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_field_equipment_division
  ON neta_ops.field_equipment (division)
  WHERE division IS NOT NULL;

COMMENT ON COLUMN neta_ops.field_equipment.division IS
  'Division (common.divisions.id) where the item is being used now. NULL = not assigned yet. Changes when the item moves to another office.';

NOTIFY pgrst, 'reload schema';
