-- Action items: something on a passing report that still needs doing or telling
-- the customer (e.g. cosmetic damage on new gear that tests fine). The ID is the
-- report number plus the item number: 26103-203-2. Run report_numbers.sql and
-- report_activity.sql first.
--
--   neta_ops.report_action_items             the items
--   neta_ops.report_action_item_recipients   who was told, and whether they've seen it
--   neta_ops.report_action_item_updates      status changes and notes on an item
--   neta_ops.report_action_item_photos       photos (files live in the documents bucket)
--
-- Items are created and moved between statuses only through the two functions
-- below, so the ID, the notices and the report's history can't be skipped.
-- Items are never deleted (use Not needed), so item numbers are never reused.

-- The foreign keys below lock the busy assets and jobs tables briefly. Give up
-- after 5 seconds instead of making report saves wait; if it stops with "lock
-- timeout", nothing was changed, so run it again a bit later.
SET lock_timeout = '5s';

BEGIN;

-- ---------------------------------------------------------------------------
-- Items
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS neta_ops.report_action_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id uuid NOT NULL REFERENCES neta_ops.assets(id) ON DELETE CASCADE,
  job_id uuid NOT NULL REFERENCES neta_ops.jobs(id) ON DELETE CASCADE,
  item_number integer NOT NULL,
  item_code text NOT NULL,
  title text NOT NULL CHECK (btrim(title) <> ''),
  description text,
  category text NOT NULL DEFAULT 'other' CHECK (category IN (
    'cosmetic_damage', 'missing_label_doc', 'recommendation', 'customer_to_supply', 'other'
  )),
  priority text NOT NULL DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'told_customer', 'closed', 'not_needed')),
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (asset_id, item_number)
);

CREATE INDEX IF NOT EXISTS idx_report_action_items_job ON neta_ops.report_action_items (job_id);
CREATE INDEX IF NOT EXISTS idx_report_action_items_code ON neta_ops.report_action_items (item_code);
CREATE INDEX IF NOT EXISTS idx_report_action_items_open
  ON neta_ops.report_action_items (asset_id) WHERE status = 'open';

DROP TRIGGER IF EXISTS trg_report_action_items_updated_at ON neta_ops.report_action_items;
CREATE TRIGGER trg_report_action_items_updated_at
  BEFORE UPDATE ON neta_ops.report_action_items
  FOR EACH ROW EXECUTE FUNCTION common.set_updated_at();

REVOKE ALL ON TABLE neta_ops.report_action_items FROM anon;
GRANT SELECT ON TABLE neta_ops.report_action_items TO authenticated;
-- Wording can be fixed directly; status only changes through the function below
GRANT UPDATE (title, description, category, priority) ON TABLE neta_ops.report_action_items TO authenticated;
GRANT ALL ON TABLE neta_ops.report_action_items TO service_role;

ALTER TABLE neta_ops.report_action_items ENABLE ROW LEVEL SECURITY;

-- Staff only: action items are internal, customers never see them
DROP POLICY IF EXISTS "report_action_items_select" ON neta_ops.report_action_items;
CREATE POLICY "report_action_items_select"
  ON neta_ops.report_action_items FOR SELECT
  TO authenticated
  USING (common.is_employee_user());

DROP POLICY IF EXISTS "report_action_items_update" ON neta_ops.report_action_items;
CREATE POLICY "report_action_items_update"
  ON neta_ops.report_action_items FOR UPDATE
  TO authenticated
  USING (common.is_employee_user())
  WITH CHECK (common.is_employee_user());

