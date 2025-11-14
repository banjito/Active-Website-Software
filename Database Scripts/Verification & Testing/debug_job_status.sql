-- Debug script to check job status constraints and current values

-- 1. Check what status values currently exist in the jobs table
SELECT DISTINCT status, COUNT(*) as count
FROM neta_ops.jobs 
GROUP BY status
ORDER BY status;

-- 2. Check if there are any constraints on the status column
SELECT 
    conname as constraint_name,
    pg_get_constraintdef(oid) as constraint_definition
FROM pg_constraint 
WHERE conrelid = 'neta_ops.jobs'::regclass 
    AND contype = 'c';

-- 3. Check the column definition
SELECT 
    column_name,
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns 
WHERE table_schema = 'neta_ops' 
    AND table_name = 'jobs' 
    AND column_name = 'status';

-- 4. Test updating a job status to one of the new values (replace with actual job ID)
-- UPDATE neta_ops.jobs SET status = 'ready_to_bill' WHERE id = 'your-job-id-here';
