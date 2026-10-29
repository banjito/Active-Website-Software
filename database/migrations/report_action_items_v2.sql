-- Action items, round 2 (requester's answers, 2026-10-29). Run after
-- report_action_items.sql.
--
--   Statuses: Unaddressed, Verbally communicated, Formally notified, Closed,
--     Archive. Existing items move over: Open -> Unaddressed, Told customer ->
--     Verbally communicated, Not needed -> Archive.
--   Every status change needs a short note: who was told and/or how
--     (email, AMP report, the customer's own system, ...).
--   Categories: the requester's 19, plus Other. Old ones map to the closest.
--
-- These tables are new and quiet, but give up after 5 seconds rather than wait.
-- All or nothing: if it stops with "lock timeout", run it again.

SET lock_timeout = '5s';

BEGIN;

ALTER TABLE neta_ops.report_action_items DROP CONSTRAINT IF EXISTS report_action_items_status_check;
ALTER TABLE neta_ops.report_action_items DROP CONSTRAINT IF EXISTS report_action_items_category_check;

UPDATE neta_ops.report_action_items SET status = CASE status
  WHEN 'open' THEN 'unaddressed'
  WHEN 'told_customer' THEN 'verbally_communicated'
  WHEN 'not_needed' THEN 'archived'
  ELSE status END
WHERE status IN ('open', 'told_customer', 'not_needed');

UPDATE neta_ops.report_action_items SET category = CASE category
  WHEN 'missing_label_doc' THEN 'labeling_nameplate'
  WHEN 'recommendation' THEN 'recommendation_improvement'
  WHEN 'customer_to_supply' THEN 'other'
  ELSE category END
WHERE category IN ('missing_label_doc', 'recommendation', 'customer_to_supply');

-- Keep each item's timeline and the report history readable under the new names
UPDATE neta_ops.report_action_item_updates SET
  from_status = CASE from_status WHEN 'open' THEN 'unaddressed' WHEN 'told_customer' THEN 'verbally_communicated' WHEN 'not_needed' THEN 'archived' ELSE from_status END,
  to_status = CASE to_status WHEN 'open' THEN 'unaddressed' WHEN 'told_customer' THEN 'verbally_communicated' WHEN 'not_needed' THEN 'archived' ELSE to_status END
WHERE from_status IN ('open', 'told_customer', 'not_needed') OR to_status IN ('open', 'told_customer', 'not_needed');

UPDATE neta_ops.report_activity SET
  from_status = CASE from_status WHEN 'open' THEN 'unaddressed' WHEN 'told_customer' THEN 'verbally_communicated' WHEN 'not_needed' THEN 'archived' ELSE from_status END,
  to_status = CASE to_status WHEN 'open' THEN 'unaddressed' WHEN 'told_customer' THEN 'verbally_communicated' WHEN 'not_needed' THEN 'archived' ELSE to_status END
WHERE kind = 'action_item'
  AND (from_status IN ('open', 'told_customer', 'not_needed') OR to_status IN ('open', 'told_customer', 'not_needed'));

ALTER TABLE neta_ops.report_action_items ALTER COLUMN status SET DEFAULT 'unaddressed';
ALTER TABLE neta_ops.report_action_items ADD CONSTRAINT report_action_items_status_check
  CHECK (status IN ('unaddressed', 'verbally_communicated', 'formally_notified', 'closed', 'archived'));

ALTER TABLE neta_ops.report_action_items ADD CONSTRAINT report_action_items_category_check
  CHECK (category IN (
    'cosmetic_damage', 'corrosion_contamination', 'missing_hardware', 'labeling_nameplate',
    'drawing_spec_discrepancy', 'improper_workmanship', 'grounding_bonding', 'torque_connections',
    'clearance_access', 'settings_discrepancy', 'firmware_software', 'marginal_test_result',
    'unable_to_test', 'retest_recommended', 'thermal_anomaly', 'safety_concern',
    'code_standard_observation', 'manufacturer_recommendation', 'recommendation_improvement',
    'other'
  ));

DROP INDEX IF EXISTS neta_ops.idx_report_action_items_open;
CREATE INDEX IF NOT EXISTS idx_report_action_items_unaddressed
  ON neta_ops.report_action_items (asset_id) WHERE status = 'unaddressed';

-- New items start Unaddressed
CREATE OR REPLACE FUNCTION neta_ops.create_report_action_item(
  p_asset_id uuid,
  p_title text,
  p_description text,
  p_category text,
  p_priority text,
  p_notify uuid[]
) RETURNS neta_ops.report_action_items
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_report neta_ops.report_numbers%ROWTYPE;
  v_next integer;
  v_item neta_ops.report_action_items%ROWTYPE;
BEGIN
  IF NOT common.is_employee_user() THEN
    RAISE EXCEPTION 'Only staff can add action items' USING ERRCODE = '42501';
  END IF;

  -- Locks the report's number so two items added at once take turns
  SELECT * INTO v_report
  FROM neta_ops.report_numbers
  WHERE asset_id = p_asset_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'This report has no report number yet. It gets one once it is saved to a job (uploaded PDFs: once sent for review).';
  END IF;

  SELECT COALESCE(max(item_number), 0) + 1 INTO v_next
  FROM neta_ops.report_action_items
  WHERE asset_id = p_asset_id;

  INSERT INTO neta_ops.report_action_items
    (asset_id, job_id, item_number, item_code, title, description, category, priority, status, created_by)
  VALUES (
    p_asset_id,
    v_report.job_id,
    v_next,
    v_report.report_code || '-' || v_next,
    btrim(p_title),
    NULLIF(btrim(p_description), ''),
    COALESCE(p_category, 'other'),
    COALESCE(p_priority, 'normal'),
    'unaddressed',
    auth.uid()
  )
  RETURNING * INTO v_item;

  -- No notice to yourself; skip ids with no login rather than fail the item
  INSERT INTO neta_ops.report_action_item_recipients (item_id, user_id)
  SELECT v_item.id, u.id
  FROM unnest(COALESCE(p_notify, '{}'::uuid[])) AS u(id)
  WHERE u.id IS DISTINCT FROM auth.uid()
    AND EXISTS (SELECT 1 FROM auth.users au WHERE au.id = u.id)
  ON CONFLICT DO NOTHING;

  INSERT INTO neta_ops.report_action_item_updates (item_id, from_status, to_status, updated_by)
  VALUES (v_item.id, NULL, 'unaddressed', auth.uid());

  INSERT INTO neta_ops.report_activity (asset_id, kind, from_status, to_status, comment, actor_id)
  VALUES (p_asset_id, 'action_item', NULL, 'unaddressed', v_item.item_code || ': ' || v_item.title, auth.uid());

  RETURN v_item;
END;
$$;

-- A status change now needs a note: who was told and/or how
CREATE OR REPLACE FUNCTION neta_ops.set_report_action_item_status(
  p_item_id uuid,
  p_status text,
  p_note text
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_item neta_ops.report_action_items%ROWTYPE;
  v_note text := NULLIF(btrim(p_note), '');
BEGIN
  IF NOT common.is_employee_user() THEN
    RAISE EXCEPTION 'Only staff can change action items' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_item
  FROM neta_ops.report_action_items
  WHERE id = p_item_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Action item not found';
  END IF;
  IF p_status IS NOT DISTINCT FROM v_item.status THEN
    RETURN;
  END IF;
  IF v_note IS NULL THEN
    RAISE EXCEPTION 'Add a short note: who was told, and/or how (email, AMP report, customer''s system).';
  END IF;

  UPDATE neta_ops.report_action_items SET status = p_status WHERE id = p_item_id;

  INSERT INTO neta_ops.report_action_item_updates (item_id, from_status, to_status, note, updated_by)
  VALUES (p_item_id, v_item.status, p_status, v_note, auth.uid());

  INSERT INTO neta_ops.report_activity (asset_id, kind, from_status, to_status, comment, actor_id)
  VALUES (v_item.asset_id, 'action_item', v_item.status, p_status, v_item.item_code || ': ' || v_note, auth.uid());
END;
$$;

COMMIT;

NOTIFY pgrst, 'reload schema';

-- Expected result: one row per status with its count (no rows if no items yet).
SELECT status, count(*) FROM neta_ops.report_action_items GROUP BY status ORDER BY status;
