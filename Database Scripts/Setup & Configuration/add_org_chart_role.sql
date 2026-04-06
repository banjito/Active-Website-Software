-- Add role column to org_chart_assignments table and color to levels
-- Run this script in Supabase SQL Editor to enable role assignments and custom colors

-- 1. Add the role column to assignments
ALTER TABLE common.org_chart_assignments 
ADD COLUMN IF NOT EXISTS role TEXT;

COMMENT ON COLUMN common.org_chart_assignments.role IS 'Role category: team_member, fire_team_lead, office_admin, technician';

-- 2. Add color column to org_chart_levels for custom level colors
ALTER TABLE common.org_chart_levels 
ADD COLUMN IF NOT EXISTS color TEXT DEFAULT 'pink';

COMMENT ON COLUMN common.org_chart_levels.color IS 'Color theme for this level: pink, teal, amber, blue, purple, green, red, orange, cyan, gray';

-- 3. Grant permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON common.org_chart_assignments TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON common.org_chart_levels TO authenticated;

-- 4. Optional: Add some default levels if none exist
-- Uncomment and run if you want starter levels:
/*
INSERT INTO common.org_chart_levels (label, display_order, color) VALUES
  ('Executive', 0, 'pink'),
  ('Director', 1, 'teal'),
  ('Manager', 2, 'amber'),
  ('Staff', 3, 'gray')
ON CONFLICT DO NOTHING;
*/
