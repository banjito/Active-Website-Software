-- Project checklist: a box to tick for each step of getting a job going
-- (contract signed, COI issued, lead assigned, ...). Feeds the Checklist tab on the
-- job page and the Checklist view on the PM Dashboard.
--
--   neta_ops.job_checklist_steps    the company-wide step list, edited by admins
--   neta_ops.job_checklist_items    a job's answer for one step: done, N/A, note
--   neta_ops.job_checklist_events   every change to an answer, with who made it
--
-- Every job shows every step. A job has no item row until someone acts on a step,
-- so new jobs and new steps need no seeding. Steps with an auto_rule tick themselves
-- in the app from fields already on the job (lead, QuickBooks link, Billed status).

-- ---------------------------------------------------------------------------
-- Step list
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS neta_ops.job_checklist_steps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Set on the built-in steps only, so the seed below can run twice
  key text UNIQUE,
  name text NOT NULL,
  phase text NOT NULL DEFAULT 'Setup'
    CHECK (phase IN ('Sales', 'Setup', 'Field', 'Closeout')),
  sort_order int NOT NULL DEFAULT 0,
  -- Due date = anchor date + offset days. No anchor means no due date.
  --   contract  the day "Contract signed" was ticked
  --   start     the job's start date
  --   end       the job's completed date, else its due date
  due_anchor text CHECK (due_anchor IN ('contract', 'start', 'end')),
  due_offset_days int NOT NULL DEFAULT 0,
  -- Ticks itself when this is true of the job. NULL means a person ticks it.
  auto_rule text CHECK (auto_rule IN ('lead_assigned', 'quickbooks_linked', 'job_billed')),
  -- Removed steps are hidden, not deleted, so past ticks keep their step
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS trg_job_checklist_steps_updated_at ON neta_ops.job_checklist_steps;
CREATE TRIGGER trg_job_checklist_steps_updated_at
  BEFORE UPDATE ON neta_ops.job_checklist_steps
  FOR EACH ROW EXECUTE FUNCTION common.set_updated_at();

COMMENT ON TABLE neta_ops.job_checklist_steps IS 'Company-wide project checklist steps. Every job shows every step that is not archived.';

REVOKE ALL ON TABLE neta_ops.job_checklist_steps FROM anon;
GRANT SELECT, INSERT, UPDATE ON TABLE neta_ops.job_checklist_steps TO authenticated;
GRANT ALL ON TABLE neta_ops.job_checklist_steps TO service_role;

ALTER TABLE neta_ops.job_checklist_steps ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "job_checklist_steps_select" ON neta_ops.job_checklist_steps;
CREATE POLICY "job_checklist_steps_select"
  ON neta_ops.job_checklist_steps FOR SELECT
  TO authenticated
  USING (true);

-- Only admins change the list. No delete policy: steps are archived instead.
DROP POLICY IF EXISTS "job_checklist_steps_insert_admin" ON neta_ops.job_checklist_steps;
CREATE POLICY "job_checklist_steps_insert_admin"
  ON neta_ops.job_checklist_steps FOR INSERT
  TO authenticated
  WITH CHECK (coalesce(auth.jwt()->'user_metadata'->>'role', '') IN ('Admin', 'Super Admin'));

DROP POLICY IF EXISTS "job_checklist_steps_update_admin" ON neta_ops.job_checklist_steps;
CREATE POLICY "job_checklist_steps_update_admin"
  ON neta_ops.job_checklist_steps FOR UPDATE
  TO authenticated
  USING (coalesce(auth.jwt()->'user_metadata'->>'role', '') IN ('Admin', 'Super Admin'))
  WITH CHECK (coalesce(auth.jwt()->'user_metadata'->>'role', '') IN ('Admin', 'Super Admin'));

INSERT INTO neta_ops.job_checklist_steps (key, name, phase, sort_order, due_anchor, due_offset_days, auto_rule)
VALUES
  ('contract_signed',     'Contract signed',          'Sales',    10, NULL,       0,  NULL),
  ('pm_contacted',        'PM contacted customer',    'Setup',    20, 'contract', 2,  NULL),
  ('coi_issued',          'COI issued',               'Setup',    30, 'contract', 5,  NULL),
  ('lead_assigned',       'Lead assigned',            'Setup',    40, 'contract', 5,  'lead_assigned'),
  ('quickbooks_linked',   'Job in QuickBooks',        'Setup',    50, 'contract', 5,  'quickbooks_linked'),
  ('site_visit',          'Initial site visit',       'Field',    60, 'start',    -7, NULL),
  ('mobilization_billed', 'Mobilization billed',      'Field',    70, 'start',    0,  NULL),
  ('reports_sent',        'Reports sent to customer', 'Closeout', 80, 'end',      10, NULL),
  ('final_invoice',       'Final invoice sent',       'Closeout', 90, NULL,       0,  'job_billed')
ON CONFLICT (key) DO NOTHING;

