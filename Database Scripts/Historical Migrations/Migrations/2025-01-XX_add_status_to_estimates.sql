-- Add status column to estimates table
-- Run this in Supabase SQL Editor

-- Add status column if it doesn't exist
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'business' 
    AND table_name = 'estimates' 
    AND column_name = 'status'
  ) THEN
    ALTER TABLE business.estimates 
    ADD COLUMN status text 
    CHECK (status IN ('in_progress', 'ready_for_review', 'approved_to_send', 'sent') OR status IS NULL);
    
    -- Create index for filtering by status
    CREATE INDEX IF NOT EXISTS idx_estimates_status ON business.estimates(status);
  END IF;
END $$;





