-- Device catalog: reference data imported from SKM PowerTools (PTW.LIB) protective-device
-- library. ~11.3k devices (breakers, fuses, relays, motor protection, ground fault, etc.)
-- across every major manufacturer. Used to autofill equipment/asset nameplate data
-- (manufacturer, model/series, rating, catalog category) when techs enter equipment in ampOS.
--
-- This is READ-MOSTLY reference data shared across all instances/users. Rows are loaded by an
-- ETL (scripts/load-device-catalog.mjs) using the service role; the app only reads.
-- Re-running the ETL upserts on dedup_key, so a newer PTW.LIB refreshes the catalog in place.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ── Table ──────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS common.device_catalog (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dedup_key        TEXT NOT NULL UNIQUE,          -- md5 of source fields; upsert target
  device_class     TEXT,                          -- PTW 2-letter class code (DB, FU, RM, ...)
  manufacturer     TEXT NOT NULL,
  display_name     TEXT,                          -- "ABB LS 600A, 3 Pole, Magnetic Only, DC"
  rating           TEXT,                          -- frame/rating/pole text
  series           TEXT,                          -- type/series (e.g. "LS", "Formula A1")
  model_code       TEXT,
  notes            TEXT,
  ptw_category     TEXT,                          -- "Low Voltage Breakers - Thermal Magnetic..."
  source           TEXT NOT NULL DEFAULT 'PTW.LIB',
  source_modified  TEXT,                          -- original PTW modified-date string
  raw_fields       JSONB,                         -- all original decoded fields, nothing lost
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Search indexes (typeahead / autofill) ───────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_device_catalog_manufacturer_trgm
  ON common.device_catalog USING gin (manufacturer gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_device_catalog_display_trgm
  ON common.device_catalog USING gin (display_name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_device_catalog_manufacturer
  ON common.device_catalog (manufacturer);
CREATE INDEX IF NOT EXISTS idx_device_catalog_category
  ON common.device_catalog (ptw_category);

-- ── RLS ──────────────────────────────────────────────────────────────────────
-- Any signed-in employee may read the catalog. Writes happen via service_role (ETL) only.
ALTER TABLE common.device_catalog ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Employees can read device catalog" ON common.device_catalog;
CREATE POLICY "Employees can read device catalog"
ON common.device_catalog
FOR SELECT
USING (common.is_employee_user());

GRANT SELECT ON common.device_catalog TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON common.device_catalog TO service_role;

-- ── Search RPC ───────────────────────────────────────────────────────────────
-- Autofill helper: fuzzy match on manufacturer + display_name, ranked by similarity.
-- Optional p_manufacturer narrows results once a manufacturer is chosen on the form.
CREATE OR REPLACE FUNCTION common.search_device_catalog(
  p_query        TEXT,
  p_manufacturer TEXT DEFAULT NULL,
  p_limit        INT  DEFAULT 20
)
RETURNS TABLE (
  id            UUID,
  device_class  TEXT,
  manufacturer  TEXT,
  display_name  TEXT,
  rating        TEXT,
  series        TEXT,
  model_code    TEXT,
  ptw_category  TEXT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = common, public
AS $$
  SELECT dc.id, dc.device_class, dc.manufacturer, dc.display_name,
         dc.rating, dc.series, dc.model_code, dc.ptw_category
  FROM common.device_catalog dc
  WHERE (p_manufacturer IS NULL OR dc.manufacturer ILIKE p_manufacturer)
    AND (
      coalesce(btrim(p_query), '') = ''
      OR dc.display_name ILIKE '%' || p_query || '%'
      OR dc.manufacturer ILIKE '%' || p_query || '%'
      OR similarity(dc.display_name, p_query) > 0.15
    )
  ORDER BY similarity(dc.display_name, coalesce(p_query, '')) DESC,
           dc.manufacturer, dc.display_name
  LIMIT least(greatest(p_limit, 1), 100);
$$;

GRANT EXECUTE ON FUNCTION common.search_device_catalog(TEXT, TEXT, INT) TO authenticated;

COMMENT ON TABLE common.device_catalog IS
  'SKM PowerTools (PTW.LIB) protective-device library, ~11.3k devices; reference data for equipment/asset autofill. Loaded via scripts/load-device-catalog.mjs.';
