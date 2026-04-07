-- One-on-One Check-In forms stored per employee profile
-- Accessible by the employee, their manager (via org_chart_assignments), and Admin/Super Admin

CREATE TABLE IF NOT EXISTS common.one_on_one_checkins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  manager_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  meeting_date DATE NOT NULL DEFAULT CURRENT_DATE,
  period_covered TEXT,

  -- Overall pulse: 'needs-attention' | 'on-track' | 'exceeding'
  overall_pulse TEXT CHECK (overall_pulse IN ('needs-attention', 'on-track', 'exceeding')),

  -- Key events as JSONB array: [{ label, description }]
  key_events JSONB DEFAULT '[]'::jsonb,

  -- Counseling: strengths and development areas
  -- Each is a JSONB array: [{ text, followUp }]
  strengths JSONB DEFAULT '[]'::jsonb,
  development_areas JSONB DEFAULT '[]'::jsonb,

  -- Goals as JSONB array: [{ goal, dueDate, status, notes }]
  goals JSONB DEFAULT '[]'::jsonb,

  -- Next period commitments
  -- Each is a JSONB array of strings
  employee_commitments JSONB DEFAULT '[]'::jsonb,
  manager_commitments JSONB DEFAULT '[]'::jsonb,

  -- Additional notes
  additional_notes TEXT,

  -- Signatures (typed names)
  employee_signature TEXT,
  manager_signature TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID NOT NULL REFERENCES auth.users(id)
);

CREATE INDEX IF NOT EXISTS idx_checkins_employee ON common.one_on_one_checkins(employee_id);
CREATE INDEX IF NOT EXISTS idx_checkins_manager ON common.one_on_one_checkins(manager_id);
CREATE INDEX IF NOT EXISTS idx_checkins_date ON common.one_on_one_checkins(meeting_date DESC);

-- Grant table-level access to authenticated users (required by Supabase)
GRANT SELECT, INSERT, UPDATE, DELETE ON common.one_on_one_checkins TO authenticated;

-- RLS: only the employee, their manager, or admins can see/edit
ALTER TABLE common.one_on_one_checkins ENABLE ROW LEVEL SECURITY;

-- Idempotent: safe to re-run this file after the table already exists
DROP POLICY IF EXISTS "Users can view their own check-ins" ON common.one_on_one_checkins;
DROP POLICY IF EXISTS "Managers can insert check-ins for their reports" ON common.one_on_one_checkins;
DROP POLICY IF EXISTS "Managers can update check-ins they created" ON common.one_on_one_checkins;
DROP POLICY IF EXISTS "Employees can update their own signature" ON common.one_on_one_checkins;
DROP POLICY IF EXISTS "Managers can delete check-ins they created" ON common.one_on_one_checkins;
DROP POLICY IF EXISTS "one_on_one_checkins_select_admin_hr" ON common.one_on_one_checkins;
DROP POLICY IF EXISTS "one_on_one_checkins_update_admin_hr" ON common.one_on_one_checkins;
DROP POLICY IF EXISTS "one_on_one_checkins_delete_admin_hr" ON common.one_on_one_checkins;
DROP POLICY IF EXISTS "one_on_one_checkins_select_manager_chain" ON common.one_on_one_checkins;
DROP POLICY IF EXISTS "one_on_one_checkins_update_manager_chain" ON common.one_on_one_checkins;
DROP POLICY IF EXISTS "one_on_one_checkins_delete_manager_chain" ON common.one_on_one_checkins;

CREATE POLICY "Users can view their own check-ins"
  ON common.one_on_one_checkins FOR SELECT
  USING (auth.uid() = employee_id OR auth.uid() = manager_id);

CREATE POLICY "Managers can insert check-ins for their reports"
  ON common.one_on_one_checkins FOR INSERT
  WITH CHECK (auth.uid() = manager_id);

CREATE POLICY "Managers can update check-ins they created"
  ON common.one_on_one_checkins FOR UPDATE
  USING (auth.uid() = manager_id);

CREATE POLICY "Employees can update their own signature"
  ON common.one_on_one_checkins FOR UPDATE
  USING (auth.uid() = employee_id);

CREATE POLICY "Managers can delete check-ins they created"
  ON common.one_on_one_checkins FOR DELETE
  USING (auth.uid() = manager_id);

-- Admin / HR: full visibility and edit (matches app: ProfileView + OneOnOneList)
CREATE POLICY "one_on_one_checkins_select_admin_hr"
  ON common.one_on_one_checkins FOR SELECT
  USING (
    COALESCE((auth.jwt() -> 'user_metadata' ->> 'role'), '')
      IN ('Admin', 'Super Admin', 'HR', 'HR Rep')
  );

CREATE POLICY "one_on_one_checkins_update_admin_hr"
  ON common.one_on_one_checkins FOR UPDATE
  USING (
    COALESCE((auth.jwt() -> 'user_metadata' ->> 'role'), '')
      IN ('Admin', 'Super Admin', 'HR', 'HR Rep')
  );

CREATE POLICY "one_on_one_checkins_delete_admin_hr"
  ON common.one_on_one_checkins FOR DELETE
  USING (
    COALESCE((auth.jwt() -> 'user_metadata' ->> 'role'), '')
      IN ('Admin', 'Super Admin', 'HR', 'HR Rep')
  );

-- Any profile that appears above the employee on the org chart (skip-level managers, etc.)
CREATE POLICY "one_on_one_checkins_select_manager_chain"
  ON common.one_on_one_checkins FOR SELECT
  USING (
    EXISTS (
      WITH RECURSIVE ancestors AS (
        SELECT a.reports_to_profile_id AS mgr
        FROM common.org_chart_assignments a
        WHERE a.profile_id = one_on_one_checkins.employee_id
          AND a.reports_to_profile_id IS NOT NULL
        UNION ALL
        SELECT o.reports_to_profile_id
        FROM common.org_chart_assignments o
        INNER JOIN ancestors anc ON o.profile_id = anc.mgr
        WHERE o.reports_to_profile_id IS NOT NULL
      )
      SELECT 1 FROM ancestors WHERE mgr = auth.uid()
    )
  );

CREATE POLICY "one_on_one_checkins_update_manager_chain"
  ON common.one_on_one_checkins FOR UPDATE
  USING (
    EXISTS (
      WITH RECURSIVE ancestors AS (
        SELECT a.reports_to_profile_id AS mgr
        FROM common.org_chart_assignments a
        WHERE a.profile_id = one_on_one_checkins.employee_id
          AND a.reports_to_profile_id IS NOT NULL
        UNION ALL
        SELECT o.reports_to_profile_id
        FROM common.org_chart_assignments o
        INNER JOIN ancestors anc ON o.profile_id = anc.mgr
        WHERE o.reports_to_profile_id IS NOT NULL
      )
      SELECT 1 FROM ancestors WHERE mgr = auth.uid()
    )
  );

CREATE POLICY "one_on_one_checkins_delete_manager_chain"
  ON common.one_on_one_checkins FOR DELETE
  USING (
    EXISTS (
      WITH RECURSIVE ancestors AS (
        SELECT a.reports_to_profile_id AS mgr
        FROM common.org_chart_assignments a
        WHERE a.profile_id = one_on_one_checkins.employee_id
          AND a.reports_to_profile_id IS NOT NULL
        UNION ALL
        SELECT o.reports_to_profile_id
        FROM common.org_chart_assignments o
        INNER JOIN ancestors anc ON o.profile_id = anc.mgr
        WHERE o.reports_to_profile_id IS NOT NULL
      )
      SELECT 1 FROM ancestors WHERE mgr = auth.uid()
    )
  );
