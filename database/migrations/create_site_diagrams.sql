-- Single-line diagrams — step 1 of the build plan: the three core tables.
--
--   Site -> Diagram -> Symbols + Lines
--
-- WHY THESE ARE NOT BUILT ON parent_asset_id
-- parent_asset_id means "is part of" and stops at one layer. A single line needs "feeds",
-- which runs many levels deep and can form loops through tie breakers. Connections are
-- their own rows so that "what feeds this asset" stays a plain query.
--
-- WHY THE SITE OWNS A DIAGRAM
-- Assets live at the site, and different customers work on the same equipment. Every job
-- at a site shares one set of drawings. Which reports show is decided by the screen, not
-- here: nothing in these tables refers to a job or a report.
--
-- Employee-only. There is deliberately no customer portal function for these tables:
-- diagrams are internal and are shared as PDFs.
--
-- Later steps add their own columns (archiving, revisions, sheet links, site colors).
--
-- NOTHING EXISTING IS TOUCHED. No column is altered and no row is written. Safe to re-run.

-- ── neta_ops.site_diagrams ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS neta_ops.site_diagrams (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id    UUID        NOT NULL REFERENCES common.sites(id) ON DELETE CASCADE,
  name       TEXT        NOT NULL,
  sort_order INTEGER     NOT NULL DEFAULT 0,
  created_by UUID        REFERENCES auth.users(id),
  updated_by UUID        REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CONSTRAINT site_diagrams_name_not_blank CHECK (btrim(name) <> '')
);

-- Case-insensitive, so "MV One-Line" and "mv one-line" cannot both exist at one site.
CREATE UNIQUE INDEX IF NOT EXISTS idx_site_diagrams_site_name
  ON neta_ops.site_diagrams (site_id, lower(name))
  WHERE deleted_at IS NULL;

-- ── neta_ops.diagram_symbols ──────────────────────────────────────────────────
-- One item drawn on a diagram. There are three states, read from asset_id and symbol_key:
--
--   asset_id set                  an asset. symbol_key NULL = use the site's symbol for
--                                 its equipment type; set = this item uses that symbol.
--   asset_id NULL, symbol_key set stand-alone item, such as a utility source or a bus.
--   both NULL                     its asset was permanently deleted. Shown as missing.
--
-- That third state is why there is no CHECK requiring one of the two. A CHECK would turn
-- the ON DELETE SET NULL below into an error and block the asset from being deleted.
--
-- Soft-deleted or moved assets keep their asset_id, so the screen can flag those as
-- missing too. The name always comes from the asset, so renames show up on their own.
CREATE TABLE IF NOT EXISTS neta_ops.diagram_symbols (
  id         UUID             PRIMARY KEY DEFAULT gen_random_uuid(),
  diagram_id UUID             NOT NULL REFERENCES neta_ops.site_diagrams(id) ON DELETE CASCADE,
  asset_id   UUID             REFERENCES neta_ops.equipment_assets(id) ON DELETE SET NULL,
  symbol_key TEXT,
  label      TEXT,
  x          DOUBLE PRECISION NOT NULL DEFAULT 0,
  y          DOUBLE PRECISION NOT NULL DEFAULT 0,
  width      DOUBLE PRECISION,
  height     DOUBLE PRECISION,
  created_by UUID             REFERENCES auth.users(id),
  created_at TIMESTAMPTZ      NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ      NOT NULL DEFAULT NOW(),
  -- The target of the composite foreign keys on diagram_lines.
  CONSTRAINT diagram_symbols_id_diagram_unique UNIQUE (id, diagram_id),
  CONSTRAINT diagram_symbols_size_positive CHECK (
    (width IS NULL OR width > 0) AND (height IS NULL OR height > 0)
  )
);

-- An asset can sit on many diagrams, which is how diagrams link, but only once on each.
CREATE UNIQUE INDEX IF NOT EXISTS idx_diagram_symbols_diagram_asset
  ON neta_ops.diagram_symbols (diagram_id, asset_id)
  WHERE asset_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_diagram_symbols_diagram
  ON neta_ops.diagram_symbols (diagram_id);

-- Finds every diagram an asset is on, for link tags and "Show on diagram".
CREATE INDEX IF NOT EXISTS idx_diagram_symbols_asset
  ON neta_ops.diagram_symbols (asset_id)
  WHERE asset_id IS NOT NULL;

