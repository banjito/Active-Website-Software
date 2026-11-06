-- Change Orders priced on an estimate sheet (Project Management scope, item 12).
--
-- Why: a Change Order needs the same detail as an estimate, and its own letter
-- number, so it can be priced, sent and later billed on the SOV. Each new
-- Change Order gets its own quote (a business.opportunities row) that holds the
-- estimate sheets and letters. The row is marked with change_order_job_id, so
-- sales views can leave it out of pipeline totals.
--
--   business.opportunities.change_order_job_id   the job this Change Order belongs to
--   neta_ops.job_change_orders.opportunity_id    the Change Order's quote
--   neta_ops.job_change_orders.outside_contract  billed outside the contract's terms
--   business.assign_quote_number()               one counter for letter numbers
--   neta_ops.create_change_order_quote()         makes the Change Order and its quote together
--
-- Price: saving a letter writes quoted_amount on the quote; a trigger copies it
-- to the Change Order until it's approved. Deleting a Change Order deletes its
-- quote (estimates and letters go with it).
--
-- Older Change Orders have no quote and stay simple lines.
--
-- RUN THIS BEFORE deploying the app update: sales pages filter on
-- change_order_job_id and fail if the column is missing.
-- Safe to run twice. Touches the busy jobs and opportunities tables, so it
-- gives up after 5 seconds instead of stalling saves. If it stops with
-- "lock timeout", run it again.

SET lock_timeout = '5s';

BEGIN;

-- ---------------------------------------------------------------------------
-- Columns
-- ---------------------------------------------------------------------------

ALTER TABLE business.opportunities
  ADD COLUMN IF NOT EXISTS change_order_job_id uuid
    REFERENCES neta_ops.jobs(id) ON DELETE SET NULL;

COMMENT ON COLUMN business.opportunities.change_order_job_id IS
  'Set when this quote is a Change Order on that job. Left out of sales views and pipeline totals.';

CREATE INDEX IF NOT EXISTS idx_opportunities_change_order_job_id
  ON business.opportunities (change_order_job_id)
  WHERE change_order_job_id IS NOT NULL;

