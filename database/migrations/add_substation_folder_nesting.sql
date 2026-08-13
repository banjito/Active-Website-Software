-- Folders *inside* a substation, to any depth.
--
-- Run AFTER create_substation_folders.sql. Safe to re-run.
--
-- The first migration gave substations a folder above them. This gives each substation its
-- own folder system underneath:
--
--   Folder -> Substation -> Folder -> Folder -> ... -> Report / Asset
--
-- Two columns do it, both on the existing table:
--
--   substation_key   NULL = a folder that holds substations (everything created so far).
--                    Set  = a folder that lives inside that substation and holds items.
--   parent_folder_id NULL = top of its level. Set = nested inside another folder.
--
-- WHY ITEM MEMBERSHIP IS KEYED BY ID, NOT NAME
-- The outer level had no choice but to key on the substation's name, because substation
-- isn't an entity (see create_substation_folders.sql). Reports and equipment assets *are*
-- real rows with real ids, so this level keys on those ids instead. Renaming a report
-- can't unfile it, and the FK cleans up after a deletion on its own.
--
-- Existing folders are untouched: substation_key and parent_folder_id both default NULL,
-- which is exactly what they already mean.

-- ── Nesting columns ───────────────────────────────────────────────────────────
ALTER TABLE neta_ops.substation_folders
  ADD COLUMN IF NOT EXISTS substation_key   TEXT,
  ADD COLUMN IF NOT EXISTS parent_folder_id UUID REFERENCES neta_ops.substation_folders(id) ON DELETE CASCADE;

-- ── Uniqueness, reworked ──────────────────────────────────────────────────────
-- A name now only has to be unique among its siblings: "Relays" can exist inside every
-- substation on the job. The old indexes were scope+name and would have blocked that.
--
-- COALESCE rather than bare columns because NULLs never conflict in a unique index, so
-- without it two top-level folders called "Building A" would both be allowed.
DROP INDEX IF EXISTS neta_ops.idx_substation_folders_site_name;
DROP INDEX IF EXISTS neta_ops.idx_substation_folders_job_name;

CREATE UNIQUE INDEX IF NOT EXISTS idx_substation_folders_site_sibling_name
  ON neta_ops.substation_folders (
    site_id,
    COALESCE(substation_key, ''),
    COALESCE(parent_folder_id, '00000000-0000-0000-0000-000000000000'::uuid),
    lower(name)
  )
  WHERE job_id IS NULL AND deleted_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_substation_folders_job_sibling_name
  ON neta_ops.substation_folders (
    job_id,
    COALESCE(substation_key, ''),
    COALESCE(parent_folder_id, '00000000-0000-0000-0000-000000000000'::uuid),
    lower(name)
  )
  WHERE site_id IS NULL AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_substation_folders_parent
  ON neta_ops.substation_folders (parent_folder_id) WHERE parent_folder_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_substation_folders_substation
  ON neta_ops.substation_folders (substation_key) WHERE substation_key IS NOT NULL;

-- ── Cycle guard ───────────────────────────────────────────────────────────────
-- Arbitrary depth is fine; a folder that contains itself is not. A dragged folder dropped
-- onto its own descendant would otherwise vanish from the tree and take its contents with
-- it, with no error and no way back through the UI.
CREATE OR REPLACE FUNCTION neta_ops.check_substation_folder_cycle()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  cursor_id UUID := NEW.parent_folder_id;
  hops INT := 0;
BEGIN
  WHILE cursor_id IS NOT NULL LOOP
    IF cursor_id = NEW.id THEN
      RAISE EXCEPTION 'Folder % cannot be nested inside itself', NEW.id;
    END IF;
    hops := hops + 1;
    IF hops > 100 THEN
      RAISE EXCEPTION 'Folder nesting is too deep or already contains a cycle';
    END IF;
    SELECT parent_folder_id INTO cursor_id
      FROM neta_ops.substation_folders WHERE id = cursor_id;
  END LOOP;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS check_substation_folder_cycle ON neta_ops.substation_folders;