-- ---------------------------------------------------------------------------
-- Who to tell
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS neta_ops.report_action_item_recipients (
  item_id uuid NOT NULL REFERENCES neta_ops.report_action_items(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- Null until they open the item; drives the notification bell
  seen_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (item_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_report_action_item_recipients_unseen
  ON neta_ops.report_action_item_recipients (user_id) WHERE seen_at IS NULL;

REVOKE ALL ON TABLE neta_ops.report_action_item_recipients FROM anon;
GRANT SELECT, INSERT ON TABLE neta_ops.report_action_item_recipients TO authenticated;
GRANT UPDATE (seen_at) ON TABLE neta_ops.report_action_item_recipients TO authenticated;
GRANT ALL ON TABLE neta_ops.report_action_item_recipients TO service_role;

ALTER TABLE neta_ops.report_action_item_recipients ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "report_action_item_recipients_select" ON neta_ops.report_action_item_recipients;
CREATE POLICY "report_action_item_recipients_select"
  ON neta_ops.report_action_item_recipients FOR SELECT
  TO authenticated
  USING (common.is_employee_user());

-- Anyone on staff can add more people to an item
DROP POLICY IF EXISTS "report_action_item_recipients_insert" ON neta_ops.report_action_item_recipients;
CREATE POLICY "report_action_item_recipients_insert"
  ON neta_ops.report_action_item_recipients FOR INSERT
  TO authenticated
  WITH CHECK (common.is_employee_user() AND seen_at IS NULL);

-- Each person marks only their own notice as seen
DROP POLICY IF EXISTS "report_action_item_recipients_update_own" ON neta_ops.report_action_item_recipients;
CREATE POLICY "report_action_item_recipients_update_own"
  ON neta_ops.report_action_item_recipients FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Status changes and notes
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS neta_ops.report_action_item_updates (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  item_id uuid NOT NULL REFERENCES neta_ops.report_action_items(id) ON DELETE CASCADE,
  -- Both null for a plain note
  from_status text,
  to_status text,
  note text,
  updated_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_report_action_item_updates_item
  ON neta_ops.report_action_item_updates (item_id, created_at);

REVOKE ALL ON TABLE neta_ops.report_action_item_updates FROM anon;
GRANT SELECT, INSERT ON TABLE neta_ops.report_action_item_updates TO authenticated;
GRANT ALL ON TABLE neta_ops.report_action_item_updates TO service_role;

ALTER TABLE neta_ops.report_action_item_updates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "report_action_item_updates_select" ON neta_ops.report_action_item_updates;
CREATE POLICY "report_action_item_updates_select"
  ON neta_ops.report_action_item_updates FOR SELECT
  TO authenticated
  USING (common.is_employee_user());

-- The app may add plain notes, signed as the person logged in. Status rows come
-- from set_report_action_item_status().
DROP POLICY IF EXISTS "report_action_item_updates_insert_note" ON neta_ops.report_action_item_updates;
CREATE POLICY "report_action_item_updates_insert_note"
  ON neta_ops.report_action_item_updates FOR INSERT
  TO authenticated
  WITH CHECK (
    common.is_employee_user()
    AND updated_by = auth.uid()
    AND from_status IS NULL
    AND to_status IS NULL
    AND btrim(coalesce(note, '')) <> ''
  );

-- ---------------------------------------------------------------------------
-- Photos
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS neta_ops.report_action_item_photos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id uuid NOT NULL REFERENCES neta_ops.report_action_items(id) ON DELETE CASCADE,
  file_path text NOT NULL,
  file_url text NOT NULL,
  file_name text,
  uploaded_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_report_action_item_photos_item
  ON neta_ops.report_action_item_photos (item_id);

REVOKE ALL ON TABLE neta_ops.report_action_item_photos FROM anon;
GRANT SELECT, INSERT ON TABLE neta_ops.report_action_item_photos TO authenticated;
GRANT ALL ON TABLE neta_ops.report_action_item_photos TO service_role;

ALTER TABLE neta_ops.report_action_item_photos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "report_action_item_photos_select" ON neta_ops.report_action_item_photos;
CREATE POLICY "report_action_item_photos_select"
  ON neta_ops.report_action_item_photos FOR SELECT
  TO authenticated
  USING (common.is_employee_user());

DROP POLICY IF EXISTS "report_action_item_photos_insert" ON neta_ops.report_action_item_photos;
CREATE POLICY "report_action_item_photos_insert"
  ON neta_ops.report_action_item_photos FOR INSERT
  TO authenticated
  WITH CHECK (common.is_employee_user() AND uploaded_by = auth.uid());

-- ---------------------------------------------------------------------------
-- Report history: action item events show in "View history"
-- ---------------------------------------------------------------------------

ALTER TABLE neta_ops.report_activity DROP CONSTRAINT IF EXISTS report_activity_kind_check;
ALTER TABLE neta_ops.report_activity ADD CONSTRAINT report_activity_kind_check
  CHECK (kind IN ('status_change', 'review_comment', 'fix_note', 'action_item'));

-- ---------------------------------------------------------------------------
-- Create an item
-- ---------------------------------------------------------------------------

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
    (asset_id, job_id, item_number, item_code, title, description, category, priority, created_by)
  VALUES (
    p_asset_id,
    v_report.job_id,
    v_next,
    v_report.report_code || '-' || v_next,
    btrim(p_title),
    NULLIF(btrim(p_description), ''),
    COALESCE(p_category, 'other'),
    COALESCE(p_priority, 'normal'),
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
  VALUES (v_item.id, NULL, 'open', auth.uid());

  INSERT INTO neta_ops.report_activity (asset_id, kind, from_status, to_status, comment, actor_id)
  VALUES (p_asset_id, 'action_item', NULL, 'open', v_item.item_code || ': ' || v_item.title, auth.uid());

  RETURN v_item;
END;
$$;

REVOKE ALL ON FUNCTION neta_ops.create_report_action_item(uuid, text, text, text, text, uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION neta_ops.create_report_action_item(uuid, text, text, text, text, uuid[]) TO authenticated;

-- ---------------------------------------------------------------------------
-- Change an item's status
-- ---------------------------------------------------------------------------

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

  UPDATE neta_ops.report_action_items SET status = p_status WHERE id = p_item_id;

  INSERT INTO neta_ops.report_action_item_updates (item_id, from_status, to_status, note, updated_by)
  VALUES (p_item_id, v_item.status, p_status, v_note, auth.uid());

  INSERT INTO neta_ops.report_activity (asset_id, kind, from_status, to_status, comment, actor_id)
  VALUES (
    v_item.asset_id,
    'action_item',
    v_item.status,
    p_status,
    v_item.item_code || COALESCE(': ' || v_note, ''),
    auth.uid()
  );
END;
$$;

REVOKE ALL ON FUNCTION neta_ops.set_report_action_item_status(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION neta_ops.set_report_action_item_status(uuid, text, text) TO authenticated;

COMMIT;

NOTIFY pgrst, 'reload schema';

-- Expected result: "Success. No rows returned".
