-- Asset Approval Workflow Setup
-- Run this SQL in your Supabase SQL Editor

-- 1. Add status column to assets table
DO $$
DECLARE
  column_exists BOOLEAN;
BEGIN
  -- Check if status column already exists in neta_ops.assets
  SELECT EXISTS (
    SELECT FROM information_schema.columns 
    WHERE table_schema = 'neta_ops' 
    AND table_name = 'assets' 
    AND column_name = 'status'
  ) INTO column_exists;
  
  IF NOT column_exists THEN
    ALTER TABLE neta_ops.assets ADD COLUMN status TEXT DEFAULT 'in_progress';
    RAISE NOTICE 'Added status column to neta_ops.assets table';
  END IF;
  
  -- Also check for common.assets if it exists
  SELECT EXISTS (
    SELECT FROM information_schema.tables 
    WHERE table_schema = 'common' 
    AND table_name = 'assets'
  ) INTO column_exists;
  
  IF column_exists THEN
    SELECT EXISTS (
      SELECT FROM information_schema.columns 
      WHERE table_schema = 'common' 
      AND table_name = 'assets' 
      AND column_name = 'status'
    ) INTO column_exists;
    
    IF NOT column_exists THEN
      ALTER TABLE common.assets ADD COLUMN status TEXT DEFAULT 'in_progress';
      RAISE NOTICE 'Added status column to common.assets table';
    END IF;
  END IF;
END $$;

-- 2. Update existing assets to have 'in_progress' status if they don't have one
UPDATE neta_ops.assets SET status = 'in_progress' WHERE status IS NULL;

-- 3. Add constraint to ensure valid status values
DO $$
BEGIN
  -- Drop constraint if it exists
  ALTER TABLE neta_ops.assets DROP CONSTRAINT IF EXISTS assets_status_check;
  
  -- Add new constraint
  ALTER TABLE neta_ops.assets ADD CONSTRAINT assets_status_check 
    CHECK (status IN ('in_progress', 'ready_for_review', 'approved', 'issue'));
    
  RAISE NOTICE 'Added status constraint to neta_ops.assets table';
END $$;

-- 4. Create table to link assets to technical reports for approval workflow
CREATE TABLE IF NOT EXISTS neta_ops.asset_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id UUID REFERENCES neta_ops.assets(id) ON DELETE CASCADE,
  report_id UUID, -- References technical_reports table
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(asset_id, report_id)
);

-- 5. Grant permissions
GRANT ALL ON neta_ops.asset_reports TO authenticated;
ALTER TABLE neta_ops.asset_reports DISABLE ROW LEVEL SECURITY;

-- 6. Create technical_reports table if it doesn't exist (for the approval workflow)
CREATE TABLE IF NOT EXISTS neta_ops.technical_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL,
  title TEXT NOT NULL,
  report_type TEXT NOT NULL,
  submitted_by UUID NOT NULL,
  submitted_at TIMESTAMPTZ DEFAULT now(),
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'submitted', 'in-review', 'approved', 'rejected', 'archived')),
  review_comments TEXT,
  reviewed_by UUID,
  reviewed_at TIMESTAMPTZ,
  revision_history JSONB DEFAULT '[]'::jsonb,
  current_version INTEGER DEFAULT 1,
  report_data JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 7. Grant permissions for technical_reports
GRANT ALL ON neta_ops.technical_reports TO authenticated;
ALTER TABLE neta_ops.technical_reports DISABLE ROW LEVEL SECURITY;

-- 8. Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_assets_status ON neta_ops.assets(status);
CREATE INDEX IF NOT EXISTS idx_asset_reports_asset_id ON neta_ops.asset_reports(asset_id);
CREATE INDEX IF NOT EXISTS idx_asset_reports_report_id ON neta_ops.asset_reports(report_id);
CREATE INDEX IF NOT EXISTS idx_technical_reports_job_id ON neta_ops.technical_reports(job_id);
CREATE INDEX IF NOT EXISTS idx_technical_reports_status ON neta_ops.technical_reports(status);
CREATE INDEX IF NOT EXISTS idx_technical_reports_submitted_by ON neta_ops.technical_reports(submitted_by);

-- Success message
SELECT 'Asset approval workflow setup completed successfully!' as result; 