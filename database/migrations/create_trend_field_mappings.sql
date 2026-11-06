-- Saved field mappings for Trends: "these fields on different report types are
-- the same reading." Everyone can use them; only admins and report reviewers
-- can change them.
--
-- Run after create_diagram_voltage_colors.sql, which adds
-- neta_ops.can_edit_diagram_defaults().

CREATE TABLE IF NOT EXISTS neta_ops.trend_field_mappings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL CHECK (length(trim(name)) > 0),
  -- [{ reportType, fieldKey, reportTypeName, label }]
  members JSONB NOT NULL CHECK (jsonb_typeof(members) = 'array'),
  created_by UUID DEFAULT auth.uid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE OR REPLACE FUNCTION neta_ops.touch_trend_field_mapping()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_updated_at_trend_field_mappings ON neta_ops.trend_field_mappings;
CREATE TRIGGER set_updated_at_trend_field_mappings
BEFORE UPDATE ON neta_ops.trend_field_mappings
FOR EACH ROW EXECUTE FUNCTION neta_ops.touch_trend_field_mapping();

ALTER TABLE neta_ops.trend_field_mappings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Employees can read trend mappings" ON neta_ops.trend_field_mappings;
CREATE POLICY "Employees can read trend mappings"
ON neta_ops.trend_field_mappings FOR SELECT
USING (common.is_employee_user());

DROP POLICY IF EXISTS "Allowed people can add trend mappings" ON neta_ops.trend_field_mappings;
CREATE POLICY "Allowed people can add trend mappings"
ON neta_ops.trend_field_mappings FOR INSERT
WITH CHECK (neta_ops.can_edit_diagram_defaults());

DROP POLICY IF EXISTS "Allowed people can change trend mappings" ON neta_ops.trend_field_mappings;
CREATE POLICY "Allowed people can change trend mappings"
ON neta_ops.trend_field_mappings FOR UPDATE
USING (neta_ops.can_edit_diagram_defaults())
WITH CHECK (neta_ops.can_edit_diagram_defaults());

DROP POLICY IF EXISTS "Allowed people can delete trend mappings" ON neta_ops.trend_field_mappings;
CREATE POLICY "Allowed people can delete trend mappings"
ON neta_ops.trend_field_mappings FOR DELETE
USING (neta_ops.can_edit_diagram_defaults());

GRANT SELECT, INSERT, UPDATE, DELETE ON neta_ops.trend_field_mappings TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
