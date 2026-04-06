-- ============================================================================
-- Custom Form Component Defaults (admin-overridable defaults for component library)
-- ============================================================================
-- Run this in Supabase SQL Editor if you get 404 when saving "Save as default component".
-- Creates neta_ops.custom_form_component_defaults so admins can save section
-- config (columns, formulas, print layout) as the default for each component type.
-- ============================================================================

CREATE TABLE IF NOT EXISTS neta_ops.custom_form_component_defaults (
  component_type TEXT PRIMARY KEY,
  default_config JSONB NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

COMMENT ON TABLE neta_ops.custom_form_component_defaults IS 'Admin-saved overrides for custom form component default config (columns, print layout, cellFormulas, etc.)';
COMMENT ON COLUMN neta_ops.custom_form_component_defaults.component_type IS 'ComponentType enum value (e.g. custom-table, job-info, insulation-test)';
COMMENT ON COLUMN neta_ops.custom_form_component_defaults.default_config IS 'Partial SectionConfig merged over the code default when adding the component';

CREATE INDEX IF NOT EXISTS idx_custom_form_component_defaults_updated_at
  ON neta_ops.custom_form_component_defaults(updated_at);

GRANT SELECT, INSERT, UPDATE, DELETE ON neta_ops.custom_form_component_defaults TO authenticated;
