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
