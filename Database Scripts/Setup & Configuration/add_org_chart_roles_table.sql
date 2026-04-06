-- Create org_chart_roles table for dynamic role management
-- Run this script in Supabase SQL Editor

CREATE TABLE IF NOT EXISTS common.org_chart_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  label TEXT NOT NULL,
  value TEXT NOT NULL UNIQUE,
  color TEXT DEFAULT 'blue',
  display_order INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

COMMENT ON TABLE common.org_chart_roles IS 'Custom roles for org chart people cards';
COMMENT ON COLUMN common.org_chart_roles.value IS 'Machine-readable slug used in org_chart_assignments.role';
COMMENT ON COLUMN common.org_chart_roles.color IS 'Color theme: blue, red, purple, green, orange, teal, pink, amber, cyan, gray';

-- Grant permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON common.org_chart_roles TO authenticated;

-- Seed with the existing hardcoded roles
INSERT INTO common.org_chart_roles (label, value, color, display_order) VALUES
  ('Team Member',    'team_member',    'blue',   0),
  ('Fire Team Lead', 'fire_team_lead', 'red',    1),
  ('Office Admin',   'office_admin',   'purple', 2),
  ('Technician',     'technician',     'green',  3)
ON CONFLICT (value) DO NOTHING;
