-- Change Orders on the SOV (Project Management scope, item 14).
--
-- Why: big Change Orders bill over months, and today they get split by hand. Now an
-- approved Change Order gets its own lines at the bottom of the job's SOV, copied from
-- its estimate sheet. PMs enter what got done each week and billing follows.
--
--   neta_ops.job_sov_lines.change_order_id   null = a line from the original contract
--
-- Deleting a Change Order deletes its SOV lines and their weekly numbers.
-- The app copies the lines in the first time a PM opens the job after approval, so
-- both ways of approving (in the app, or the customer signing online) are covered.
--
-- Run after sov_setup.sql and sov_weekly.sql. Safe to run twice.

SET lock_timeout = '5s';

BEGIN;

ALTER TABLE neta_ops.job_sov_lines
  ADD COLUMN IF NOT EXISTS change_order_id uuid
    REFERENCES neta_ops.job_change_orders(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_job_sov_lines_change_order
  ON neta_ops.job_sov_lines (change_order_id)
  WHERE change_order_id IS NOT NULL;

COMMENT ON COLUMN neta_ops.job_sov_lines.change_order_id IS
  'The Change Order this line bills. Null means the line is part of the original contract.';

COMMIT;

NOTIFY pgrst, 'reload schema';

-- Expected result: one row, every column true.
SELECT
  EXISTS (SELECT 1 FROM information_schema.columns
           WHERE table_schema = 'neta_ops' AND table_name = 'job_sov_lines'
             AND column_name = 'change_order_id') AS change_order_column,
  EXISTS (SELECT 1 FROM pg_indexes
           WHERE schemaname = 'neta_ops' AND indexname = 'idx_job_sov_lines_change_order') AS change_order_index;
