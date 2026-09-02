-- Gives reports from one upload a stable order.
--
-- A batch is written as a single INSERT, so every row's created_at DEFAULT
-- now() resolves to the same transaction timestamp. Ordering a batch by it is
-- therefore arbitrary, and a fourteen-string battery export came back with its
-- units shuffled — both in the report switcher and in the combined PDF, where
-- the reader expects the order the source document printed.
--
-- Existing rows keep a NULL here; those batches were saved without a recorded
-- order and there is nothing to backfill from. getAmplifyBatch() sorts NULLs
-- last and falls back to created_at for them.

ALTER TABLE neta_ops.amplify_reports
  ADD COLUMN IF NOT EXISTS batch_index INT;

COMMENT ON COLUMN neta_ops.amplify_reports.batch_index IS
  'Zero-based position of this report within its upload, in source-document order. NULL on rows saved before the column existed.';

CREATE INDEX IF NOT EXISTS amplify_reports_batch_order_idx
  ON neta_ops.amplify_reports (batch_id, batch_index);
