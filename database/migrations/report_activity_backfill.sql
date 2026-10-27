-- Rebuild report history from before neta_ops.report_activity existed (run
-- report_activity.sql first). neta_ops.fn_backup_row() saves a full copy of an
-- assets row on every insert and update, so walking those copies in order shows
-- each status change and each reviewer note.
--
-- Who did it is a best guess from the stamps on the row (reviewed_by for Issue
-- and Approved, submitted_by for Ready for Review, sent_by for Sent).
-- Safe to run again: it clears its own earlier output first, and only reads
-- backups older than the first change the live trigger logged.

BEGIN;

DELETE FROM neta_ops.report_activity WHERE backfilled;

WITH cutoff AS (
  SELECT COALESCE(min(created_at), now()) AS at
  FROM neta_ops.report_activity
  WHERE NOT backfilled
),
versions AS (
  SELECT
    b.row_pk::uuid AS asset_id,
    b.saved_at,
    b.data,
    b.data->>'status' AS status,
    NULLIF(btrim(b.data->>'review_comments'), '') AS comment,
    lag(b.data->>'status') OVER w AS prev_status,
    lag(NULLIF(btrim(b.data->>'review_comments'), '')) OVER w AS prev_comment,
    row_number() OVER w AS n
  FROM neta_ops.backup_reports b, cutoff
  WHERE b.source_schema = 'neta_ops'
    AND b.source_table = 'assets'
    AND b.saved_at < cutoff.at
  WINDOW w AS (PARTITION BY b.row_pk ORDER BY b.saved_at, b.version)
)
INSERT INTO neta_ops.report_activity
  (asset_id, kind, from_status, to_status, comment, actor_id, created_at, backfilled)
SELECT
  v.asset_id,
  CASE WHEN v.status IS DISTINCT FROM v.prev_status THEN 'status_change' ELSE 'review_comment' END,
  v.prev_status,
  v.status,
  CASE WHEN v.status = 'issue' OR v.comment IS DISTINCT FROM v.prev_comment THEN v.comment END,
  NULLIF(CASE
    WHEN v.status IN ('issue', 'approved') THEN v.data->>'reviewed_by'
    WHEN v.status = 'ready_for_review' THEN v.data->>'submitted_by'
    WHEN v.status = 'sent' THEN v.data->>'sent_by'
  END, '')::uuid,
  v.saved_at,
  true
FROM versions v
-- The first copy has nothing to compare against
WHERE v.n > 1
  AND (
    v.status IS DISTINCT FROM v.prev_status
    OR (v.comment IS DISTINCT FROM v.prev_comment AND v.comment IS NOT NULL)
  )
  AND EXISTS (SELECT 1 FROM neta_ops.assets a WHERE a.id = v.asset_id);

COMMIT;

-- Expected result: one row per status, e.g. ready_for_review, approved, issue
-- with counts. Zero rows means the backups held no status changes.
SELECT to_status, count(*) AS changes, min(created_at)::date AS earliest
FROM neta_ops.report_activity
WHERE backfilled
GROUP BY to_status
ORDER BY changes DESC;
