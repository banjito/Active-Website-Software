-- Asset Tracking, Phase 1 — a real equipment registry for NETA project management.
--
-- Until now there was no way to record a piece of equipment without creating and saving a
-- report: `neta_ops.assets` is a *document pointer* (name + file_url =
-- "report:/jobs/{jobId}/{slug}/{reportId}"), and equipment identity was crammed into the
-- name string as "<Report Type> - <identifier>", then re-parsed at page load.
--
-- This migration adds the missing entities:
--
--   common.sites                  a facility (e.g. "QTS ATL2")
--   neta_ops.equipment_assets     a physical piece of equipment at that site
--   neta_ops.job_equipment_assets which of a site's assets a given job covers
--   neta_ops.equipment_types      saved suggestions for the free-text equipment type
--   neta_ops.jobs.site_id         which facility a job is at
--   neta_ops.assets.equipment_asset_id   links a report document to the equipment
--
-- HIERARCHY: Site -> Asset. Customer is deliberately NOT in this path. AMP has worked for
-- multiple customers at the same jobsite on the same equipment, so an asset belongs to a
-- site only. Customer stays on the job (neta_ops.jobs.customer_id), a project-specific
-- variable. Two jobs at ATL2 for two different customers share one ATL2 asset list.
--
-- Safe to re-run. Existing jobs, reports and the current Reports tab are untouched:
-- every new column is nullable and defaults to NULL.

