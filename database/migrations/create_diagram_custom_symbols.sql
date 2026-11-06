-- Single-line diagrams: uploaded and drawn symbols, and which symbol each site uses.
--
-- RUN create_diagram_voltage_colors.sql FIRST. This file uses its permission functions.
--
--   diagram_custom_symbols   one shared library. Admins and report reviewers add to it.
--   diagram_symbol_choices   site_id NULL is the default, a site row is that site's own.
--
-- WHY IMAGES ARE STORED HERE AND NOT IN A STORAGE BUCKET
-- Symbols are small, and capped by the check below. A row can't lose its file, an archived
-- diagram keeps its artwork, and the PDF export can embed it without fetching anything.
--
-- WHY A NEW SITE COPIES THE DEFAULT
-- A changed default must only affect new sites, so each site gets its own row when it's
-- created. A site with no row uses the built-in symbols, which is every site that exists
-- when this runs, so nothing already drawn changes.
--
-- A deleted symbol is only hidden from the pickers. Its row stays, so diagrams already using
-- it still draw it. Safe to re-run.

CREATE TABLE IF NOT EXISTS neta_ops.diagram_custom_symbols (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT        NOT NULL,
  -- Drawn symbols are shapes, in the same format as the built-in ones.
  shapes     JSONB       NOT NULL DEFAULT '[]'::jsonb,
  -- Uploaded symbols are an image held as a data URL.
  image_data TEXT,
  width      INTEGER     NOT NULL DEFAULT 60,
  height     INTEGER     NOT NULL DEFAULT 60,
  ports      JSONB       NOT NULL DEFAULT '[]'::jsonb,
  created_by UUID        REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CONSTRAINT diagram_custom_symbols_name_not_blank CHECK (btrim(name) <> ''),
  CONSTRAINT diagram_custom_symbols_size CHECK (width BETWEEN 20 AND 240 AND height BETWEEN 20 AND 240),
  CONSTRAINT diagram_custom_symbols_shapes_is_array CHECK (jsonb_typeof(shapes) = 'array'),
  CONSTRAINT diagram_custom_symbols_ports_is_array CHECK (jsonb_typeof(ports) = 'array'),
  -- Only these two image types, and small enough to load with a diagram.
  CONSTRAINT diagram_custom_symbols_image CHECK (
    image_data IS NULL OR (
      length(image_data) <= 420000
      AND (
        image_data LIKE 'data:image/png;base64,%'
        OR image_data LIKE 'data:image/svg+xml;base64,%'
      )
    )
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_diagram_custom_symbols_name
  ON neta_ops.diagram_custom_symbols (lower(name))
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS neta_ops.diagram_symbol_choices (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id    UUID        REFERENCES common.sites(id) ON DELETE CASCADE,
  choices    JSONB       NOT NULL DEFAULT '{}'::jsonb,
  updated_by UUID        REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT diagram_symbol_choices_is_object CHECK (jsonb_typeof(choices) = 'object')
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_diagram_symbol_choices_site
  ON neta_ops.diagram_symbol_choices (site_id)
  WHERE site_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_diagram_symbol_choices_default
  ON neta_ops.diagram_symbol_choices ((site_id IS NULL))
  WHERE site_id IS NULL;

DROP TRIGGER IF EXISTS set_updated_at_diagram_custom_symbols ON neta_ops.diagram_custom_symbols;
CREATE TRIGGER set_updated_at_diagram_custom_symbols
  BEFORE UPDATE ON neta_ops.diagram_custom_symbols
  FOR EACH ROW EXECUTE FUNCTION neta_ops.update_updated_at_column();

DROP TRIGGER IF EXISTS set_updated_at_diagram_symbol_choices ON neta_ops.diagram_symbol_choices;
CREATE TRIGGER set_updated_at_diagram_symbol_choices
  BEFORE UPDATE ON neta_ops.diagram_symbol_choices
  FOR EACH ROW EXECUTE FUNCTION neta_ops.update_updated_at_column();

-- ── RLS ───────────────────────────────────────────────────────────────────────
ALTER TABLE neta_ops.diagram_custom_symbols ENABLE ROW LEVEL SECURITY;
ALTER TABLE neta_ops.diagram_symbol_choices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Employees can read custom symbols" ON neta_ops.diagram_custom_symbols;
CREATE POLICY "Employees can read custom symbols"
ON neta_ops.diagram_custom_symbols FOR SELECT
USING (common.is_employee_user());

DROP POLICY IF EXISTS "Allowed people can add custom symbols" ON neta_ops.diagram_custom_symbols;
CREATE POLICY "Allowed people can add custom symbols"
ON neta_ops.diagram_custom_symbols FOR INSERT
WITH CHECK (neta_ops.can_edit_diagram_defaults());

DROP POLICY IF EXISTS "Allowed people can change custom symbols" ON neta_ops.diagram_custom_symbols;
CREATE POLICY "Allowed people can change custom symbols"
ON neta_ops.diagram_custom_symbols FOR UPDATE
USING (neta_ops.can_edit_diagram_defaults())
WITH CHECK (neta_ops.can_edit_diagram_defaults());

DROP POLICY IF EXISTS "Employees can read symbol choices" ON neta_ops.diagram_symbol_choices;
CREATE POLICY "Employees can read symbol choices"
ON neta_ops.diagram_symbol_choices FOR SELECT
USING (common.is_employee_user());

DROP POLICY IF EXISTS "Allowed people can add symbol choices" ON neta_ops.diagram_symbol_choices;
CREATE POLICY "Allowed people can add symbol choices"
ON neta_ops.diagram_symbol_choices FOR INSERT
WITH CHECK (
  CASE WHEN site_id IS NULL
    THEN neta_ops.can_edit_diagram_defaults()
    ELSE neta_ops.can_edit_site_diagram_settings(site_id)
  END
);

DROP POLICY IF EXISTS "Allowed people can change symbol choices" ON neta_ops.diagram_symbol_choices;
CREATE POLICY "Allowed people can change symbol choices"
ON neta_ops.diagram_symbol_choices FOR UPDATE
USING (
  CASE WHEN site_id IS NULL
    THEN neta_ops.can_edit_diagram_defaults()
    ELSE neta_ops.can_edit_site_diagram_settings(site_id)
  END
)
WITH CHECK (
  CASE WHEN site_id IS NULL
    THEN neta_ops.can_edit_diagram_defaults()
    ELSE neta_ops.can_edit_site_diagram_settings(site_id)
  END
);

GRANT SELECT, INSERT, UPDATE ON neta_ops.diagram_custom_symbols TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE ON neta_ops.diagram_symbol_choices TO authenticated, service_role;

-- ── The default, empty until someone sets it ──────────────────────────────────
INSERT INTO neta_ops.diagram_symbol_choices (site_id, choices)
SELECT NULL, '{}'::jsonb
WHERE NOT EXISTS (
  SELECT 1 FROM neta_ops.diagram_symbol_choices WHERE site_id IS NULL
);

-- ── A new site copies the default ─────────────────────────────────────────────
-- SECURITY DEFINER because whoever creates a site may not be allowed to set its symbols.
CREATE OR REPLACE FUNCTION neta_ops.copy_default_symbol_choices()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO neta_ops.diagram_symbol_choices (site_id, choices)
  SELECT NEW.id, c.choices
    FROM neta_ops.diagram_symbol_choices c
   WHERE c.site_id IS NULL;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_sites_copy_symbol_choices ON common.sites;
CREATE TRIGGER trg_sites_copy_symbol_choices
  AFTER INSERT ON common.sites
  FOR EACH ROW EXECUTE FUNCTION neta_ops.copy_default_symbol_choices();

COMMENT ON TABLE neta_ops.diagram_custom_symbols IS 'Shared library of uploaded and drawn single-line symbols.';
COMMENT ON COLUMN neta_ops.diagram_custom_symbols.ports IS 'Connection points as [{id, x, y}]. Ids start with top, bottom, left or right.';
COMMENT ON COLUMN neta_ops.diagram_custom_symbols.deleted_at IS 'Hidden from the pickers. Diagrams already using the symbol keep drawing it.';
COMMENT ON TABLE neta_ops.diagram_symbol_choices IS 'Which symbol to draw. site_id NULL is the default that new sites copy. Keys are symbol:<built-in key> or type:<equipment type>.';

NOTIFY pgrst, 'reload schema';
