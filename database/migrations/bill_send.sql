-- PM item 11, step 3: send a bill from ampOS.
--
-- 1. job_bills remembers who each bill was sent to and the subject line.
-- 2. Each customer remembers where its bills go (bill_emails), so the To line
--    fills itself next time. PMs save it through save_customer_bill_emails, which
--    only touches that one column.
--
-- Run after job_bills.sql. Safe to run more than once.

SET lock_timeout = '5s';

ALTER TABLE neta_ops.job_bills ADD COLUMN IF NOT EXISTS sent_to text[];
ALTER TABLE neta_ops.job_bills ADD COLUMN IF NOT EXISTS sent_cc text[];
ALTER TABLE neta_ops.job_bills ADD COLUMN IF NOT EXISTS sent_subject text;

ALTER TABLE common.customers ADD COLUMN IF NOT EXISTS bill_emails text[];
COMMENT ON COLUMN common.customers.bill_emails IS
  'Where this customer''s bills are emailed (accounts payable). Saved from the Send bill box.';

-- PMs/admins, or the PM of one of this customer's jobs, may save it.
CREATE OR REPLACE FUNCTION common.save_customer_bill_emails(p_customer_id uuid, p_emails text[])
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_clean text[];
BEGIN
  IF NOT (
    common.is_pm_or_admin()
    OR EXISTS (
      SELECT 1 FROM neta_ops.jobs j
      WHERE j.customer_id = p_customer_id AND common.is_job_pm(j.id)
    )
  ) THEN
    RAISE EXCEPTION 'Only a PM on this customer''s jobs can save where its bills go.'
      USING ERRCODE = '42501';
  END IF;

  SELECT array_agg(DISTINCT e) INTO v_clean
  FROM (
    SELECT lower(btrim(x)) AS e FROM unnest(coalesce(p_emails, '{}')) AS x
  ) s
  WHERE e ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$';

  IF coalesce(array_length(v_clean, 1), 0) > 10 THEN
    RAISE EXCEPTION 'Save at most 10 addresses.' USING ERRCODE = '22023';
  END IF;

  UPDATE common.customers SET bill_emails = v_clean WHERE id = p_customer_id;
END;
$$;

REVOKE ALL ON FUNCTION common.save_customer_bill_emails(uuid, text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION common.save_customer_bill_emails(uuid, text[]) TO authenticated;

NOTIFY pgrst, 'reload schema';

-- Check: should return sent_cols = 3, customer_col = 1, fn = 1
SELECT
  (SELECT count(*) FROM information_schema.columns
    WHERE table_schema = 'neta_ops' AND table_name = 'job_bills'
      AND column_name IN ('sent_to', 'sent_cc', 'sent_subject')) AS sent_cols,
  (SELECT count(*) FROM information_schema.columns
    WHERE table_schema = 'common' AND table_name = 'customers' AND column_name = 'bill_emails') AS customer_col,
  (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'common' AND p.proname = 'save_customer_bill_emails') AS fn;