-- ── common.sites — facilities, standalone (no customer FK, by design) ──────────
CREATE TABLE IF NOT EXISTS common.sites (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT        NOT NULL,           -- 'QTS ATL2'
  address     TEXT,
  city        TEXT,
  state       TEXT,
  notes       TEXT,
  status      TEXT        NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive')),
  created_by  UUID        REFERENCES auth.users(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Stops "ATL2" from being created five times, which is the duplicate-site problem this
-- whole feature exists to kill. City/state are in the key so "Building A" can exist in
-- two different towns.
CREATE UNIQUE INDEX IF NOT EXISTS idx_sites_unique_name
  ON common.sites (lower(name), lower(COALESCE(city, '')), lower(COALESCE(state, '')));

CREATE INDEX IF NOT EXISTS idx_sites_name ON common.sites (name);

-- ── neta_ops.equipment_assets — the registry ──────────────────────────────────
-- Named to avoid collision with the three similarly-named existing tables:
--   neta_ops.assets      = report documents
--   neta_ops.job_assets  = job <-> report-document link
--   neta_ops.equipment   = AMP's own tool/test-equipment inventory
CREATE TABLE IF NOT EXISTS neta_ops.equipment_assets (
  id                 UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id            UUID        NOT NULL REFERENCES common.sites(id) ON DELETE RESTRICT,
  building_area      TEXT,                    -- 'DC7'
  substation         TEXT,                    -- 'Substation 3'
  identifier         TEXT        NOT NULL,    -- 'CB-101'
  equipment_location TEXT,                    -- 'Electrical Room 2'
  equipment_type     TEXT,                    -- free text, see equipment_types below
  manufacturer       TEXT,
  model              TEXT,
  serial_number      TEXT,
  notes              TEXT,
  status             TEXT        NOT NULL DEFAULT 'active' CHECK (status IN ('active','removed')),
  created_by         UUID        REFERENCES auth.users(id),
  updated_by         UUID        REFERENCES auth.users(id),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at         TIMESTAMPTZ
);

-- One CB-101 per substation per building per site. Soft-deleted rows drop out of the key
-- so an identifier can be reused after removal.
CREATE UNIQUE INDEX IF NOT EXISTS idx_equipment_assets_unique_identifier
  ON neta_ops.equipment_assets (
    site_id,
    COALESCE(building_area, ''),
    COALESCE(substation, ''),
    lower(identifier)
  )
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_equipment_assets_site_id    ON neta_ops.equipment_assets (site_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_equipment_assets_substation ON neta_ops.equipment_assets (site_id, substation) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_equipment_assets_type       ON neta_ops.equipment_assets (equipment_type) WHERE deleted_at IS NULL;

-- ── neta_ops.job_equipment_assets — the per-project skeleton ───────────────────
-- An asset lives at the site forever; a job covers a subset of it.
CREATE TABLE IF NOT EXISTS neta_ops.job_equipment_assets (
  id                 UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id             UUID        NOT NULL REFERENCES neta_ops.jobs(id) ON DELETE CASCADE,
  equipment_asset_id UUID        NOT NULL REFERENCES neta_ops.equipment_assets(id) ON DELETE CASCADE,
  created_by         UUID        REFERENCES auth.users(id),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (job_id, equipment_asset_id)
);

CREATE INDEX IF NOT EXISTS idx_job_equipment_assets_job_id ON neta_ops.job_equipment_assets (job_id);
CREATE INDEX IF NOT EXISTS idx_job_equipment_assets_asset_id ON neta_ops.job_equipment_assets (equipment_asset_id);

-- ── neta_ops.equipment_types — saved autocomplete suggestions ─────────────────
-- Same free-text-with-saved-suggestions pattern as neta_ops.neta_sections and
-- neta_ops.equipment_locations: the user can type anything, and new values are saved
-- back here so the next person picks the same wording.
CREATE TABLE IF NOT EXISTS neta_ops.equipment_types (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT        NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO neta_ops.equipment_types (name) VALUES
  ('Low Voltage Circuit Breaker'),
  ('Medium Voltage Circuit Breaker'),
  ('Low Voltage Switch'),
  ('Medium Voltage Switch'),
  ('Switchgear'),
  ('Switchboard'),
  ('Panelboard'),
  ('Dry Type Transformer'),
  ('Large Dry Type Transformer'),
  ('Liquid Filled Transformer'),
  ('Automatic Transfer Switch'),
  ('Low Voltage Cable'),
  ('Medium Voltage Cable'),
  ('Metal Enclosed Busway'),
  ('Current Transformer'),
  ('Potential Transformer'),
  ('Protective Relay'),
  ('Motor Starter'),
  ('Motor Control Center'),
  ('Engine Generator'),
  ('Grounding System'),
  ('UPS'),
  ('Capacitor Bank'),
  ('Surge Protective Device')
ON CONFLICT (name) DO NOTHING;

-- ── neta_ops.jobs.site_id — which facility a job is at ─────────────────────────
ALTER TABLE neta_ops.jobs
  ADD COLUMN IF NOT EXISTS site_id UUID REFERENCES common.sites(id);

CREATE INDEX IF NOT EXISTS idx_jobs_site_id ON neta_ops.jobs (site_id) WHERE site_id IS NOT NULL;

-- ── neta_ops.assets.equipment_asset_id — report document -> equipment ─────────
-- ON DELETE RESTRICT is what enforces "you cannot delete an asset that has a linked
-- report" in the database, not just in the UI.
ALTER TABLE neta_ops.assets
  ADD COLUMN IF NOT EXISTS equipment_asset_id UUID REFERENCES neta_ops.equipment_assets(id) ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS idx_assets_equipment_asset_id
  ON neta_ops.assets (equipment_asset_id) WHERE equipment_asset_id IS NOT NULL;

-- ── updated_at triggers ───────────────────────────────────────────────────────
DROP TRIGGER IF EXISTS set_updated_at_sites ON common.sites;
CREATE TRIGGER set_updated_at_sites
  BEFORE UPDATE ON common.sites
  FOR EACH ROW EXECUTE FUNCTION common.update_updated_at_column();

DROP TRIGGER IF EXISTS set_updated_at_equipment_assets ON neta_ops.equipment_assets;
CREATE TRIGGER set_updated_at_equipment_assets
  BEFORE UPDATE ON neta_ops.equipment_assets
  FOR EACH ROW EXECUTE FUNCTION neta_ops.update_updated_at_column();

-- ── RLS ───────────────────────────────────────────────────────────────────────
-- Employee-only for now. A site is shared across customers, so this registry must never
-- be exposed to the customer portal without per-customer scoping first.
ALTER TABLE common.sites                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE neta_ops.equipment_assets      ENABLE ROW LEVEL SECURITY;
ALTER TABLE neta_ops.job_equipment_assets  ENABLE ROW LEVEL SECURITY;
ALTER TABLE neta_ops.equipment_types       ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Employees can manage sites" ON common.sites;
CREATE POLICY "Employees can manage sites"
ON common.sites FOR ALL
USING (common.is_employee_user())
WITH CHECK (common.is_employee_user());

DROP POLICY IF EXISTS "Employees can manage equipment assets" ON neta_ops.equipment_assets;
CREATE POLICY "Employees can manage equipment assets"
ON neta_ops.equipment_assets FOR ALL
USING (common.is_employee_user())
WITH CHECK (common.is_employee_user());

DROP POLICY IF EXISTS "Employees can manage job equipment assets" ON neta_ops.job_equipment_assets;
CREATE POLICY "Employees can manage job equipment assets"
ON neta_ops.job_equipment_assets FOR ALL
USING (common.is_employee_user())
WITH CHECK (common.is_employee_user());

DROP POLICY IF EXISTS "Employees can manage equipment types" ON neta_ops.equipment_types;
CREATE POLICY "Employees can manage equipment types"
ON neta_ops.equipment_types FOR ALL
USING (common.is_employee_user())
WITH CHECK (common.is_employee_user());

GRANT SELECT, INSERT, UPDATE, DELETE ON common.sites                  TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON neta_ops.equipment_assets     TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON neta_ops.job_equipment_assets TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON neta_ops.equipment_types      TO authenticated, service_role;

-- ── Comments ──────────────────────────────────────────────────────────────────
COMMENT ON TABLE  common.sites IS 'Customer facilities/jobsites (e.g. "QTS ATL2"). Deliberately has no customer FK: AMP works for multiple customers at the same site on the same equipment, so site identity is independent of who is paying.';
COMMENT ON TABLE  neta_ops.equipment_assets IS 'Physical equipment at a site. The real asset registry — distinct from neta_ops.assets (report documents) and neta_ops.equipment (AMP tool inventory). Can be created as a placeholder before any report exists.';
COMMENT ON COLUMN neta_ops.equipment_assets.building_area IS 'Building / data hall / area within the site, e.g. "DC7". Free text, not a hierarchy level.';
COMMENT ON TABLE  neta_ops.job_equipment_assets IS 'Which of a site''s equipment assets a given job covers — the project asset skeleton. Lets two jobs at the same site (even for different customers) share one asset list.';
COMMENT ON TABLE  neta_ops.equipment_types IS 'Saved suggestions for the free-text equipment_type field on equipment_assets. Same pattern as neta_ops.neta_sections.';
COMMENT ON COLUMN neta_ops.jobs.site_id IS 'Facility this job is at. Independent of customer_id — the same site can be worked for different customers.';
COMMENT ON COLUMN neta_ops.assets.equipment_asset_id IS 'The physical equipment this report document describes. ON DELETE RESTRICT enforces "cannot delete an equipment asset that has linked reports".';
