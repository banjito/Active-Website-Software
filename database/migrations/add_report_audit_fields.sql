ALTER TABLE IF EXISTS neta_ops.assets
  ADD COLUMN IF NOT EXISTS submitted_by UUID,
  ADD COLUMN IF NOT EXISTS approved_by UUID,
  ADD COLUMN IF NOT EXISTS sent_by UUID;

ALTER TABLE IF EXISTS neta_ops.technical_reports
  ADD COLUMN IF NOT EXISTS approved_by UUID,
  ADD COLUMN IF NOT EXISTS sent_by UUID;

COMMENT ON COLUMN neta_ops.assets.submitted_by IS 'User who submitted the report for review';
COMMENT ON COLUMN neta_ops.assets.approved_by IS 'User who approved the report';
COMMENT ON COLUMN neta_ops.assets.sent_by IS 'User who marked the report as sent';
COMMENT ON COLUMN neta_ops.technical_reports.approved_by IS 'User who approved the report';
COMMENT ON COLUMN neta_ops.technical_reports.sent_by IS 'User who marked the report as sent';

NOTIFY pgrst, 'reload schema';