ALTER TABLE neta_ops.job_change_orders
  ADD COLUMN IF NOT EXISTS opportunity_id uuid
    REFERENCES business.opportunities(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS outside_contract boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN neta_ops.job_change_orders.opportunity_id IS
  'The quote that holds this Change Order''s estimate sheets and letters. Null on older, simple Change Orders.';
COMMENT ON COLUMN neta_ops.job_change_orders.outside_contract IS
  'Billed on its own terms, outside the original contract (for example no retainage or pay-if-paid).';

CREATE UNIQUE INDEX IF NOT EXISTS idx_job_change_orders_opportunity_id
  ON neta_ops.job_change_orders (opportunity_id)
  WHERE opportunity_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- One counter for letter numbers
-- ---------------------------------------------------------------------------
-- A new quote saved without a number gets the next one: highest all-digit
-- number plus 1 (never below 3803, same as the app). The lock makes two saves
-- at the same moment wait their turn instead of taking the same number.
-- Quotes saved with a number keep it.

CREATE OR REPLACE FUNCTION business.assign_quote_number()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_next bigint;
BEGIN
  IF NEW.quote_number IS NULL OR btrim(NEW.quote_number) = '' THEN
    PERFORM pg_advisory_xact_lock(hashtext('business.opportunities.quote_number'));
    SELECT GREATEST(COALESCE(max(o.quote_number::bigint), 0), 3802) + 1
      INTO v_next
      FROM business.opportunities o
     WHERE o.quote_number ~ '^[0-9]{1,15}$';
    NEW.quote_number := v_next::text;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER trg_opportunities_assign_quote_number
  BEFORE INSERT ON business.opportunities
  FOR EACH ROW EXECUTE FUNCTION business.assign_quote_number();

-- ---------------------------------------------------------------------------
-- Make a Change Order and its quote together
-- ---------------------------------------------------------------------------
-- Runs as the person calling it, so the usual access rules still apply.
-- Returns the new Change Order row (its opportunity_id opens the estimate sheet).

CREATE OR REPLACE FUNCTION neta_ops.create_change_order_quote(
  p_job_id uuid,
  p_title text,
  p_description text DEFAULT NULL,
  p_requested_by text DEFAULT NULL,
  p_requested_date date DEFAULT NULL,
  p_schedule_impact_days integer DEFAULT NULL,
  p_outside_contract boolean DEFAULT false
) RETURNS neta_ops.job_change_orders
LANGUAGE plpgsql SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_title text := btrim(COALESCE(p_title, ''));
  v_job record;
  v_parent record;
  v_no integer;
  v_opp_id uuid;
  v_row neta_ops.job_change_orders;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Sign in to add a Change Order' USING ERRCODE = '42501';
  END IF;
  IF v_title = '' THEN
    RAISE EXCEPTION 'Give the Change Order a title' USING ERRCODE = '22023';
  END IF;

  SELECT j.id, j.job_number, j.customer_id, j.opportunity_id, j.division, j.location
    INTO v_job
    FROM neta_ops.jobs j
   WHERE j.id = p_job_id AND j.deleted_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Job not found' USING ERRCODE = 'P0002';
  END IF;

  -- Contact, division and jobsite come from the job's original quote when it has one
  SELECT o.contact_id, o.amp_division, o.jobsite_location
    INTO v_parent
    FROM business.opportunities o
   WHERE o.id = v_job.opportunity_id;

  -- Next number on this job. The lock stops two people taking the same one.
  PERFORM pg_advisory_xact_lock(hashtext('neta_ops.job_change_orders:' || p_job_id::text));
  SELECT COALESCE(max(c.co_number), 0) + 1
    INTO v_no
    FROM neta_ops.job_change_orders c
   WHERE c.job_id = p_job_id;

  INSERT INTO business.opportunities (
    user_id, customer_id, contact_id, title, description, status,
    amp_division, jobsite_location, opportunity_type, change_order_job_id
  ) VALUES (
    v_uid,
    v_job.customer_id,
    v_parent.contact_id,
    format('Change Order %s, Job %s: %s', lpad(v_no::text, 3, '0'), COALESCE(v_job.job_number, ''), v_title),
    NULLIF(btrim(COALESCE(p_description, '')), ''),
    'quote',
    COALESCE(v_parent.amp_division, v_job.division),
    COALESCE(v_parent.jobsite_location, v_job.location),
    'other',
    p_job_id
  )
  RETURNING id INTO v_opp_id;

  INSERT INTO neta_ops.job_change_orders (
    job_id, user_id, co_number, title, description, amount, schedule_impact_days,
    status, requested_by, requested_date, opportunity_id, outside_contract
  ) VALUES (
    p_job_id,
    v_uid,
    v_no,
    v_title,
    NULLIF(btrim(COALESCE(p_description, '')), ''),
    0,
    p_schedule_impact_days,
    'draft',
    NULLIF(btrim(COALESCE(p_requested_by, '')), ''),
    p_requested_date,
    v_opp_id,
    COALESCE(p_outside_contract, false)
  )
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION neta_ops.create_change_order_quote(uuid, text, text, text, date, integer, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION neta_ops.create_change_order_quote(uuid, text, text, text, date, integer, boolean) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Keep the price in step with the letter
-- ---------------------------------------------------------------------------
-- Saving a letter writes quoted_amount on the quote. Copy it to the Change
-- Order until it's approved; after that the approved amount stays put.

CREATE OR REPLACE FUNCTION business.sync_change_order_price()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.quoted_amount IS NOT NULL AND NEW.quoted_amount IS DISTINCT FROM OLD.quoted_amount THEN
    UPDATE neta_ops.job_change_orders c
       SET amount = round(NEW.quoted_amount, 2),
           updated_at = now()
     WHERE c.opportunity_id = NEW.id
       AND c.status <> 'approved'
       AND c.amount IS DISTINCT FROM round(NEW.quoted_amount, 2);
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER trg_opportunities_change_order_price
  AFTER UPDATE OF quoted_amount ON business.opportunities
  FOR EACH ROW
  WHEN (NEW.change_order_job_id IS NOT NULL)
  EXECUTE FUNCTION business.sync_change_order_price();

-- ---------------------------------------------------------------------------
-- Deleting a Change Order deletes its quote
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION neta_ops.delete_change_order_quote()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF OLD.opportunity_id IS NOT NULL THEN
    DELETE FROM business.opportunities o
     WHERE o.id = OLD.opportunity_id
       AND o.change_order_job_id IS NOT NULL;
  END IF;
  RETURN OLD;
END;
$$;

CREATE OR REPLACE TRIGGER trg_job_change_orders_delete_quote
  AFTER DELETE ON neta_ops.job_change_orders
  FOR EACH ROW EXECUTE FUNCTION neta_ops.delete_change_order_quote();

REVOKE ALL ON FUNCTION business.assign_quote_number() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION business.sync_change_order_price() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION neta_ops.delete_change_order_quote() FROM PUBLIC, anon, authenticated;

COMMIT;

NOTIFY pgrst, 'reload schema';

-- Expected result: one row, every column true.
SELECT
  EXISTS (SELECT 1 FROM information_schema.columns
           WHERE table_schema = 'business' AND table_name = 'opportunities'
             AND column_name = 'change_order_job_id') AS quote_column,
  (SELECT count(*) = 2 FROM information_schema.columns
    WHERE table_schema = 'neta_ops' AND table_name = 'job_change_orders'
      AND column_name IN ('opportunity_id', 'outside_contract')) AS change_order_columns,
  to_regprocedure('neta_ops.create_change_order_quote(uuid, text, text, text, date, integer, boolean)') IS NOT NULL AS create_function,
  (SELECT count(*) = 3 FROM pg_trigger
    WHERE tgname IN ('trg_opportunities_assign_quote_number',
                     'trg_opportunities_change_order_price',
                     'trg_job_change_orders_delete_quote')) AS triggers;
