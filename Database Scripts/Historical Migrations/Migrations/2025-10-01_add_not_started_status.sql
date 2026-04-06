-- Migration: Add 'not started' status to assets table
-- Date: 2025-10-01
-- Description: Adds 'not started' as a valid status for assets (reports), positioned before 'in_progress'

-- First, check and update any NULL status values to 'in_progress' (existing behavior)
UPDATE neta_ops.assets 
SET status = 'in_progress' 
WHERE status IS NULL;

-- Update any invalid status values to 'in_progress' as a safe default
-- (In case there are any other values not in our constraint list)
UPDATE neta_ops.assets 
SET status = 'in_progress' 
WHERE status NOT IN ('in_progress', 'ready_for_review', 'approved', 'issue', 'sent', 'archived');

-- Drop the existing constraint
ALTER TABLE neta_ops.assets 
DROP CONSTRAINT IF EXISTS assets_status_check;

-- Add the new constraint with 'not started' status
ALTER TABLE neta_ops.assets 
ADD CONSTRAINT assets_status_check 
CHECK (status IN ('not started', 'in_progress', 'ready_for_review', 'approved', 'issue', 'sent', 'archived'));

-- Update the default value for status column to 'not started' for new assets
ALTER TABLE neta_ops.assets 
ALTER COLUMN status SET DEFAULT 'not started';

