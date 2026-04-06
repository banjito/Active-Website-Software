-- Add 'archived' status to assets table
-- This allows reports to be hidden from job view without deletion
-- Run this in your Supabase SQL Editor

-- Drop the existing constraint on neta_ops.assets
ALTER TABLE neta_ops.assets 
DROP CONSTRAINT IF EXISTS assets_status_check;

-- Add the new constraint with 'archived' status included
ALTER TABLE neta_ops.assets 
ADD CONSTRAINT assets_status_check 
CHECK (status IN ('in_progress', 'ready_for_review', 'approved', 'issue', 'sent', 'archived'));

-- Also update common.assets if it exists
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'common' AND table_name = 'assets') THEN
        ALTER TABLE common.assets DROP CONSTRAINT IF EXISTS assets_status_check;
        ALTER TABLE common.assets ADD CONSTRAINT assets_status_check 
        CHECK (status IN ('in_progress', 'ready_for_review', 'approved', 'issue', 'sent', 'archived'));
        RAISE NOTICE 'Updated common.assets status constraint to include archived';
    END IF;
END $$;

-- Verify the constraint was added correctly
SELECT 
    conname as constraint_name,
    pg_get_constraintdef(oid) as constraint_definition
FROM pg_constraint 
WHERE conrelid = 'neta_ops.assets'::regclass 
    AND contype = 'c'
    AND conname LIKE '%status%';

-- Add comment for documentation
COMMENT ON CONSTRAINT assets_status_check ON neta_ops.assets IS 'Valid asset status values: in_progress, ready_for_review, approved, issue, sent, archived. Archived assets are hidden from job view but not deleted.';