CREATE TRIGGER check_substation_folder_cycle
  BEFORE INSERT OR UPDATE OF parent_folder_id ON neta_ops.substation_folders
  FOR EACH ROW WHEN (NEW.parent_folder_id IS NOT NULL)
  EXECUTE FUNCTION neta_ops.check_substation_folder_cycle();

-- ── neta_ops.folder_item_assignments ──────────────────────────────────────────
-- What sits in an in-substation folder: a report document, or a piece of equipment.
-- One table with two nullable ids rather than two tables, so the folder tree has a single
-- place to look and one set of policies to keep in step.
CREATE TABLE IF NOT EXISTS neta_ops.folder_item_assignments (
  id                 UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  folder_id          UUID        NOT NULL REFERENCES neta_ops.substation_folders(id) ON DELETE CASCADE,
  asset_id           UUID        REFERENCES neta_ops.assets(id) ON DELETE CASCADE,
  equipment_asset_id UUID        REFERENCES neta_ops.equipment_assets(id) ON DELETE CASCADE,
  sort_order         INTEGER     NOT NULL DEFAULT 0,
  created_by         UUID        REFERENCES auth.users(id),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT folder_item_assignments_one_kind CHECK (num_nonnulls(asset_id, equipment_asset_id) = 1)
);

-- An item is in at most one folder. Filing it somewhere else replaces the row.
CREATE UNIQUE INDEX IF NOT EXISTS idx_folder_items_asset
  ON neta_ops.folder_item_assignments (asset_id) WHERE asset_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_folder_items_equipment_asset
  ON neta_ops.folder_item_assignments (equipment_asset_id) WHERE equipment_asset_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_folder_items_folder
  ON neta_ops.folder_item_assignments (folder_id);

DROP TRIGGER IF EXISTS set_updated_at_folder_item_assignments ON neta_ops.folder_item_assignments;
CREATE TRIGGER set_updated_at_folder_item_assignments
  BEFORE UPDATE ON neta_ops.folder_item_assignments
  FOR EACH ROW EXECUTE FUNCTION neta_ops.update_updated_at_column();

-- ── RLS ───────────────────────────────────────────────────────────────────────
ALTER TABLE neta_ops.folder_item_assignments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Employees can manage folder item assignments" ON neta_ops.folder_item_assignments;
CREATE POLICY "Employees can manage folder item assignments"
ON neta_ops.folder_item_assignments FOR ALL
USING (common.is_employee_user())
WITH CHECK (common.is_employee_user());

GRANT SELECT, INSERT, UPDATE, DELETE ON neta_ops.folder_item_assignments TO authenticated, service_role;

-- ── Comments ──────────────────────────────────────────────────────────────────
COMMENT ON COLUMN neta_ops.substation_folders.substation_key IS 'NULL: a folder holding substations. Set: a folder living inside that substation, holding reports/equipment. Same normalisation as substation_folder_assignments.substation_key.';
COMMENT ON COLUMN neta_ops.substation_folders.parent_folder_id IS 'Nesting, to any depth, guarded against cycles by check_substation_folder_cycle(). NULL means top of its level.';
COMMENT ON TABLE  neta_ops.folder_item_assignments IS 'Reports and equipment assets filed into an in-substation folder. Keyed by real row ids, unlike the substation level which has only names to work with — so renaming an item cannot unfile it.';
COMMENT ON COLUMN neta_ops.folder_item_assignments.asset_id IS 'A report document (neta_ops.assets). Exactly one of asset_id/equipment_asset_id is set.';
COMMENT ON COLUMN neta_ops.folder_item_assignments.equipment_asset_id IS 'A piece of equipment (neta_ops.equipment_assets). Exactly one of asset_id/equipment_asset_id is set.';
