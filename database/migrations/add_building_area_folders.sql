-- Building / Area folders — the level above substation on the asset list.
--
-- Run AFTER create_substation_folders.sql and add_substation_folder_nesting.sql.
-- Safe to re-run.
--
-- The first two migrations gave the Reports tab this shape:
--
--   Folder -> Substation -> Folder -> ... -> Report / Asset
--
-- The asset list needs one more level above it, because equipment is walked up to by
-- building before it is walked up to by substation:
--
--   Folder -> Building / Area -> Folder -> Substation -> Folder -> ... -> Asset
--
-- Building / Area is already a column on neta_ops.equipment_assets, so the *level* itself
-- needs no new storage — it is grouped from the data the same way substation is. What is
-- new is the custom folder that holds buildings, and the ability to say that a
-- substation-holding folder belongs to one building rather than floating above all of them.
--
-- WHY MEMBERSHIP IS KEYED BY NAME AGAIN
-- Same reason as substation (see create_substation_folders.sql): "Building / Area" is free
-- text on the equipment row, not an entity. A folder therefore holds normalised building
-- *names*, with the identical normalisation the substation level uses.
--
-- NOTHING EXISTING IS TOUCHED. Every folder that exists today keeps its meaning: it is a
-- folder that holds substations, floating above every building, which is exactly what
-- level='substation' + building_key IS NULL says. Before anyone creates a building folder,
-- every screen renders what it rendered before.

-- ── What a folder holds ───────────────────────────────────────────────────────
-- One table now backs three levels, so the row has to say which one it is at. Before this
-- migration substation_key carried that implicitly (NULL = holds substations, set = holds
-- items) and there was no third state to confuse it with. A folder holding *buildings* has
-- no substation_key either, so the discriminator has to become explicit.
--
--   level = 'building'    holds Building / Area names   (building_folder_assignments)
--   level = 'substation'  holds substation names        (substation_folder_assignments)
--   level = 'item'        holds reports / equipment     (folder_item_assignments)
--
-- building_key is only meaningful on a 'substation' folder: it pins that folder inside one
-- building, so a freshly created — and therefore empty — folder still has somewhere to
-- render. NULL keeps the pre-migration behaviour of floating above every building.
ALTER TABLE neta_ops.substation_folders
  ADD COLUMN IF NOT EXISTS level        TEXT,
  ADD COLUMN IF NOT EXISTS building_key TEXT;

UPDATE neta_ops.substation_folders
   SET level = CASE WHEN substation_key IS NULL THEN 'substation' ELSE 'item' END
 WHERE level IS NULL;

-- Filled by a trigger rather than a column DEFAULT, deliberately.
--
-- A browser tab holding a bundle from before this migration still inserts folders without
-- a level. A DEFAULT of 'substation' would stamp the wrong one on a folder that carries a
-- substation_key, and the level/key check below would then reject a write that used to
-- work. The trigger reads substation_key and gets it right for both clients, so the
-- migration can be applied without waiting for every session to reload.
CREATE OR REPLACE FUNCTION neta_ops.set_substation_folder_level()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.level IS NULL THEN
    NEW.level := CASE WHEN NEW.substation_key IS NULL THEN 'substation' ELSE 'item' END;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_substation_folder_level ON neta_ops.substation_folders;
CREATE TRIGGER set_substation_folder_level
  BEFORE INSERT OR UPDATE OF level, substation_key ON neta_ops.substation_folders
  FOR EACH ROW EXECUTE FUNCTION neta_ops.set_substation_folder_level();

-- Safe only after the trigger exists: BEFORE triggers run ahead of the NOT NULL check.
ALTER TABLE neta_ops.substation_folders
  ALTER COLUMN level DROP DEFAULT;

ALTER TABLE neta_ops.substation_folders
  ALTER COLUMN level SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'substation_folders_level_check'
  ) THEN
    ALTER TABLE neta_ops.substation_folders
      ADD CONSTRAINT substation_folders_level_check
      CHECK (level IN ('building', 'substation', 'item'));
  END IF;

  -- level and substation_key must agree. Without this a folder could claim to hold
  -- buildings while carrying a substation_key, and it would then be invisible at both
  -- levels — filed items included.
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'substation_folders_level_key_check'
  ) THEN
    ALTER TABLE neta_ops.substation_folders
      ADD CONSTRAINT substation_folders_level_key_check
      CHECK ((level = 'item') = (substation_key IS NOT NULL));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'substation_folders_building_key_check'
  ) THEN
    ALTER TABLE neta_ops.substation_folders
      ADD CONSTRAINT substation_folders_building_key_check
      CHECK (building_key IS NULL OR level = 'substation');
  END IF;
END $$;

-- ── Uniqueness, reworked again ────────────────────────────────────────────────
-- A name is unique among its siblings, and siblings are now also separated by level and by
-- which building a folder is pinned inside. That is what lets "Building A" exist as a
-- folder of buildings and, independently, "Relays" exist inside Sub 1 in two buildings.
--
-- COALESCE rather than bare columns because NULLs never conflict in a unique index.
DROP INDEX IF EXISTS neta_ops.idx_substation_folders_site_sibling_name;
DROP INDEX IF EXISTS neta_ops.idx_substation_folders_job_sibling_name;