-- ── neta_ops.diagram_lines ────────────────────────────────────────────────────
-- A connection between two symbols. "from" is the upstream end and "to" the downstream end.
--
-- The composite foreign keys are what guarantee both ends sit on this line's diagram, so
-- no trigger is needed for that rule.
CREATE TABLE IF NOT EXISTS neta_ops.diagram_lines (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  diagram_id     UUID        NOT NULL REFERENCES neta_ops.site_diagrams(id) ON DELETE CASCADE,
  from_symbol_id UUID        NOT NULL,
  to_symbol_id   UUID        NOT NULL,
  from_port      TEXT        NOT NULL DEFAULT 'bottom',
  to_port        TEXT        NOT NULL DEFAULT 'top',
  asset_id       UUID        REFERENCES neta_ops.equipment_assets(id) ON DELETE SET NULL,
  voltage_volts  NUMERIC,
  voltage_kind   TEXT        NOT NULL DEFAULT 'ac',
  label          TEXT,
  created_by     UUID        REFERENCES auth.users(id),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT diagram_lines_from_symbol_fk FOREIGN KEY (from_symbol_id, diagram_id)
    REFERENCES neta_ops.diagram_symbols (id, diagram_id) ON DELETE CASCADE,
  CONSTRAINT diagram_lines_to_symbol_fk FOREIGN KEY (to_symbol_id, diagram_id)
    REFERENCES neta_ops.diagram_symbols (id, diagram_id) ON DELETE CASCADE,
  CONSTRAINT diagram_lines_not_a_loop CHECK (from_symbol_id <> to_symbol_id),
  CONSTRAINT diagram_lines_voltage_positive CHECK (voltage_volts IS NULL OR voltage_volts > 0),
  CONSTRAINT diagram_lines_voltage_kind CHECK (voltage_kind IN ('ac', 'dc'))
);

CREATE INDEX IF NOT EXISTS idx_diagram_lines_diagram
  ON neta_ops.diagram_lines (diagram_id);

CREATE INDEX IF NOT EXISTS idx_diagram_lines_from_symbol
  ON neta_ops.diagram_lines (from_symbol_id);

CREATE INDEX IF NOT EXISTS idx_diagram_lines_to_symbol
  ON neta_ops.diagram_lines (to_symbol_id);

CREATE INDEX IF NOT EXISTS idx_diagram_lines_asset
  ON neta_ops.diagram_lines (asset_id)
  WHERE asset_id IS NOT NULL;

-- ── The same-site rule ────────────────────────────────────────────────────────
-- An asset can only be placed on a diagram at its own site. The rule applies when the link
-- is made, not afterward: an asset moved to another site must stay on the old diagram so it
-- can be flagged as missing. That is why an unchanged link passes.
--
-- AFTER, not BEFORE, on purpose. An upsert fires BEFORE INSERT even when the row already
-- exists, so a BEFORE trigger would reject every autosave of a moved asset's symbol. AFTER
-- INSERT only fires for a row that was really inserted.
CREATE OR REPLACE FUNCTION neta_ops.enforce_diagram_asset_same_site()
RETURNS TRIGGER AS $$
DECLARE
  diagram_site UUID;
  asset_site   UUID;
BEGIN
  IF NEW.asset_id IS NULL THEN
    RETURN NULL;
  END IF;

  IF TG_OP = 'UPDATE'
     AND NEW.asset_id IS NOT DISTINCT FROM OLD.asset_id
     AND NEW.diagram_id IS NOT DISTINCT FROM OLD.diagram_id THEN
    RETURN NULL;
  END IF;

  SELECT site_id INTO diagram_site
    FROM neta_ops.site_diagrams
    WHERE id = NEW.diagram_id;

  SELECT site_id INTO asset_site
    FROM neta_ops.equipment_assets
    WHERE id = NEW.asset_id;

  IF asset_site IS DISTINCT FROM diagram_site THEN
    RAISE EXCEPTION 'Asset % is not at this diagram''s site', NEW.asset_id;
  END IF;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_diagram_symbols_same_site ON neta_ops.diagram_symbols;
CREATE TRIGGER trg_diagram_symbols_same_site
  AFTER INSERT OR UPDATE OF asset_id, diagram_id ON neta_ops.diagram_symbols
  FOR EACH ROW EXECUTE FUNCTION neta_ops.enforce_diagram_asset_same_site();

DROP TRIGGER IF EXISTS trg_diagram_lines_same_site ON neta_ops.diagram_lines;
CREATE TRIGGER trg_diagram_lines_same_site
  AFTER INSERT OR UPDATE OF asset_id, diagram_id ON neta_ops.diagram_lines
  FOR EACH ROW EXECUTE FUNCTION neta_ops.enforce_diagram_asset_same_site();

-- ── updated_at triggers ───────────────────────────────────────────────────────
DROP TRIGGER IF EXISTS set_updated_at_site_diagrams ON neta_ops.site_diagrams;
CREATE TRIGGER set_updated_at_site_diagrams
  BEFORE UPDATE ON neta_ops.site_diagrams
  FOR EACH ROW EXECUTE FUNCTION neta_ops.update_updated_at_column();

