-- Add tracking_plan column to neta_ops.jobs for job asset tracking plan
-- Stores a JSON object mapping report type slugs to target quantities

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'neta_ops'
      AND table_name = 'jobs'
      AND column_name = 'tracking_plan'
  ) THEN
    ALTER TABLE neta_ops.jobs
      ADD COLUMN tracking_plan JSONB DEFAULT '{}'::jsonb;
  END IF;
END $$;

COMMENT ON COLUMN neta_ops.jobs.tracking_plan IS 'Job asset tracking plan: { "<report-slug>": <targetQuantity>, ... }';

