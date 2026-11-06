-- Single-line diagrams: PDF revisions and the end-user logo.
--
-- RUN create_diagram_voltage_colors.sql FIRST. This file uses its permission function.
--
-- REVISIONS
-- The revision goes up when a diagram is exported and its contents differ from the last
-- export. export_hash is a fingerprint of those contents. Timestamps can't do this job:
-- recording an export is itself a change to the row, and every reprint would look like an edit.
--
-- END-USER LOGO
-- Printed in the title block, so a site's drawings carry the owner's logo even when a job's
-- customer is someone else. It comes from a linked customer record, or an upload for an
-- end-user who isn't a customer. In its own table so it follows the same rule as the rest of
-- a site's diagram settings, rather than who can edit sites.
--
-- Nothing existing changes. Safe to re-run.

ALTER TABLE neta_ops.site_diagrams
  ADD COLUMN IF NOT EXISTS revision INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS export_hash TEXT;

COMMENT ON COLUMN neta_ops.site_diagrams.revision IS
  'Printed in the title block. 0 until first exported.';
COMMENT ON COLUMN neta_ops.site_diagrams.export_hash IS
  'Fingerprint of the contents at the last export. A different fingerprint means a new revision.';

CREATE TABLE IF NOT EXISTS neta_ops.diagram_site_settings (
  site_id              UUID        PRIMARY KEY REFERENCES common.sites(id) ON DELETE CASCADE,
  end_user_customer_id UUID        REFERENCES common.customers(id) ON DELETE SET NULL,
  end_user_logo        TEXT,
  updated_by           UUID        REFERENCES auth.users(id),
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT diagram_site_settings_logo CHECK (
    end_user_logo IS NULL OR (
      length(end_user_logo) <= 420000
      AND (
        end_user_logo LIKE 'data:image/png;base64,%'
        OR end_user_logo LIKE 'data:image/svg+xml;base64,%'
      )
    )
  )
);

DROP TRIGGER IF EXISTS set_updated_at_diagram_site_settings ON neta_ops.diagram_site_settings;
CREATE TRIGGER set_updated_at_diagram_site_settings
  BEFORE UPDATE ON neta_ops.diagram_site_settings
  FOR EACH ROW EXECUTE FUNCTION neta_ops.update_updated_at_column();

ALTER TABLE neta_ops.diagram_site_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Employees can read diagram site settings" ON neta_ops.diagram_site_settings;
CREATE POLICY "Employees can read diagram site settings"
ON neta_ops.diagram_site_settings FOR SELECT
USING (common.is_employee_user());

DROP POLICY IF EXISTS "Allowed people can add diagram site settings" ON neta_ops.diagram_site_settings;
CREATE POLICY "Allowed people can add diagram site settings"
ON neta_ops.diagram_site_settings FOR INSERT
WITH CHECK (neta_ops.can_edit_site_diagram_settings(site_id));

DROP POLICY IF EXISTS "Allowed people can change diagram site settings" ON neta_ops.diagram_site_settings;
CREATE POLICY "Allowed people can change diagram site settings"
ON neta_ops.diagram_site_settings FOR UPDATE
USING (neta_ops.can_edit_site_diagram_settings(site_id))
WITH CHECK (neta_ops.can_edit_site_diagram_settings(site_id));

GRANT SELECT, INSERT, UPDATE ON neta_ops.diagram_site_settings TO authenticated, service_role;

COMMENT ON TABLE neta_ops.diagram_site_settings IS 'Per-site settings for printed diagrams.';
COMMENT ON COLUMN neta_ops.diagram_site_settings.end_user_customer_id IS 'The customer record whose logo prints as the end-user. Takes priority over an uploaded logo.';
COMMENT ON COLUMN neta_ops.diagram_site_settings.end_user_logo IS 'An uploaded logo, for an end-user who isn''t a customer.';

NOTIFY pgrst, 'reload schema';
