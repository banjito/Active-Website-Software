-- Add type field to issue_reports to differentiate between issues and feature requests
-- Run this in Supabase SQL Editor

-- Add type column if it doesn't exist
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'common' 
    AND table_name = 'issue_reports' 
    AND column_name = 'type'
  ) THEN
    ALTER TABLE common.issue_reports 
    ADD COLUMN type text NOT NULL DEFAULT 'issue' 
    CHECK (type IN ('issue', 'feature_request'));
    
    -- Create index for filtering
    CREATE INDEX IF NOT EXISTS idx_issue_reports_type ON common.issue_reports(type);
  END IF;
END $$;





