-- Org chart display order / levels. Run once in Supabase SQL Editor.
-- Defines the order and visual tier of titles/levels shown on the org chart.

CREATE TABLE IF NOT EXISTS common.org_chart_levels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  label TEXT NOT NULL,
  display_order INT NOT NULL DEFAULT 0,
  tier TEXT,
  job_titles TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- If table already existed without job_titles, add it
ALTER TABLE common.org_chart_levels ADD COLUMN IF NOT EXISTS job_titles TEXT[] DEFAULT '{}';

COMMENT ON COLUMN common.org_chart_levels.job_titles IS 'Job titles that belong to this level (e.g. {CFO,COO,CTO}). If empty, level.label is used for matching.';
COMMENT ON TABLE common.org_chart_levels IS 'Ordered list of levels for org chart. Tier controls node color; job_titles (or label) match profile.job_title.';

CREATE INDEX IF NOT EXISTS idx_org_chart_levels_display_order ON common.org_chart_levels(display_order);

ALTER TABLE common.org_chart_levels DISABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON common.org_chart_levels TO authenticated;

-- Assign people to a level (overrides job-title matching).
CREATE TABLE IF NOT EXISTS common.org_chart_assignments (
  profile_id UUID NOT NULL REFERENCES common.profiles(id) ON DELETE CASCADE,
  level_id UUID NOT NULL REFERENCES common.org_chart_levels(id) ON DELETE CASCADE,
  grid_column INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (profile_id)
);

-- Allow placing a person in a specific grid cell (column index within the row).
ALTER TABLE common.org_chart_assignments ADD COLUMN IF NOT EXISTS grid_column INT NOT NULL DEFAULT 0;

COMMENT ON TABLE common.org_chart_assignments IS 'Explicit assignment of a person to an org chart level. grid_column = cell index in that row (0-based).';
COMMENT ON COLUMN common.org_chart_assignments.grid_column IS 'Column index in the grid row (0 = left). For siblings (same reports_to), order left-to-right.';
ALTER TABLE common.org_chart_assignments ADD COLUMN IF NOT EXISTS reports_to_profile_id UUID REFERENCES common.profiles(id) ON DELETE SET NULL;
COMMENT ON COLUMN common.org_chart_assignments.reports_to_profile_id IS 'Manager: this person reports to this profile_id. NULL = top level.';
CREATE INDEX IF NOT EXISTS idx_org_chart_assignments_level_id ON common.org_chart_assignments(level_id);
CREATE INDEX IF NOT EXISTS idx_org_chart_assignments_reports_to ON common.org_chart_assignments(reports_to_profile_id);

ALTER TABLE common.org_chart_assignments DISABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON common.org_chart_assignments TO authenticated;

-- Allow creating a profile when adding someone to the org chart (FK requires profile_id to exist).
-- Run this if you get: insert or update on table "org_chart_assignments" violates foreign key constraint "org_chart_assignments_profile_id_fkey"
GRANT INSERT ON common.profiles TO authenticated;

-- Optional: seed rows for Owner (top center), Leadership, Branch (run in SQL editor if desired)
-- INSERT INTO common.org_chart_levels (label, display_order, tier) VALUES
--   ('Owner', 0, 'executive'),
--   ('Leadership', 1, 'management'),
--   ('Branch', 2, 'staff');
