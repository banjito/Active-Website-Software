-- Add status column to assets table
-- This migration adds a status column to track asset approval status

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

-- Update existing assets to have 'in_progress' status if they don't have one
UPDATE neta_ops.assets SET status = 'in_progress' WHERE status IS NULL;

-- Add constraint to ensure valid status values
DO $$
BEGIN
  -- Drop constraint if it exists
  ALTER TABLE neta_ops.assets DROP CONSTRAINT IF EXISTS assets_status_check;
  
  -- Add new constraint
  ALTER TABLE neta_ops.assets ADD CONSTRAINT assets_status_check 
    CHECK (status IN ('in_progress', 'ready_for_review', 'approved', 'issue'));
    
  RAISE NOTICE 'Added status constraint to neta_ops.assets table';
END $$;

-- Create table to link assets to technical reports for approval workflow
CREATE TABLE IF NOT EXISTS neta_ops.asset_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id UUID REFERENCES neta_ops.assets(id) ON DELETE CASCADE,
  report_id UUID, -- References technical_reports table
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(asset_id, report_id)
);

-- Grant permissions
GRANT ALL ON neta_ops.asset_reports TO authenticated;
ALTER TABLE neta_ops.asset_reports DISABLE ROW LEVEL SECURITY; 