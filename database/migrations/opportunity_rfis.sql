-- RFIs (Requests for Information): estimating questions for the customer, kept on
-- each opportunity. Downloaded as an Excel sheet, sent to the customer, and the
-- returned sheet is uploaded to fill in the answers.
--
--   business.opportunity_rfis      one question, its customer response and dates
--   business.opportunity_rfi_log   each Excel download and upload, with who did it
--
-- An RFI is answered when it has a response; there is no separate status column.
-- Numbers are never reused, so a deleted RFI leaves a gap. That keeps them matching
-- copies already sent to the customer.

-- ---------------------------------------------------------------------------
-- RFIs
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS business.opportunity_rfis (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  opportunity_id uuid NOT NULL REFERENCES business.opportunities(id) ON DELETE CASCADE,
  number int NOT NULL CHECK (number > 0),
  question text NOT NULL,
  spec_ref text,
  response text,
  date_added date NOT NULL DEFAULT current_date,
  date_answered date,
  -- 'customer' when the customer wrote the question in the returned Excel
  source text NOT NULL DEFAULT 'ampos' CHECK (source IN ('ampos', 'customer')),
  created_by uuid DEFAULT auth.uid() REFERENCES auth.users(id),
  created_by_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (opportunity_id, number)
);

CREATE INDEX IF NOT EXISTS idx_opportunity_rfis_opportunity_id ON business.opportunity_rfis (opportunity_id);

DROP TRIGGER IF EXISTS trg_opportunity_rfis_updated_at ON business.opportunity_rfis;
CREATE TRIGGER trg_opportunity_rfis_updated_at
  BEFORE UPDATE ON business.opportunity_rfis
  FOR EACH ROW EXECUTE FUNCTION common.set_updated_at();

COMMENT ON TABLE business.opportunity_rfis IS 'Estimating questions sent to the customer for one opportunity. Answered when response is not blank.';

REVOKE ALL ON TABLE business.opportunity_rfis FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE business.opportunity_rfis TO authenticated;
GRANT ALL ON TABLE business.opportunity_rfis TO service_role;

ALTER TABLE business.opportunity_rfis ENABLE ROW LEVEL SECURITY;

-- Anyone signed in can read, add and edit, same as the opportunity itself
DROP POLICY IF EXISTS "opportunity_rfis_select" ON business.opportunity_rfis;
CREATE POLICY "opportunity_rfis_select"
  ON business.opportunity_rfis FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "opportunity_rfis_insert" ON business.opportunity_rfis;
CREATE POLICY "opportunity_rfis_insert"
  ON business.opportunity_rfis FOR INSERT
  TO authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS "opportunity_rfis_update" ON business.opportunity_rfis;
CREATE POLICY "opportunity_rfis_update"
  ON business.opportunity_rfis FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Open RFIs can be deleted by anyone; answered ones only by admins
DROP POLICY IF EXISTS "opportunity_rfis_delete" ON business.opportunity_rfis;
CREATE POLICY "opportunity_rfis_delete"
  ON business.opportunity_rfis FOR DELETE
  TO authenticated
  USING (
    coalesce(btrim(response), '') = ''
    OR coalesce(auth.jwt()->'user_metadata'->>'role', '') IN ('Admin', 'Super Admin')
  );

-- ---------------------------------------------------------------------------
-- Download / upload log
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS business.opportunity_rfi_log (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  opportunity_id uuid NOT NULL REFERENCES business.opportunities(id) ON DELETE CASCADE,
  action text NOT NULL CHECK (action IN ('download', 'upload')),
  file_name text,
  -- Download: RFIs in the file. Upload: changes applied.
  rfi_count int NOT NULL DEFAULT 0,
  -- From the login, not from anything the browser sends
  user_id uuid DEFAULT auth.uid() REFERENCES auth.users(id),
  user_name text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_opportunity_rfi_log_opportunity_id ON business.opportunity_rfi_log (opportunity_id);

COMMENT ON TABLE business.opportunity_rfi_log IS 'Each RFI Excel download and customer-reply upload for an opportunity.';

REVOKE ALL ON TABLE business.opportunity_rfi_log FROM anon;
-- Add-only: no update or delete
GRANT SELECT, INSERT ON TABLE business.opportunity_rfi_log TO authenticated;
GRANT ALL ON TABLE business.opportunity_rfi_log TO service_role;

ALTER TABLE business.opportunity_rfi_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "opportunity_rfi_log_select" ON business.opportunity_rfi_log;
CREATE POLICY "opportunity_rfi_log_select"
  ON business.opportunity_rfi_log FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "opportunity_rfi_log_insert" ON business.opportunity_rfi_log;
CREATE POLICY "opportunity_rfi_log_insert"
  ON business.opportunity_rfi_log FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

NOTIFY pgrst, 'reload schema';

-- Expected result: two rows, both 0.
SELECT 'opportunity_rfis' AS table_name, count(*) FROM business.opportunity_rfis
UNION ALL
SELECT 'opportunity_rfi_log', count(*) FROM business.opportunity_rfi_log;
