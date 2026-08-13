-- Substation Folders — one grouping level above substation.
--
-- The Reports tab renders one accordion per substation, alphabetically, with "Imported"
-- pinned first and "Other" pinned last. On a job with twenty substations that is a wall of
-- identical headings and no way to say "these four are Building A, those three are the
-- Phase 2 outage". This migration adds the missing level:
--
--   Folder -> Substation -> Report
--
-- WHY MEMBERSHIP IS KEYED BY NAME, NOT BY ID
-- "Substation" is not an entity in this database and never has been. There is no
-- substations table and no substation_id. It is free text in four independent places:
--   neta_ops.assets.substation            (written for PDF/file uploads)
--   neta_ops.equipment_assets.substation  (part of the equipment uniqueness key)
--   each report table's jsonb             (~6 different key spellings)
--   the URL path                          (grounding reports: /jobs/:id/:slug/:sub/:reportId)
-- The Reports tab reconciles all four at render time. Giving substations real ids would
-- mean a data migration across every report table, which is explicitly out of scope: this
-- feature must be able to categorise what already exists without touching any of it.
-- So a folder holds normalised substation *names*.
--
-- NOTHING EXISTING IS TOUCHED. No column is altered, no row is written, no report or asset
-- is moved. Before anyone creates a folder, every screen renders exactly as it did before
-- this file was run. Safe to re-run.

-- ── neta_ops.substation_folders ───────────────────────────────────────────────
-- A folder belongs to exactly one scope: a site or a job.
--   site scope  -> inherited by every job whose neta_ops.jobs.site_id matches
--   job scope   -> that job only
CREATE TABLE IF NOT EXISTS neta_ops.substation_folders (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id    UUID        REFERENCES common.sites(id)  ON DELETE CASCADE,
  job_id     UUID        REFERENCES neta_ops.jobs(id) ON DELETE CASCADE,
  name       TEXT        NOT NULL,
  sort_order INTEGER     NOT NULL DEFAULT 0,
  created_by UUID        REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CONSTRAINT substation_folders_one_scope CHECK (num_nonnulls(site_id, job_id) = 1)
);

-- Case-insensitive, so "Building A" and "building a" cannot both exist in one scope.
CREATE UNIQUE INDEX IF NOT EXISTS idx_substation_folders_site_name
  ON neta_ops.substation_folders (site_id, lower(name))
  WHERE job_id IS NULL AND deleted_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_substation_folders_job_name
  ON neta_ops.substation_folders (job_id, lower(name))
  WHERE site_id IS NULL AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_substation_folders_site
  ON neta_ops.substation_folders (site_id) WHERE site_id IS NOT NULL AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_substation_folders_job
  ON neta_ops.substation_folders (job_id) WHERE job_id IS NOT NULL AND deleted_at IS NULL;

-- ── neta_ops.substation_folder_assignments ────────────────────────────────────
-- Which substation sits in which folder. The scope lives here as well as on the folder,
-- and that is the whole trick:
--
--   * A job-scoped assignment can point at a *site* folder, so dragging a substation into
--     an inherited folder does not clone the folder into the job.
--   * A job-scoped assignment with folder_id IS NULL means "deliberately pulled out of the
--     folder this job inherited from its site". Without it there is no way to ungroup one
--     substation in one job without changing the site for everybody.
CREATE TABLE IF NOT EXISTS neta_ops.substation_folder_assignments (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id          UUID        REFERENCES common.sites(id)  ON DELETE CASCADE,
  job_id           UUID        REFERENCES neta_ops.jobs(id) ON DELETE CASCADE,
  substation_key   TEXT        NOT NULL,
  substation_label TEXT        NOT NULL,
  folder_id        UUID        REFERENCES neta_ops.substation_folders(id) ON DELETE CASCADE,
  sort_order       INTEGER     NOT NULL DEFAULT 0,
  created_by       UUID        REFERENCES auth.users(id),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT substation_folder_assignments_one_scope CHECK (num_nonnulls(site_id, job_id) = 1)
);

