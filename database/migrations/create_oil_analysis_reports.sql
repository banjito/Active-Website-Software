-- Stores transformer oil analysis reports converted from third-party lab PDFs.
--
-- The source PDFs (MVA Diagnostics) carry no text layer, so the app OCRs them
-- in the browser and has DeepSeek structure the result. That conversion is slow
-- and costs an API call, so the outcome is persisted here rather than redone
-- every time someone wants to look at a report.
--
-- Lives in neta_ops because this is field/report data, alongside the other
-- report tables.

CREATE TABLE IF NOT EXISTS neta_ops.oil_analysis_reports (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- One uploaded PDF can hold several transformers. Units converted together
  -- share a batch_id so the workflow can show "4 units from this file".
  batch_id           UUID NOT NULL,
  label              TEXT NOT NULL,
  site_name          TEXT,
  source_file        TEXT,

  -- Denormalized from the payload purely so the index/list view does not have
  -- to parse every jsonb blob to render a row.
  latest_sample_date TEXT,
  latest_condition   TEXT,

  -- The full OilReport object (see src/lib/oilReport.ts). Kept as jsonb rather
  -- than columns because the lab's row set differs per fluid type and per IEEE
  -- revision; normalizing it would mean a migration every time they add a test.
  report             JSONB NOT NULL,

  created_by         UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE neta_ops.oil_analysis_reports IS
  'Transformer oil analysis reports converted from third-party lab PDFs via OCR + LLM structuring. One row per transformer unit; rows sharing a batch_id came from the same uploaded file.';

COMMENT ON COLUMN neta_ops.oil_analysis_reports.latest_condition IS
  'DGA condition of the newest sample, as printed by the lab (e.g. "Condition 2", "Status 2"). Text, not an enum: the wording changed between IEEE C57.104-2019 and C57.155-2014 and both still appear.';

-- List view is "newest first", optionally filtered to one upload.
CREATE INDEX IF NOT EXISTS oil_analysis_reports_created_at_idx
  ON neta_ops.oil_analysis_reports (created_at DESC);

CREATE INDEX IF NOT EXISTS oil_analysis_reports_batch_idx
  ON neta_ops.oil_analysis_reports (batch_id);

ALTER TABLE neta_ops.oil_analysis_reports ENABLE ROW LEVEL SECURITY;

-- Internal tool: any employee may convert and read. Customers get nothing here
-- (they receive the branded PDF, not the record).
DROP POLICY IF EXISTS "Employees can manage oil analysis reports"
  ON neta_ops.oil_analysis_reports;
CREATE POLICY "Employees can manage oil analysis reports"
ON neta_ops.oil_analysis_reports FOR ALL
USING (common.is_employee_user())
WITH CHECK (common.is_employee_user());

GRANT SELECT, INSERT, UPDATE, DELETE ON neta_ops.oil_analysis_reports TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON neta_ops.oil_analysis_reports TO service_role;
