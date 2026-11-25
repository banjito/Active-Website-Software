-- Areas on the SOV (Billing & SOV scope, item 9).
--
-- Why: copying from the estimate merged same-named rows across the whole job, so 8 data
-- halls became one line. Each line now keeps the area (estimate section) it sits under.
--
--   neta_ops.job_sov_lines.section   null = no area
--
-- Run after sov_change_orders.sql, and before the code that saves areas goes live.
-- Safe to run twice. Existing lines are not changed.

SET lock_timeout = '5s';

BEGIN;

ALTER TABLE neta_ops.job_sov_lines
  ADD COLUMN IF NOT EXISTS section text;

COMMENT ON COLUMN neta_ops.job_sov_lines.section IS
  'Area of the job this line sits under, copied from the estimate section. Null means none.';

COMMIT;

NOTIFY pgrst, 'reload schema';
