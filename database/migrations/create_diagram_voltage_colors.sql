-- Single-line diagrams: voltage colors, per site, with a default for new sites.
--
--   site_id NULL  the default, which admins and report reviewers can change
--   site_id set   one site's colors, used by every diagram at that site
--
-- A site copies the default when its first diagram is created. After that the two are
-- unrelated, which is what stops a changed default from recoloring existing work.
--
-- WHO CAN CHANGE WHAT is decided here rather than only in the app:
--   default    admins and report reviewers
--   a site     those same people, plus the PM on an active job at that site, plus location
--              project managers (division leads)
-- If you change who can review reports in src/lib/roles.ts, update the list below too.
-- The job statuses mirror ACTIVE_JOB_STATUSES in src/services/pmAccessService.ts.
--
-- Colors are stored by voltage level key. The keys match VOLTAGE_LEVELS in
-- src/lib/diagrams/voltage.ts.
--
-- Existing data: every site that already has a diagram gets the default colors, so its
-- diagrams look the same from here on. Nothing else changes. Safe to re-run.

CREATE TABLE IF NOT EXISTS neta_ops.diagram_voltage_colors (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id    UUID        REFERENCES common.sites(id) ON DELETE CASCADE,
  colors     JSONB       NOT NULL,
  updated_by UUID        REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT diagram_voltage_colors_is_object CHECK (jsonb_typeof(colors) = 'object')
);

-- One row per site.
CREATE UNIQUE INDEX IF NOT EXISTS idx_diagram_voltage_colors_site
  ON neta_ops.diagram_voltage_colors (site_id)
  WHERE site_id IS NOT NULL;

-- And only one default.
CREATE UNIQUE INDEX IF NOT EXISTS idx_diagram_voltage_colors_default
  ON neta_ops.diagram_voltage_colors ((site_id IS NULL))
  WHERE site_id IS NULL;

DROP TRIGGER IF EXISTS set_updated_at_diagram_voltage_colors ON neta_ops.diagram_voltage_colors;
CREATE TRIGGER set_updated_at_diagram_voltage_colors
  BEFORE UPDATE ON neta_ops.diagram_voltage_colors
  FOR EACH ROW EXECUTE FUNCTION neta_ops.update_updated_at_column();

-- ── Who can change what ───────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION neta_ops.can_edit_diagram_defaults()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    COALESCE(auth.jwt() -> 'user_metadata' ->> 'role', '') IN (
      'Admin', 'Super Admin', 'Engineer', 'Operations Manager'
    )
    OR lower(COALESCE(auth.jwt() ->> 'email', '')) IN (
      'john.chambers@ampqes.com',
      'jack.lyons@ampqes.com'
    );
$$;

CREATE OR REPLACE FUNCTION neta_ops.can_edit_site_diagram_settings(p_site_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    neta_ops.can_edit_diagram_defaults()
    OR EXISTS (
      SELECT 1
        FROM common.app_settings s
       CROSS JOIN LATERAL jsonb_each(s.value) AS lead
       WHERE s.key = 'division_leads'
         AND jsonb_typeof(s.value) = 'object'
         AND lead.value ->> 'id' = auth.uid()::text
    )
    OR EXISTS (
      SELECT 1
        FROM neta_ops.jobs j
       WHERE j.site_id = p_site_id
         AND j.project_manager_id = auth.uid()
         AND j.deleted_at IS NULL
         AND j.status IN ('pending', 'in_progress', 'progress_billing', 'ready_to_bill', 'on_hold')
    );
$$;

REVOKE ALL ON FUNCTION neta_ops.can_edit_diagram_defaults() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION neta_ops.can_edit_site_diagram_settings(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION neta_ops.can_edit_diagram_defaults() TO authenticated;
GRANT EXECUTE ON FUNCTION neta_ops.can_edit_site_diagram_settings(UUID) TO authenticated;

-- ── RLS ───────────────────────────────────────────────────────────────────────
ALTER TABLE neta_ops.diagram_voltage_colors ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Employees can read voltage colors" ON neta_ops.diagram_voltage_colors;
CREATE POLICY "Employees can read voltage colors"
ON neta_ops.diagram_voltage_colors FOR SELECT
USING (common.is_employee_user());

DROP POLICY IF EXISTS "Allowed people can add voltage colors" ON neta_ops.diagram_voltage_colors;
CREATE POLICY "Allowed people can add voltage colors"
ON neta_ops.diagram_voltage_colors FOR INSERT
WITH CHECK (
  CASE WHEN site_id IS NULL
    THEN neta_ops.can_edit_diagram_defaults()
    ELSE neta_ops.can_edit_site_diagram_settings(site_id)
  END
);

DROP POLICY IF EXISTS "Allowed people can change voltage colors" ON neta_ops.diagram_voltage_colors;
CREATE POLICY "Allowed people can change voltage colors"
ON neta_ops.diagram_voltage_colors FOR UPDATE
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

GRANT SELECT, INSERT, UPDATE ON neta_ops.diagram_voltage_colors TO authenticated, service_role;

-- ── Starting colors ───────────────────────────────────────────────────────────
INSERT INTO neta_ops.diagram_voltage_colors (site_id, colors)
SELECT NULL, '{
  "above_69kv": "#6A1B9A",
  "above_15kv": "#C62828",
  "above_1kv": "#E65100",
  "above_240v": "#1565C0",
  "240v_and_below": "#2E7D32",
  "dc": "#00796B",
  "not_set": "#616161"
}'::jsonb
WHERE NOT EXISTS (
  SELECT 1 FROM neta_ops.diagram_voltage_colors WHERE site_id IS NULL
);

-- Sites that already have a diagram.
INSERT INTO neta_ops.diagram_voltage_colors (site_id, colors)
SELECT DISTINCT d.site_id, standard.colors
  FROM neta_ops.site_diagrams d
 CROSS JOIN (
   SELECT colors FROM neta_ops.diagram_voltage_colors WHERE site_id IS NULL
 ) AS standard
 WHERE NOT EXISTS (
   SELECT 1 FROM neta_ops.diagram_voltage_colors c WHERE c.site_id = d.site_id
 );

-- ── A site's first diagram copies the default ─────────────────────────────────
-- In the database because anyone who can edit assets can create a diagram, and most of them
-- aren't allowed to change colors. SECURITY DEFINER lets this copy happen for them.
CREATE OR REPLACE FUNCTION neta_ops.copy_default_voltage_colors()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO neta_ops.diagram_voltage_colors (site_id, colors)
  SELECT NEW.site_id, c.colors
    FROM neta_ops.diagram_voltage_colors c
   WHERE c.site_id IS NULL
     AND NOT EXISTS (
       SELECT 1 FROM neta_ops.diagram_voltage_colors s WHERE s.site_id = NEW.site_id
     );
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_site_diagrams_copy_voltage_colors ON neta_ops.site_diagrams;
CREATE TRIGGER trg_site_diagrams_copy_voltage_colors
  AFTER INSERT ON neta_ops.site_diagrams
  FOR EACH ROW EXECUTE FUNCTION neta_ops.copy_default_voltage_colors();

COMMENT ON TABLE neta_ops.diagram_voltage_colors IS 'Voltage colors for single-line diagrams. site_id NULL is the default that new sites copy. A site row is that site''s own, and is unaffected by later changes to the default.';
COMMENT ON COLUMN neta_ops.diagram_voltage_colors.colors IS 'Hex colors by voltage level key. See VOLTAGE_LEVELS in src/lib/diagrams/voltage.ts.';

NOTIFY pgrst, 'reload schema';
