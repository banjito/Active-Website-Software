-- ============================================================================
-- Custom Form Component Defaults (admin-overridable defaults for component library)
-- ============================================================================
-- If you get 404 when clicking "Save as default component", run this script
-- in Supabase SQL Editor to create the table.
-- Admins can save section edits (margins, columns, formulas, print layout, etc.)
-- as the new default for that component type.
-- ============================================================================

CREATE TABLE IF NOT EXISTS neta_ops.custom_form_component_defaults (
  component_type TEXT PRIMARY KEY,
  default_config JSONB NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

COMMENT ON TABLE neta_ops.custom_form_component_defaults IS 'Admin-saved overrides for custom form component default config (columns, print layout, etc.)';
COMMENT ON COLUMN neta_ops.custom_form_component_defaults.component_type IS 'ComponentType enum value (e.g. custom-table, job-info)';
COMMENT ON COLUMN neta_ops.custom_form_component_defaults.default_config IS 'Partial SectionConfig merged over the code default when adding the component';

CREATE INDEX IF NOT EXISTS idx_custom_form_component_defaults_updated_at
  ON neta_ops.custom_form_component_defaults(updated_at);

GRANT SELECT, INSERT, UPDATE, DELETE ON neta_ops.custom_form_component_defaults TO authenticated;

-- Enable RLS and add policies (required for Supabase — without policies, writes are silently blocked)
ALTER TABLE neta_ops.custom_form_component_defaults ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS custom_form_component_defaults_select ON neta_ops.custom_form_component_defaults;
CREATE POLICY custom_form_component_defaults_select ON neta_ops.custom_form_component_defaults
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS custom_form_component_defaults_insert ON neta_ops.custom_form_component_defaults;
CREATE POLICY custom_form_component_defaults_insert ON neta_ops.custom_form_component_defaults
  FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS custom_form_component_defaults_update ON neta_ops.custom_form_component_defaults;
CREATE POLICY custom_form_component_defaults_update ON neta_ops.custom_form_component_defaults
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS custom_form_component_defaults_delete ON neta_ops.custom_form_component_defaults;
CREATE POLICY custom_form_component_defaults_delete ON neta_ops.custom_form_component_defaults
  FOR DELETE TO authenticated USING (true);
