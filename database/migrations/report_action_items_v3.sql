-- Action items, round 3 (2026-10-29): drop the "Verbally communicated" status.
-- It counted as open anyway, so it behaved exactly like Unaddressed; a note on
-- the item ("Told Jim at walkdown") records the same thing. Run after
-- report_action_items_v2.sql.
--
-- Items in it go back to Unaddressed, with a line in their timeline saying so.
-- Past timeline and report history rows keep the old name as a record.
-- All or nothing: if it stops with "lock timeout", run it again.

SET lock_timeout = '5s';

BEGIN;

ALTER TABLE neta_ops.report_action_items DROP CONSTRAINT IF EXISTS report_action_items_status_check;

INSERT INTO neta_ops.report_action_item_updates (item_id, from_status, to_status, note, updated_by)
SELECT id, 'verbally_communicated', 'unaddressed',
       'Moved back automatically: the Verbally communicated status was removed. It stays open until formally notified.',
       NULL
FROM neta_ops.report_action_items
WHERE status = 'verbally_communicated';

UPDATE neta_ops.report_action_items SET status = 'unaddressed' WHERE status = 'verbally_communicated';

ALTER TABLE neta_ops.report_action_items ADD CONSTRAINT report_action_items_status_check
  CHECK (status IN ('unaddressed', 'formally_notified', 'closed', 'archived'));

COMMIT;

-- Expected result: one row per status with its count; no verbally_communicated.
SELECT status, count(*) FROM neta_ops.report_action_items GROUP BY status ORDER BY status;
