-- Report history: every status change on a report, who made it, when, and the
-- reviewer's comment. Before this, a report kept one review_comments value that
-- each review overwrote, so earlier "Issue" notes were lost.
--
--   neta_ops.report_activity   one row per thing that happened to a report
--
-- Status changes are logged by a trigger on neta_ops.assets, because 40+ report
-- screens change status with their own code. The app only writes fix notes: what
-- the tech says they fixed before resubmitting a report that was sent to Issue.
-- Past history is rebuilt from backups by report_activity_backfill.sql (run after).

CREATE TABLE IF NOT EXISTS neta_ops.report_activity (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  asset_id uuid NOT NULL REFERENCES neta_ops.assets(id) ON DELETE CASCADE,
  -- status_change: status moved (comment = reviewer note, when there is one)
  -- review_comment: reviewer note edited without a status change
  -- fix_note: tech's answer to an Issue, written by the app
  kind text NOT NULL CHECK (kind IN ('status_change', 'review_comment', 'fix_note')),
  from_status text,
  to_status text,
  comment text,
  -- From the login, not from anything the browser sends
  actor_id uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  -- Rebuilt from neta_ops.backup_reports; who did it can be missing
  backfilled boolean NOT NULL DEFAULT false
);

CREATE INDEX IF NOT EXISTS idx_report_activity_asset ON neta_ops.report_activity (asset_id, created_at);

REVOKE ALL ON TABLE neta_ops.report_activity FROM anon;
GRANT SELECT, INSERT ON TABLE neta_ops.report_activity TO authenticated;
GRANT ALL ON TABLE neta_ops.report_activity TO service_role;

ALTER TABLE neta_ops.report_activity ENABLE ROW LEVEL SECURITY;

-- Staff only: reviewer notes are internal, customers never see them
DROP POLICY IF EXISTS "report_activity_select" ON neta_ops.report_activity;
CREATE POLICY "report_activity_select"
  ON neta_ops.report_activity FOR SELECT
  TO authenticated
  USING (common.is_employee_user());

-- The app may only add fix notes, signed as the person logged in
DROP POLICY IF EXISTS "report_activity_insert_fix_note" ON neta_ops.report_activity;
CREATE POLICY "report_activity_insert_fix_note"
  ON neta_ops.report_activity FOR INSERT
  TO authenticated
  WITH CHECK (
    common.is_employee_user()
    AND kind = 'fix_note'
    AND actor_id = auth.uid()
    AND backfilled = false
  );

CREATE OR REPLACE FUNCTION neta_ops.log_report_activity() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_comment text := NULLIF(btrim(NEW.review_comments), '');
  v_comment_changed boolean := NEW.review_comments IS DISTINCT FROM OLD.review_comments;
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO neta_ops.report_activity (asset_id, kind, from_status, to_status, comment, actor_id)
    VALUES (
      NEW.id,
      'status_change',
      OLD.status,
      NEW.status,
      -- An Issue always carries its note. Otherwise the old note is still sitting
      -- on the row, so only keep it when this save wrote a new one.
      CASE WHEN NEW.status = 'issue' OR v_comment_changed THEN v_comment END,
      -- Server-side updates have no login; fall back to the stamp the app writes
      COALESCE(auth.uid(), CASE
        WHEN NEW.status IN ('issue', 'approved') THEN NEW.reviewed_by
        WHEN NEW.status = 'ready_for_review' THEN NEW.submitted_by
        WHEN NEW.status = 'sent' THEN NEW.sent_by
      END)
    );
  ELSIF v_comment_changed AND v_comment IS NOT NULL THEN
    INSERT INTO neta_ops.report_activity (asset_id, kind, from_status, to_status, comment, actor_id)
    VALUES (NEW.id, 'review_comment', NEW.status, NEW.status, v_comment, COALESCE(auth.uid(), NEW.reviewed_by));
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION neta_ops.log_report_activity() FROM PUBLIC, anon;

DROP TRIGGER IF EXISTS trg_assets_report_activity ON neta_ops.assets;
CREATE TRIGGER trg_assets_report_activity
  AFTER UPDATE OF status, review_comments ON neta_ops.assets
  FOR EACH ROW EXECUTE FUNCTION neta_ops.log_report_activity();

NOTIFY pgrst, 'reload schema';

-- Expected result: "Success. No rows returned". Then run report_activity_backfill.sql.
