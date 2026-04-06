-- ============================================================================
-- Custom Form Saved Components (user-defined components in the library)
-- ============================================================================
-- Run this script in Supabase SQL Editor so "Save as new component" works.
-- Saved components appear in the component library sidebar for everyone to use.
-- ============================================================================

CREATE TABLE IF NOT EXISTS neta_ops.custom_form_saved_components (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  section_config JSONB NOT NULL DEFAULT '{}',
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE neta_ops.custom_form_saved_components IS 'User-saved custom form sections (e.g. custom tables) that appear in the component library for others to add to reports';
COMMENT ON COLUMN neta_ops.custom_form_saved_components.name IS 'Display name in the component library';
COMMENT ON COLUMN neta_ops.custom_form_saved_components.section_config IS 'Full SectionConfig (title, columns, cellFormulas, etc.); id/order are ignored when adding to a form';

CREATE INDEX IF NOT EXISTS idx_custom_form_saved_components_created_at
  ON neta_ops.custom_form_saved_components(created_at DESC);

-- Allow all authenticated users to read; anyone can save (for "other people to use")
GRANT SELECT, INSERT, UPDATE, DELETE ON neta_ops.custom_form_saved_components TO authenticated;

-- Optional: enable RLS and allow read for all authenticated, write for all (so anyone can save and everyone sees)
ALTER TABLE neta_ops.custom_form_saved_components ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS custom_form_saved_components_select ON neta_ops.custom_form_saved_components;
CREATE POLICY custom_form_saved_components_select ON neta_ops.custom_form_saved_components
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS custom_form_saved_components_insert ON neta_ops.custom_form_saved_components;
CREATE POLICY custom_form_saved_components_insert ON neta_ops.custom_form_saved_components
  FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS custom_form_saved_components_update ON neta_ops.custom_form_saved_components;
CREATE POLICY custom_form_saved_components_update ON neta_ops.custom_form_saved_components
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS custom_form_saved_components_delete ON neta_ops.custom_form_saved_components;
CREATE POLICY custom_form_saved_components_delete ON neta_ops.custom_form_saved_components
  FOR DELETE TO authenticated USING (true);
