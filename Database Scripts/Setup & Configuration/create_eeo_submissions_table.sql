-- Anonymized EEO submissions table
-- EEO data is collected during the application process but stored separately
-- from candidate profiles. No identifying information (name, email, etc.) is stored here.
-- Data ties to the requisition/position for aggregated compliance reporting.

CREATE TABLE IF NOT EXISTS common.eeo_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  requisition_id UUID REFERENCES common.job_requisitions(id) ON DELETE SET NULL,
  position_title TEXT NOT NULL,
  department TEXT,
  gender TEXT,
  race TEXT,
  veteran BOOLEAN DEFAULT FALSE,
  disability BOOLEAN DEFAULT FALSE,
  candidate_status TEXT DEFAULT 'new',
  submitted_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes for fast reporting queries
CREATE INDEX IF NOT EXISTS idx_eeo_submissions_requisition ON common.eeo_submissions(requisition_id);
CREATE INDEX IF NOT EXISTS idx_eeo_submissions_position ON common.eeo_submissions(position_title);
CREATE INDEX IF NOT EXISTS idx_eeo_submissions_status ON common.eeo_submissions(candidate_status);

-- RLS: restrict access to authenticated users (HR admins only via app-level checks)
ALTER TABLE common.eeo_submissions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS eeo_submissions_select ON common.eeo_submissions;
CREATE POLICY eeo_submissions_select ON common.eeo_submissions
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS eeo_submissions_insert ON common.eeo_submissions;
CREATE POLICY eeo_submissions_insert ON common.eeo_submissions
  FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS eeo_submissions_update ON common.eeo_submissions;
CREATE POLICY eeo_submissions_update ON common.eeo_submissions
  FOR UPDATE TO authenticated USING (true);

-- Grant access
GRANT SELECT, INSERT, UPDATE ON common.eeo_submissions TO authenticated;
GRANT SELECT, INSERT, UPDATE ON common.eeo_submissions TO anon;
