-- Stores AMP-lify reports converted from technician Excel workbooks.
--
-- The Excel path is the sibling of neta_ops.oil_analysis_reports: same
-- convert-once-and-persist shape, different source format. There is no OCR
-- step here (a workbook is already text), but the structuring call still costs
-- an API round trip, so the outcome is persisted rather than redone every time
-- someone opens the report.
--
-- Lives in neta_ops because this is field/report data, alongside the other
-- report tables.

CREATE TABLE IF NOT EXISTS neta_ops.amplify_reports (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- One uploaded workbook can hold several units, typically a sheet each.
  -- Reports converted together share a batch_id so the workflow can show
  -- "4 reports from this file".
  batch_id      UUID NOT NULL,
  label         TEXT NOT NULL,
  site_name     TEXT,
  source_file   TEXT,

  -- Denormalized from the payload purely so the index/list view does not have
  -- to parse every jsonb blob to render a row.
  report_date   TEXT,
  status        TEXT,

  -- The full AmplifyReport object (see src/lib/amplifyReport.ts). Kept as
  -- jsonb rather than columns because the workbooks are hand-maintained and
  -- their section and column sets differ per revision; normalizing them would
  -- mean a migration every time a technician adds a test.
  report        JSONB NOT NULL,

  created_by    UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE neta_ops.amplify_reports IS
  'AMP-lify reports converted from technician Excel workbooks via LLM structuring. One row per unit under test; rows sharing a batch_id came from the same uploaded workbook.';

COMMENT ON COLUMN neta_ops.amplify_reports.report_date IS
  'Report date as printed in the workbook. Text, not a date: the workbooks are hand-formatted and a value that will not parse must still round-trip to the report exactly as the technician typed it.';

COMMENT ON COLUMN neta_ops.amplify_reports.status IS
  'Overall result as printed (e.g. "PASS", "Satisfactory"). Text, not an enum: the wording varies by workbook revision. See resultSeverity() in src/lib/amplifyReport.ts for how it maps to the shared severity scale.';

-- List view is "newest first", optionally filtered to one upload.
CREATE INDEX IF NOT EXISTS amplify_reports_created_at_idx
  ON neta_ops.amplify_reports (created_at DESC);

CREATE INDEX IF NOT EXISTS amplify_reports_batch_idx
  ON neta_ops.amplify_reports (batch_id);

ALTER TABLE neta_ops.amplify_reports ENABLE ROW LEVEL SECURITY;

-- Internal tool: any employee may convert and read. Customers get nothing here
-- (they receive the branded PDF, not the record).
DROP POLICY IF EXISTS "Employees can manage amplify reports"
  ON neta_ops.amplify_reports;
CREATE POLICY "Employees can manage amplify reports"
ON neta_ops.amplify_reports FOR ALL
USING (common.is_employee_user())
WITH CHECK (common.is_employee_user());

GRANT SELECT, INSERT, UPDATE, DELETE ON neta_ops.amplify_reports TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON neta_ops.amplify_reports TO service_role;
