-- Add new job status values: ready_to_bill and billed
-- This script checks for existing constraints and updates them to include the new values

-- First, let's check if there's a status constraint on the jobs table
DO $$
BEGIN
    -- Check if there's a CHECK constraint on the status column
    IF EXISTS (
        SELECT 1 
        FROM information_schema.check_constraints cc
        JOIN information_schema.constraint_column_usage ccu ON cc.constraint_name = ccu.constraint_name
        WHERE ccu.table_schema = 'neta_ops' 
        AND ccu.table_name = 'jobs' 
        AND ccu.column_name = 'status'
    ) THEN
        -- Drop existing constraint
        RAISE NOTICE 'Found existing status constraint on jobs table, dropping it...';
        ALTER TABLE neta_ops.jobs DROP CONSTRAINT IF EXISTS jobs_status_check;
        ALTER TABLE neta_ops.jobs DROP CONSTRAINT IF EXISTS check_jobs_status;
        
        -- Add new constraint with all status values including the new ones
        ALTER TABLE neta_ops.jobs ADD CONSTRAINT jobs_status_check 
        CHECK (status IN (
            'pending', 
            'in_progress', 
            'completed', 
            'ready_to_bill', 
            'billed',
            'on_hold', 
            'cancelled'
        ));
        
        RAISE NOTICE 'Updated jobs status constraint to include ready_to_bill and billed';
    ELSE
        -- No constraint exists, so we can add one with all the values
        RAISE NOTICE 'No existing status constraint found, adding new constraint...';
        ALTER TABLE neta_ops.jobs ADD CONSTRAINT jobs_status_check 
        CHECK (status IN (
            'pending', 
            'in_progress', 
            'completed', 
            'ready_to_bill', 
            'billed',
            'on_hold', 
            'cancelled'
        ));
        
        RAISE NOTICE 'Added new jobs status constraint with all status values';
    END IF;
END $$;

-- Verify the constraint was added correctly
SELECT 
    conname as constraint_name,
    pg_get_constraintdef(oid) as constraint_definition
FROM pg_constraint 
WHERE conrelid = 'neta_ops.jobs'::regclass 
    AND contype = 'c'
    AND conname LIKE '%status%';
