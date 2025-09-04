-- Add site_address column to neta_ops.jobs if it does not exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'neta_ops'
      AND table_name = 'jobs'
      AND column_name = 'site_address'
  ) THEN
    ALTER TABLE neta_ops.jobs
    ADD COLUMN site_address text;
  END IF;
END $$;

-- Optional: comment for documentation
COMMENT ON COLUMN neta_ops.jobs.site_address IS 'Physical site address for the job location (preferred for reports)';


