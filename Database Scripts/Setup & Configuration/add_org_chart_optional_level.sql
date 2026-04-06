-- Allow org chart assignments without a level (and without a role).
-- Run in Supabase SQL Editor so people can have "No level" / "No role" on the org chart.

-- Make level_id nullable so a person can be on the chart without a level
ALTER TABLE common.org_chart_assignments
  ALTER COLUMN level_id DROP NOT NULL;

-- FK remains: when level_id is set it must reference org_chart_levels(id).
-- role is already nullable (add_org_chart_role.sql).

COMMENT ON COLUMN common.org_chart_assignments.level_id IS 'Optional org chart level. NULL = no level (shown with depth-based color).';
