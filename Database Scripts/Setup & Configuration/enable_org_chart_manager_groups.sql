-- Enables "manager groups" on the org chart so multiple managers can share
-- reports. When an employee is dropped onto any group member, they are
-- assigned to every manager in the group automatically.

BEGIN;

CREATE TABLE IF NOT EXISTS common.org_chart_manager_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT,
  color TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- A profile can belong to at most one group (profile_id is the PK).
CREATE TABLE IF NOT EXISTS common.org_chart_manager_group_members (
  group_id UUID NOT NULL REFERENCES common.org_chart_manager_groups(id) ON DELETE CASCADE,
  profile_id UUID NOT NULL REFERENCES common.profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (profile_id)
);

CREATE INDEX IF NOT EXISTS idx_org_chart_manager_group_members_group_id
  ON common.org_chart_manager_group_members(group_id);

ALTER TABLE common.org_chart_manager_groups DISABLE ROW LEVEL SECURITY;
ALTER TABLE common.org_chart_manager_group_members DISABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON common.org_chart_manager_groups TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON common.org_chart_manager_group_members TO authenticated;

COMMENT ON TABLE common.org_chart_manager_groups IS 'Groups of managers that share direct reports. Assigning an employee to any group member assigns them to every member of the group.';
COMMENT ON TABLE common.org_chart_manager_group_members IS 'Membership in a manager group. Each profile can only belong to one group.';

COMMIT;
