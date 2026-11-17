-- Update a custom form report to a newer published version of its form.
--
-- Reports are pinned to the form version they were created with. When a form
-- is improved, a report that is not finished yet can be moved onto the newer
-- version from the "Compare & update" screen. This function does that move:
--
--   * refuses approved and sent reports (they keep what they were issued with)
--   * refuses a stale copy: someone saved the report after the comparison opened
--   * only moves forward, and only to a version of the same form
--   * logs the move in the report history (report_activity kind 'form_version')
--
-- The app builds the new data (values laid onto the new version; nothing is
-- deleted). Run once in the Supabase SQL editor. Safe to run again.

ALTER TABLE neta_ops.report_activity DROP CONSTRAINT IF EXISTS report_activity_kind_check;
ALTER TABLE neta_ops.report_activity ADD CONSTRAINT report_activity_kind_check
  CHECK (kind IN ('status_change', 'review_comment', 'fix_note', 'action_item', 'field_flag', 'form_version'));

CREATE OR REPLACE FUNCTION neta_ops.upgrade_custom_form_instance_version(
  p_instance_id uuid,
  p_version_id uuid,
  p_expected_revision integer,
  p_data jsonb,
  p_status text DEFAULT NULL,
  p_note text DEFAULT NULL
) RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = neta_ops, public
AS $$
DECLARE
  v_instance neta_ops.custom_form_instances%ROWTYPE;
  v_version neta_ops.custom_form_template_versions%ROWTYPE;
  v_asset_id uuid;
  v_asset_status text;
  v_revision integer;
BEGIN
  IF NOT common.is_employee_user() THEN
    RAISE EXCEPTION 'Only staff can update a report''s form version.' USING ERRCODE = '42501';
  END IF;

  IF p_data IS NULL OR jsonb_typeof(p_data) <> 'object' THEN
    RAISE EXCEPTION 'The updated report data is missing.';
  END IF;

  SELECT * INTO v_instance
  FROM neta_ops.custom_form_instances
  WHERE id = p_instance_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Report not found.';
  END IF;

  IF p_expected_revision IS NOT NULL AND v_instance.revision <> p_expected_revision THEN
    RAISE EXCEPTION 'Someone saved this report after the comparison opened. Reload and compare again.'
      USING ERRCODE = '40001';
  END IF;

  SELECT * INTO v_version
  FROM neta_ops.custom_form_template_versions
  WHERE id = p_version_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'That form version was not found.';
  END IF;
  IF v_version.template_id IS DISTINCT FROM v_instance.template_id THEN
    RAISE EXCEPTION 'That version belongs to a different form.';
  END IF;
  IF v_instance.template_version IS NOT NULL AND v_version.version <= v_instance.template_version THEN
    RAISE EXCEPTION 'This report is already on version % or newer.', v_version.version;
  END IF;

  -- The report's status lives on its asset row.
  SELECT id, status INTO v_asset_id, v_asset_status
  FROM neta_ops.assets
  WHERE file_url = 'custom-form:/jobs/' || v_instance.job_id::text || '/custom-form/'
                   || v_instance.template_id::text || '/' || v_instance.id::text
  LIMIT 1;
  IF v_asset_id IS NULL THEN
    SELECT id, status INTO v_asset_id, v_asset_status
    FROM neta_ops.assets
    WHERE file_url LIKE 'custom-form:/jobs/%/' || v_instance.id::text
    LIMIT 1;
  END IF;
  IF lower(coalesce(v_asset_status, '')) IN ('approved', 'sent') THEN
    RAISE EXCEPTION 'Approved and sent reports keep the form version they were issued with.'
      USING ERRCODE = '42501';
  END IF;

  UPDATE neta_ops.custom_form_instances SET
    data = p_data,
    status = COALESCE(NULLIF(p_status, ''), status),
    template_version_id = v_version.id,
    template_version = v_version.version,
    template_checksum = v_version.checksum,
    template_name = v_version.name,
    schema_version = 2,
    updated_at = now()
  WHERE id = p_instance_id
  RETURNING revision INTO v_revision;

  IF v_asset_id IS NOT NULL THEN
    INSERT INTO neta_ops.report_activity (asset_id, kind, from_status, to_status, comment, actor_id)
    VALUES (
      v_asset_id,
      'form_version',
      'v' || COALESCE(v_instance.template_version::text, '?'),
      'v' || v_version.version::text,
      NULLIF(btrim(coalesce(p_note, '')), ''),
      auth.uid()
    );
  END IF;

  RETURN v_revision;
END;
$$;

REVOKE ALL ON FUNCTION neta_ops.upgrade_custom_form_instance_version(uuid, uuid, integer, jsonb, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION neta_ops.upgrade_custom_form_instance_version(uuid, uuid, integer, jsonb, text, text) FROM anon;
GRANT EXECUTE ON FUNCTION neta_ops.upgrade_custom_form_instance_version(uuid, uuid, integer, jsonb, text, text) TO authenticated;

-- Make the new function visible to the API right away.
NOTIFY pgrst, 'reload schema';