CREATE UNIQUE INDEX IF NOT EXISTS idx_substation_folders_site_sibling_name
  ON neta_ops.substation_folders (
    site_id,
    level,
    COALESCE(building_key, ''),
    COALESCE(substation_key, ''),
    COALESCE(parent_folder_id, '00000000-0000-0000-0000-000000000000'::uuid),
    lower(name)
  )
  WHERE job_id IS NULL AND deleted_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_substation_folders_job_sibling_name
  ON neta_ops.substation_folders (
    job_id,
    level,
    COALESCE(building_key, ''),
    COALESCE(substation_key, ''),
    COALESCE(parent_folder_id, '00000000-0000-0000-0000-000000000000'::uuid),
    lower(name)
  )
  WHERE site_id IS NULL AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_substation_folders_building
  ON neta_ops.substation_folders (building_key) WHERE building_key IS NOT NULL;

-- ── neta_ops.building_folder_assignments ──────────────────────────────────────
-- Which Building / Area sits in which folder. A deliberate mirror of
-- substation_folder_assignments, down to the two-scope rule and the meaning of a NULL
-- folder_id on a job-scoped row ("deliberately pulled out of the folder this job inherited
-- from its site"). One table per level rather than one polymorphic table, so each level
-- keeps its own uniqueness guarantee in an index rather than in a trigger.
CREATE TABLE IF NOT EXISTS neta_ops.building_folder_assignments (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id        UUID        REFERENCES common.sites(id)  ON DELETE CASCADE,
  job_id         UUID        REFERENCES neta_ops.jobs(id) ON DELETE CASCADE,
  building_key   TEXT        NOT NULL,
  building_label TEXT        NOT NULL,
  folder_id      UUID        REFERENCES neta_ops.substation_folders(id) ON DELETE CASCADE,
  sort_order     INTEGER     NOT NULL DEFAULT 0,
  created_by     UUID        REFERENCES auth.users(id),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT building_folder_assignments_one_scope CHECK (num_nonnulls(site_id, job_id) = 1)
);

-- "A building is in at most one folder per scope", enforced by the index rather than a
-- trigger. Also the reason the write is delete-then-insert: these are partial indexes and
-- PostgREST cannot infer them for ON CONFLICT.
CREATE UNIQUE INDEX IF NOT EXISTS idx_bfa_site_building
  ON neta_ops.building_folder_assignments (site_id, building_key)
  WHERE job_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_bfa_job_building
  ON neta_ops.building_folder_assignments (job_id, building_key)
  WHERE site_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_bfa_folder
  ON neta_ops.building_folder_assignments (folder_id) WHERE folder_id IS NOT NULL;

DROP TRIGGER IF EXISTS set_updated_at_building_folder_assignments ON neta_ops.building_folder_assignments;
CREATE TRIGGER set_updated_at_building_folder_assignments
  BEFORE UPDATE ON neta_ops.building_folder_assignments
  FOR EACH ROW EXECUTE FUNCTION neta_ops.update_updated_at_column();

-- ── RLS ───────────────────────────────────────────────────────────────────────
-- Employee-only, same as the two levels below it. The customer portal groups by substation
-- and never reads this table, so nothing is granted to it here.
ALTER TABLE neta_ops.building_folder_assignments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Employees can manage building folder assignments" ON neta_ops.building_folder_assignments;
CREATE POLICY "Employees can manage building folder assignments"
ON neta_ops.building_folder_assignments FOR ALL
USING (common.is_employee_user())
WITH CHECK (common.is_employee_user());

GRANT SELECT, INSERT, UPDATE, DELETE ON neta_ops.building_folder_assignments TO authenticated, service_role;

-- ── Comments ──────────────────────────────────────────────────────────────────
COMMENT ON COLUMN neta_ops.substation_folders.level IS 'What this folder holds: building (Building / Area names), substation (substation names), item (reports and equipment). Must agree with substation_key, which is set only on item folders. Filled from substation_key by set_substation_folder_level() when an older client omits it.';
COMMENT ON COLUMN neta_ops.substation_folders.building_key IS 'Only on a substation-level folder: pins it inside that Building / Area so an empty one still has somewhere to render. NULL floats it above every building, which is what every folder created before this migration does.';

COMMENT ON TABLE  neta_ops.building_folder_assignments IS 'Which Building / Area is in which folder. Keyed by normalised building NAME for the same reason the substation level is — Building / Area is free text on neta_ops.equipment_assets, not an entity.';
COMMENT ON COLUMN neta_ops.building_folder_assignments.building_key IS 'lower(regexp_replace(btrim(name), ''\s+'', '' '', ''g'')). Computed client-side by groupKey() in src/utils/substationFolders.ts; both sides must agree.';
COMMENT ON COLUMN neta_ops.building_folder_assignments.building_label IS 'The name as typed, kept for display so a folder can list a building that has no equipment on the current job.';
COMMENT ON COLUMN neta_ops.building_folder_assignments.folder_id IS 'NULL is meaningful on a job-scoped row: the building was deliberately pulled out of the folder the job inherited from its site.';
