-- Job checklist: step list from the PMs (Project Management scope, item 2).
--
-- Why: Field Services asked the PMs for the right steps (Nov 11). Changes:
--   SOV created          new step, after Job in QuickBooks. No due date. Ticks itself
--                        once the job's SOV is saved (original contract lines, not
--                        Change Order lines).
--   Mobilization billed  moved up, before Initial site visit. Due ASAP: the day the
--                        contract is signed (was the job's start date).
-- Everything else stays as it was.
--
-- SOV prices are only visible to PMs, so common.jobs_with_sov tells everyone else
-- whether a job has an SOV, and nothing more.
--
-- Run after job_checklist.sql, sov_setup.sql and sov_change_orders.sql. Safe to run twice.

SET lock_timeout = '5s';

BEGIN;

ALTER TABLE neta_ops.job_checklist_steps
  DROP CONSTRAINT IF EXISTS job_checklist_steps_auto_rule_check;
ALTER TABLE neta_ops.job_checklist_steps
  ADD CONSTRAINT job_checklist_steps_auto_rule_check
  CHECK (auto_rule IN ('lead_assigned', 'quickbooks_linked', 'job_billed', 'sov_created'));

INSERT INTO neta_ops.job_checklist_steps (key, name, phase, sort_order, due_anchor, due_offset_days, auto_rule)
VALUES ('sov_created', 'SOV created', 'Setup', 55, NULL, 0, 'sov_created')
ON CONFLICT (key) DO UPDATE SET auto_rule = EXCLUDED.auto_rule;

UPDATE neta_ops.job_checklist_steps
   SET phase = 'Setup', sort_order = 57, due_anchor = 'contract', due_offset_days = 0
 WHERE key = 'mobilization_billed';

-- Which of these jobs have a saved SOV. Yes/no only, no prices.
CREATE OR REPLACE FUNCTION common.jobs_with_sov(p_job_ids uuid[])
RETURNS TABLE (job_id uuid)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT DISTINCT l.job_id
    FROM neta_ops.job_sov_lines l
   WHERE l.job_id = ANY (p_job_ids)
     AND l.change_order_id IS NULL;
$$;

REVOKE ALL ON FUNCTION common.jobs_with_sov(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION common.jobs_with_sov(uuid[]) TO authenticated;

COMMIT;

NOTIFY pgrst, 'reload schema';

-- Expected result: steps in this order. SOV created after Job in QuickBooks with
-- auto_rule = sov_created, then Mobilization billed with due_anchor = contract.
SELECT sort_order, name, phase, due_anchor, due_offset_days, auto_rule
  FROM neta_ops.job_checklist_steps
 WHERE archived_at IS NULL
 ORDER BY sort_order;