-- These two indexes are what enforce "a substation is in at most one folder per scope".
-- No trigger needed, and they double as the ON CONFLICT target for the drag-to-folder write.
CREATE UNIQUE INDEX IF NOT EXISTS idx_sfa_site_substation
  ON neta_ops.substation_folder_assignments (site_id, substation_key)
  WHERE job_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_sfa_job_substation
  ON neta_ops.substation_folder_assignments (job_id, substation_key)
  WHERE site_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_sfa_folder
  ON neta_ops.substation_folder_assignments (folder_id) WHERE folder_id IS NOT NULL;

-- ── updated_at triggers ───────────────────────────────────────────────────────
DROP TRIGGER IF EXISTS set_updated_at_substation_folders ON neta_ops.substation_folders;
CREATE TRIGGER set_updated_at_substation_folders
  BEFORE UPDATE ON neta_ops.substation_folders
  FOR EACH ROW EXECUTE FUNCTION neta_ops.update_updated_at_column();

DROP TRIGGER IF EXISTS set_updated_at_substation_folder_assignments ON neta_ops.substation_folder_assignments;
CREATE TRIGGER set_updated_at_substation_folder_assignments
  BEFORE UPDATE ON neta_ops.substation_folder_assignments
  FOR EACH ROW EXECUTE FUNCTION neta_ops.update_updated_at_column();

-- ── RLS ───────────────────────────────────────────────────────────────────────
-- Employee-only, same as the rest of the asset registry. The customer portal reads folders
-- through common.customer_substation_folders() (SECURITY DEFINER, scoped by
-- common.current_customer_id()) rather than by being granted access to these tables — a
-- site is shared across customers, so folder names must never leak sideways.
ALTER TABLE neta_ops.substation_folders             ENABLE ROW LEVEL SECURITY;
ALTER TABLE neta_ops.substation_folder_assignments  ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Employees can manage substation folders" ON neta_ops.substation_folders;
CREATE POLICY "Employees can manage substation folders"
ON neta_ops.substation_folders FOR ALL
USING (common.is_employee_user())
WITH CHECK (common.is_employee_user());

DROP POLICY IF EXISTS "Employees can manage substation folder assignments" ON neta_ops.substation_folder_assignments;
CREATE POLICY "Employees can manage substation folder assignments"
ON neta_ops.substation_folder_assignments FOR ALL
USING (common.is_employee_user())
WITH CHECK (common.is_employee_user());

GRANT SELECT, INSERT, UPDATE, DELETE ON neta_ops.substation_folders            TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON neta_ops.substation_folder_assignments TO authenticated, service_role;

-- ── Comments ──────────────────────────────────────────────────────────────────
COMMENT ON TABLE  neta_ops.substation_folders IS 'One grouping level above substation: Folder -> Substation -> Report. Purely organisational, free-text names. Scoped to a site (inherited by that site''s jobs) or to a single job.';
COMMENT ON COLUMN neta_ops.substation_folders.site_id IS 'Site scope. Folders here are inherited by every job whose neta_ops.jobs.site_id matches. Exactly one of site_id/job_id is set.';
COMMENT ON COLUMN neta_ops.substation_folders.job_id IS 'Job scope. Folders here apply to that job only. Exactly one of site_id/job_id is set.';
COMMENT ON COLUMN neta_ops.substation_folders.sort_order IS 'Display order, set by dragging folders. Ties broken by name.';
COMMENT ON COLUMN neta_ops.substation_folders.deleted_at IS 'Soft delete. Deleting a folder cascades its assignments away, so its substations fall back to ungrouped — it never touches a report or an asset.';

COMMENT ON TABLE  neta_ops.substation_folder_assignments IS 'Which substation is in which folder. Keyed by normalised substation NAME because substation is not an entity in this database — see the header of create_substation_folders.sql.';
COMMENT ON COLUMN neta_ops.substation_folder_assignments.substation_key IS 'lower(regexp_replace(btrim(name), ''\s+'', '' '', ''g'')). Computed client-side by substationKey() in src/utils/substationFolders.ts; both sides must agree. No fuzzy matching: "Sub 3" and "Substation 3" stay two different substations, exactly as they are today.';
COMMENT ON COLUMN neta_ops.substation_folder_assignments.substation_label IS 'The name as typed, kept for display so a folder can list a substation that has no reports on the current job.';
COMMENT ON COLUMN neta_ops.substation_folder_assignments.folder_id IS 'NULL is meaningful on a job-scoped row: it means this substation was deliberately pulled out of the folder the job inherited from its site.';
