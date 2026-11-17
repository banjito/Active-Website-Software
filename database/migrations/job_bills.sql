-- PM item 11, step 2: a record of every bill made from a job's SOV.
--
-- One row per QuickBooks invoice ampOS makes for a job's month. Stops the same
-- month being billed twice in the same QuickBooks company, and lists the job's
-- billing history. The PDF isn't stored: ampOS pulls it from QuickBooks when opened.
--
-- Who can see and make bills: PMs/admins, or the job's own PM (same as the SOV).
-- Only test-company records can be removed. Real bills are voided, never deleted.
--
-- Safe to run more than once.

SET lock_timeout = '5s';

CREATE TABLE IF NOT EXISTS neta_ops.job_bills (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES neta_ops.jobs(id) ON DELETE CASCADE,
  -- Billing month, like 2026-10
  period text NOT NULL CONSTRAINT job_bills_period_format CHECK (period ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  application_number integer,
  -- Which QuickBooks company the invoice is in
  realm_id text NOT NULL,
  -- True for the Intuit test company
  is_test boolean NOT NULL DEFAULT false,
  qbo_invoice_id text NOT NULL,
  qbo_doc_number text,
  amount numeric(12,2) NOT NULL,
  retainage numeric(12,2) NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'draft' CONSTRAINT job_bills_status_check CHECK (status IN ('draft', 'sent', 'void')),
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid DEFAULT auth.uid(),
  sent_at timestamptz,
  sent_by uuid
);

COMMENT ON TABLE neta_ops.job_bills IS
  'QuickBooks invoices made from a job''s SOV, one per month per QuickBooks company (voided ones aside).';

-- One live bill per job, month and QuickBooks company
CREATE UNIQUE INDEX IF NOT EXISTS job_bills_one_per_month
  ON neta_ops.job_bills (job_id, period, realm_id)
  WHERE status <> 'void';

CREATE INDEX IF NOT EXISTS job_bills_job_idx ON neta_ops.job_bills (job_id);

-- Not report data: skip the automatic report backup copies
DROP TRIGGER IF EXISTS trg_snapshot_job_bills_ins ON neta_ops.job_bills;
DROP TRIGGER IF EXISTS trg_snapshot_job_bills_upd ON neta_ops.job_bills;

REVOKE ALL ON TABLE neta_ops.job_bills FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE neta_ops.job_bills TO authenticated;
GRANT ALL ON TABLE neta_ops.job_bills TO service_role;

ALTER TABLE neta_ops.job_bills ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "job_bills_select_pm" ON neta_ops.job_bills;
CREATE POLICY "job_bills_select_pm"
  ON neta_ops.job_bills FOR SELECT
  TO authenticated
  USING (common.is_pm_or_admin() OR common.is_job_pm(job_id));

DROP POLICY IF EXISTS "job_bills_insert_pm" ON neta_ops.job_bills;
CREATE POLICY "job_bills_insert_pm"
  ON neta_ops.job_bills FOR INSERT
  TO authenticated
  WITH CHECK ((common.is_pm_or_admin() OR common.is_job_pm(job_id)) AND created_by = auth.uid());

DROP POLICY IF EXISTS "job_bills_update_pm" ON neta_ops.job_bills;
CREATE POLICY "job_bills_update_pm"
  ON neta_ops.job_bills FOR UPDATE
  TO authenticated
  USING (common.is_pm_or_admin() OR common.is_job_pm(job_id))
  WITH CHECK (common.is_pm_or_admin() OR common.is_job_pm(job_id));

DROP POLICY IF EXISTS "job_bills_delete_test" ON neta_ops.job_bills;
CREATE POLICY "job_bills_delete_test"
  ON neta_ops.job_bills FOR DELETE
  TO authenticated
  USING (is_test AND (common.is_pm_or_admin() OR common.is_job_pm(job_id)));

NOTIFY pgrst, 'reload schema';

-- Check: should return one row, rls_on = true, policies = 4
SELECT c.relrowsecurity AS rls_on,
       (SELECT count(*) FROM pg_policies WHERE schemaname = 'neta_ops' AND tablename = 'job_bills') AS policies
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'neta_ops' AND c.relname = 'job_bills';
