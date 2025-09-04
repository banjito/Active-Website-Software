-- Fix the assets table constraint to include 'sent' status
-- Run this in your Supabase SQL Editor

-- First, let's check what the current constraint looks like
SELECT 
    conname as constraint_name,
    pg_get_constraintdef(oid) as constraint_definition
FROM pg_constraint 
WHERE conrelid = 'neta_ops.assets'::regclass 
    AND contype = 'c';

-- Drop the existing constraint
ALTER TABLE neta_ops.assets 
DROP CONSTRAINT IF EXISTS assets_status_check;

-- Add the new constraint with 'sent' status included
ALTER TABLE neta_ops.assets 
ADD CONSTRAINT assets_status_check 
CHECK (status IN ('in_progress', 'ready_for_review', 'approved', 'issue', 'sent'));

-- Verify the constraint was added correctly
SELECT 
    conname as constraint_name,
    pg_get_constraintdef(oid) as constraint_definition
FROM pg_constraint 
WHERE conrelid = 'neta_ops.assets'::regclass 
    AND contype = 'c';