-- ---------------------------------------------------------------------------
-- A job's answers
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS neta_ops.job_checklist_items (
  -- Made in the browser, so a save sent twice is stored once
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES neta_ops.jobs(id) ON DELETE CASCADE,
  step_id uuid NOT NULL REFERENCES neta_ops.job_checklist_steps(id) ON DELETE CASCADE,
  -- 'open' stays as a row when someone unticks, or only adds a note
  state text NOT NULL DEFAULT 'open' CHECK (state IN ('open', 'done', 'na')),
  -- When and by whom it was ticked or marked N/A
  done_at timestamptz,
  done_by uuid REFERENCES auth.users(id),
  done_by_name text,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (job_id, step_id)
);

CREATE INDEX IF NOT EXISTS idx_job_checklist_items_job_id ON neta_ops.job_checklist_items (job_id);

DROP TRIGGER IF EXISTS trg_job_checklist_items_updated_at ON neta_ops.job_checklist_items;
CREATE TRIGGER trg_job_checklist_items_updated_at
  BEFORE UPDATE ON neta_ops.job_checklist_items
  FOR EACH ROW EXECUTE FUNCTION common.set_updated_at();

COMMENT ON TABLE neta_ops.job_checklist_items IS 'One job''s answer to one checklist step. No row means the step is still open.';

REVOKE ALL ON TABLE neta_ops.job_checklist_items FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE neta_ops.job_checklist_items TO authenticated;
GRANT ALL ON TABLE neta_ops.job_checklist_items TO service_role;

ALTER TABLE neta_ops.job_checklist_items ENABLE ROW LEVEL SECURITY;

-- Anyone signed in can read and tick. The events table records who really did it.
DROP POLICY IF EXISTS "job_checklist_items_select" ON neta_ops.job_checklist_items;
CREATE POLICY "job_checklist_items_select"
  ON neta_ops.job_checklist_items FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "job_checklist_items_insert" ON neta_ops.job_checklist_items;
CREATE POLICY "job_checklist_items_insert"
  ON neta_ops.job_checklist_items FOR INSERT
  TO authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS "job_checklist_items_update" ON neta_ops.job_checklist_items;
CREATE POLICY "job_checklist_items_update"
  ON neta_ops.job_checklist_items FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "job_checklist_items_delete_admin" ON neta_ops.job_checklist_items;
CREATE POLICY "job_checklist_items_delete_admin"
  ON neta_ops.job_checklist_items FOR DELETE
  TO authenticated
  USING (coalesce(auth.jwt()->'user_metadata'->>'role', '') IN ('Admin', 'Super Admin'));

-- ---------------------------------------------------------------------------
-- Change history
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS neta_ops.job_checklist_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  item_id uuid NOT NULL REFERENCES neta_ops.job_checklist_items(id) ON DELETE CASCADE,
  job_id uuid NOT NULL,
  step_id uuid NOT NULL,
  from_state text,
  to_state text NOT NULL,
  -- From the login, not from anything the browser sends
  changed_by uuid DEFAULT auth.uid(),
  changed_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_job_checklist_events_job_id ON neta_ops.job_checklist_events (job_id);

REVOKE ALL ON TABLE neta_ops.job_checklist_events FROM anon;
-- Read only: rows are written by the trigger below
GRANT SELECT ON TABLE neta_ops.job_checklist_events TO authenticated;
GRANT ALL ON TABLE neta_ops.job_checklist_events TO service_role;

ALTER TABLE neta_ops.job_checklist_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "job_checklist_events_select" ON neta_ops.job_checklist_events;
CREATE POLICY "job_checklist_events_select"
  ON neta_ops.job_checklist_events FOR SELECT
  TO authenticated
  USING (true);

CREATE OR REPLACE FUNCTION neta_ops.log_job_checklist_change() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.state IS NOT DISTINCT FROM OLD.state THEN
    RETURN NEW;
  END IF;
  INSERT INTO neta_ops.job_checklist_events (item_id, job_id, step_id, from_state, to_state)
  VALUES (
    NEW.id,
    NEW.job_id,
    NEW.step_id,
    CASE WHEN TG_OP = 'UPDATE' THEN OLD.state END,
    NEW.state
  );
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION neta_ops.log_job_checklist_change() FROM PUBLIC, anon;

DROP TRIGGER IF EXISTS trg_job_checklist_items_log ON neta_ops.job_checklist_items;
CREATE TRIGGER trg_job_checklist_items_log
  AFTER INSERT OR UPDATE OF state ON neta_ops.job_checklist_items
  FOR EACH ROW EXECUTE FUNCTION neta_ops.log_job_checklist_change();

NOTIFY pgrst, 'reload schema';

-- Expected result: 9 rows, Contract signed first, Final invoice sent last.
SELECT sort_order, name, phase, due_anchor, due_offset_days, auto_rule
  FROM neta_ops.job_checklist_steps
 WHERE archived_at IS NULL
 ORDER BY sort_order;
