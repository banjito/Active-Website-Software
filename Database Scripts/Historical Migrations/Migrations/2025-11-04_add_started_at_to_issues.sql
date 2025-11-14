-- Add started_at timestamp to track when work begins on an issue
-- This allows tracking time-to-start and time-to-complete metrics

-- Add started_at column if it doesn't exist
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 
    FROM information_schema.columns 
    WHERE table_schema = 'common' 
      AND table_name = 'issue_reports' 
      AND column_name = 'started_at'
  ) THEN
    ALTER TABLE common.issue_reports 
    ADD COLUMN started_at timestamptz;
    
    -- Add a helpful comment
    COMMENT ON COLUMN common.issue_reports.started_at IS 'Timestamp when status changed to in_progress';
  END IF;
END $$;

