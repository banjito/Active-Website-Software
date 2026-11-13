-- Retainage per customer (Project Management scope, item 10).
--
-- Why: some customers hold back a % of each payment until the job is done, some
-- don't. The SOV printout takes the % from the job's customer.
--
--   common.customers.retainage_pct   0 to 100. Null or 0 means none held back.
--
-- Safe to run twice.

SET lock_timeout = '5s';

BEGIN;

ALTER TABLE common.customers
  ADD COLUMN IF NOT EXISTS retainage_pct numeric(5,2);

ALTER TABLE common.customers
  DROP CONSTRAINT IF EXISTS customers_retainage_pct_range;
ALTER TABLE common.customers
  ADD CONSTRAINT customers_retainage_pct_range
  CHECK (retainage_pct IS NULL OR (retainage_pct >= 0 AND retainage_pct <= 100));

COMMENT ON COLUMN common.customers.retainage_pct IS
  'Percent this customer holds back from each payment until the job is done. Null or 0 = none. Used on the SOV printout.';

COMMIT;

NOTIFY pgrst, 'reload schema';

-- Expected result: one row, true.
SELECT EXISTS (SELECT 1 FROM information_schema.columns
                WHERE table_schema = 'common' AND table_name = 'customers'
                  AND column_name = 'retainage_pct') AS retainage_column;
