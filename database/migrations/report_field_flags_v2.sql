-- Field flags, phase 2: re-review. Run after report_field_flags.sql.
--
-- When a report comes back, the reviewer marks each old flag as fixed
-- (status 'resolved') or "still wrong". Still wrong saves the field's current
-- value as the new value_at_flag, so the tech sees it red again instead of
-- amber "Changed".
--
-- Flag events also go into the report history (neta_ops.report_activity,
-- kind 'field_flag'): flagged, fixed, removed.
--
-- Safe to run again.

BEGIN;

GRANT UPDATE (value_at_flag) ON TABLE neta_ops.report_field_flags TO authenticated;

ALTER TABLE neta_ops.report_activity DROP CONSTRAINT IF EXISTS report_activity_kind_check;
ALTER TABLE neta_ops.report_activity ADD CONSTRAINT report_activity_kind_check
  CHECK (kind IN ('status_change', 'review_comment', 'fix_note', 'action_item', 'field_flag'));

CREATE OR REPLACE FUNCTION neta_ops.log_field_flag_activity() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_reason text := CASE NEW.reason
    WHEN 'blank' THEN 'Blank'
    WHEN 'wrong_value' THEN 'Wrong value'
    WHEN 'check_units' THEN 'Check units'
    WHEN 'out_of_tolerance' THEN 'Out of tolerance'
    WHEN 'missing_photo' THEN 'Missing photo'
  END;
  v_label text := COALESCE(NULLIF(btrim(NEW.context), ''), 'Field');
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO neta_ops.report_activity (asset_id, kind, from_status, to_status, comment, actor_id)
    VALUES (
      NEW.asset_id,
      'field_flag',
      NULL,
      'open',
      v_label || COALESCE(': ' || v_reason, '') || COALESCE(': ' || NULLIF(btrim(NEW.note), ''), ''),
      COALESCE(auth.uid(), NEW.created_by)
    );
  ELSIF NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO neta_ops.report_activity (asset_id, kind, from_status, to_status, comment, actor_id)
    VALUES (
      NEW.asset_id,
      'field_flag',
      OLD.status,
      NEW.status,
      v_label,
      COALESCE(auth.uid(), NEW.closed_by)
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_report_field_flags_activity ON neta_ops.report_field_flags;
CREATE TRIGGER trg_report_field_flags_activity
  AFTER INSERT OR UPDATE OF status ON neta_ops.report_field_flags
  FOR EACH ROW EXECUTE FUNCTION neta_ops.log_field_flag_activity();

COMMIT;
