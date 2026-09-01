-- One report, one row on the job.
--
-- neta_ops.job_assets is the (job_id, asset_id) link the Reports tab lists from, and
-- nothing stopped the same pair being inserted twice. Saving a report creates its link
-- with a look-then-insert, which is not atomic: two saves a tenth of a second apart both
-- found no link and both wrote one. The report was then listed twice on the job, and
-- because both rows are the same asset they share an id -- so the checkbox on one ticked
-- both, and there was no way to select just the extra and remove it.
--
-- Job 26015 (Core Scientific DNN4) is where this was found; a scan of the whole table
-- turned up three duplicated pairs across two jobs.
--
-- This migration deletes the extra rows -- keeping the oldest of each set, which is the
-- one every other reference was made against -- and then adds the unique index that makes
-- a repeat impossible. The app tolerates the resulting 23505 on insert and treats it as
-- "the link already exists", which is the outcome it wanted anyway.
--
-- Nothing about the report itself is touched: the assets row, the report row and its
-- readings are untouched, only the duplicate link is removed.

BEGIN;

-- What is about to be deleted, for the record.
DO $$
DECLARE
  extra_rows bigint;
BEGIN
  SELECT count(*) - count(DISTINCT (job_id, asset_id))
    INTO extra_rows
    FROM neta_ops.job_assets
   WHERE asset_id IS NOT NULL;
  RAISE NOTICE 'job_assets: removing % duplicate link row(s)', extra_rows;
END $$;

DELETE FROM neta_ops.job_assets ja
 WHERE ja.asset_id IS NOT NULL
   AND EXISTS (
     SELECT 1
       FROM neta_ops.job_assets keep
      WHERE keep.job_id = ja.job_id
        AND keep.asset_id = ja.asset_id
        AND (keep.created_at, keep.id) < (ja.created_at, ja.id)
   );

-- asset_id is nullable, so the index is partial: a NULL asset_id is not a link to
-- anything and several of them are not a duplicate of each other.
CREATE UNIQUE INDEX IF NOT EXISTS job_assets_job_id_asset_id_key
    ON neta_ops.job_assets (job_id, asset_id)
 WHERE asset_id IS NOT NULL;

COMMENT ON INDEX neta_ops.job_assets_job_id_asset_id_key IS
  'One link per (job, asset). Without it a racing save listed the same report on the job twice, sharing one id between both rows.';

COMMIT;