DROP TRIGGER IF EXISTS set_updated_at_diagram_symbols ON neta_ops.diagram_symbols;
CREATE TRIGGER set_updated_at_diagram_symbols
  BEFORE UPDATE ON neta_ops.diagram_symbols
  FOR EACH ROW EXECUTE FUNCTION neta_ops.update_updated_at_column();

DROP TRIGGER IF EXISTS set_updated_at_diagram_lines ON neta_ops.diagram_lines;
CREATE TRIGGER set_updated_at_diagram_lines
  BEFORE UPDATE ON neta_ops.diagram_lines
  FOR EACH ROW EXECUTE FUNCTION neta_ops.update_updated_at_column();

-- ── RLS ───────────────────────────────────────────────────────────────────────
-- Employee-only, same as substation folders and the rest of the asset registry.
ALTER TABLE neta_ops.site_diagrams   ENABLE ROW LEVEL SECURITY;
ALTER TABLE neta_ops.diagram_symbols ENABLE ROW LEVEL SECURITY;
ALTER TABLE neta_ops.diagram_lines   ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Employees can manage site diagrams" ON neta_ops.site_diagrams;
CREATE POLICY "Employees can manage site diagrams"
ON neta_ops.site_diagrams FOR ALL
USING (common.is_employee_user())
WITH CHECK (common.is_employee_user());

DROP POLICY IF EXISTS "Employees can manage diagram symbols" ON neta_ops.diagram_symbols;
CREATE POLICY "Employees can manage diagram symbols"
ON neta_ops.diagram_symbols FOR ALL
USING (common.is_employee_user())
WITH CHECK (common.is_employee_user());

DROP POLICY IF EXISTS "Employees can manage diagram lines" ON neta_ops.diagram_lines;
CREATE POLICY "Employees can manage diagram lines"
ON neta_ops.diagram_lines FOR ALL
USING (common.is_employee_user())
WITH CHECK (common.is_employee_user());

GRANT SELECT, INSERT, UPDATE, DELETE ON neta_ops.site_diagrams   TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON neta_ops.diagram_symbols TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON neta_ops.diagram_lines   TO authenticated, service_role;

-- ── Comments ──────────────────────────────────────────────────────────────────
COMMENT ON TABLE  neta_ops.site_diagrams IS 'A single-line diagram. Owned by the site, so every job at that site shares it. A site can have several.';
COMMENT ON COLUMN neta_ops.site_diagrams.sort_order IS 'Display order in the diagram picker. Ties broken by name.';
COMMENT ON COLUMN neta_ops.site_diagrams.deleted_at IS 'Soft delete. Its symbols and lines are kept, so a deleted diagram can be restored.';

COMMENT ON TABLE  neta_ops.diagram_symbols IS 'One item drawn on a diagram: an asset, or a stand-alone item such as a utility source or bus. See the header of this table in create_site_diagrams.sql for how asset_id and symbol_key combine.';
COMMENT ON COLUMN neta_ops.diagram_symbols.asset_id IS 'The linked asset. NULL for a stand-alone item, or when the asset was permanently deleted.';
COMMENT ON COLUMN neta_ops.diagram_symbols.symbol_key IS 'Which symbol to draw. NULL on an asset means use the site''s symbol for its equipment type.';
COMMENT ON COLUMN neta_ops.diagram_symbols.label IS 'Text for a stand-alone item. An asset''s name always comes from the asset.';
COMMENT ON COLUMN neta_ops.diagram_symbols.x IS 'Left edge on the diagram. Larger y is further downstream, because power flows top to bottom.';
COMMENT ON COLUMN neta_ops.diagram_symbols.width IS 'Only set on items that stretch, such as a bus. NULL uses the symbol''s own size.';

COMMENT ON TABLE  neta_ops.diagram_lines IS 'A connection between two symbols on one diagram. "from" is upstream and "to" is downstream.';
COMMENT ON COLUMN neta_ops.diagram_lines.from_port IS 'Connection point on the upstream symbol. Free text because custom symbols name their own points.';
COMMENT ON COLUMN neta_ops.diagram_lines.to_port IS 'Connection point on the downstream symbol. Free text because custom symbols name their own points.';
COMMENT ON COLUMN neta_ops.diagram_lines.asset_id IS 'The asset this line represents, such as a cable, so its reports open from the line.';
COMMENT ON COLUMN neta_ops.diagram_lines.voltage_volts IS 'Nominal voltage in volts, such as 480 or 13800. NULL means not set.';
COMMENT ON COLUMN neta_ops.diagram_lines.voltage_kind IS 'ac or dc. DC has its own color, whatever its voltage.';

NOTIFY pgrst, 'reload schema';
