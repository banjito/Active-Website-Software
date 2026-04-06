-- 1. Add new columns for pause tracking
DO $$ 
BEGIN
  -- Add paused_at column
  IF NOT EXISTS (
    SELECT 1 
    FROM information_schema.columns 
    WHERE table_schema = 'common' 
      AND table_name = 'issue_reports' 
      AND column_name = 'paused_at'
  ) THEN
    ALTER TABLE common.issue_reports 
    ADD COLUMN paused_at timestamptz;
    
    COMMENT ON COLUMN common.issue_reports.paused_at IS 'Timestamp when issue was last paused';
  END IF;

  -- Add total_paused_ms column to track accumulated pause time
  IF NOT EXISTS (
    SELECT 1 
    FROM information_schema.columns 
    WHERE table_schema = 'common' 
      AND table_name = 'issue_reports' 
      AND column_name = 'total_paused_ms'
  ) THEN
    ALTER TABLE common.issue_reports 
    ADD COLUMN total_paused_ms bigint NOT NULL DEFAULT 0;
    
    COMMENT ON COLUMN common.issue_reports.total_paused_ms IS 'Total time paused in milliseconds';
  END IF;
END $$;

-- 2. Update status check constraint to include 'paused'
ALTER TABLE common.issue_reports 
DROP CONSTRAINT IF EXISTS issue_reports_status_check;

ALTER TABLE common.issue_reports 
ADD CONSTRAINT issue_reports_status_check 
CHECK (status IN ('open','in_progress','paused','resolved','closed','duplicate','wontfix'));

-- 3. Update issue_updates table constraint
ALTER TABLE common.issue_updates 
DROP CONSTRAINT IF EXISTS issue_updates_new_status_check;

ALTER TABLE common.issue_updates 
ADD CONSTRAINT issue_updates_new_status_check 
CHECK (new_status IN ('open','in_progress','paused','resolved','closed','duplicate','wontfix'));

-- 4. Create trigger to automatically track pause time
CREATE OR REPLACE FUNCTION common.handle_issue_pause_resume()
RETURNS TRIGGER AS $$
BEGIN
  -- When status changes TO 'paused', record the pause timestamp
  IF NEW.status = 'paused' AND (OLD.status IS NULL OR OLD.status != 'paused') THEN
    NEW.paused_at := NOW();
  END IF;

  -- When status changes FROM 'paused' to something else, accumulate the pause time
  IF OLD.status = 'paused' AND NEW.status != 'paused' AND OLD.paused_at IS NOT NULL THEN
    -- Calculate pause duration and add to total
    NEW.total_paused_ms := COALESCE(OLD.total_paused_ms, 0) + 
                           EXTRACT(EPOCH FROM (NOW() - OLD.paused_at)) * 1000;
    -- Clear paused_at since we're no longer paused
    NEW.paused_at := NULL;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_issue_pause_resume ON common.issue_reports;
CREATE TRIGGER trg_issue_pause_resume
  BEFORE UPDATE ON common.issue_reports
  FOR EACH ROW
  EXECUTE FUNCTION common.handle_issue_pause_resume();

-- 5. Grant permissions (already covered by existing grants)
-- Issue reports table already has authenticated user access

COMMENT ON TRIGGER trg_issue_pause_resume ON common.issue_reports IS 
  'Automatically tracks pause/resume timestamps and accumulates total paused time';

