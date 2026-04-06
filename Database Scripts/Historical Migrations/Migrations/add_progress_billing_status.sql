-- Add progress_billing_status column to jobs table
-- This field tracks the progress billing status for jobs

-- Add the column if it doesn't exist
DO $$
BEGIN
    -- Check if column already exists
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_schema = 'neta_ops' 
        AND table_name = 'jobs' 
        AND column_name = 'progress_billing_status'
    ) THEN
        -- Add the column with a default value
        ALTER TABLE neta_ops.jobs 
        ADD COLUMN progress_billing_status TEXT 
        DEFAULT NULL;
        
        RAISE NOTICE 'Added progress_billing_status column to jobs table';
    ELSE
        RAISE NOTICE 'Column progress_billing_status already exists';
    END IF;
END $$;

-- Add a check constraint for valid values (optional - can be removed if you want free text)
-- Uncomment if you want to restrict to specific values:
/*
DO $$
BEGIN
    -- Drop existing constraint if it exists
    ALTER TABLE neta_ops.jobs DROP CONSTRAINT IF EXISTS jobs_progress_billing_status_check;
    
    -- Add constraint for valid values
    ALTER TABLE neta_ops.jobs ADD CONSTRAINT jobs_progress_billing_status_check 
    CHECK (progress_billing_status IS NULL OR progress_billing_status IN (
        'not_started',
        'in_progress',
        'completed',
        'on_hold',
        'cancelled'
    ));
    
    RAISE NOTICE 'Added check constraint for progress_billing_status';
END $$;
*/

-- Verify the column was added
SELECT 
    column_name,
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns 
WHERE table_schema = 'neta_ops' 
    AND table_name = 'jobs' 
    AND column_name = 'progress_billing_status';
