-- Change order tracker fields: when the customer asked, when they approved, and who approved.
-- approved_by (uuid) / approved_at stay as the audit stamp of the app user who clicked Approve.

ALTER TABLE neta_ops.job_change_orders
  ADD COLUMN IF NOT EXISTS requested_date date,
  ADD COLUMN IF NOT EXISTS approved_date date,
  ADD COLUMN IF NOT EXISTS approved_by_name text;

COMMENT ON COLUMN neta_ops.job_change_orders.requested_date IS 'Date the customer requested the change order.';
COMMENT ON COLUMN neta_ops.job_change_orders.approved_date IS 'Date the customer approved the change order (editable; may differ from approved_at).';
COMMENT ON COLUMN neta_ops.job_change_orders.approved_by_name IS 'Customer-side person who approved the change order (free text).';

-- Backfill existing rows from the dates we already have
UPDATE neta_ops.job_change_orders
SET requested_date = created_at::date
WHERE requested_date IS NULL;

UPDATE neta_ops.job_change_orders
SET approved_date = approved_at::date
WHERE approved_date IS NULL AND approved_at IS NOT NULL;

NOTIFY pgrst, 'reload schema';
