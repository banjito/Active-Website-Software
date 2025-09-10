-- Add deleted_at column to jobs tables for soft delete functionality
-- This allows jobs to be "deleted" without actually removing them from the database

-- Add deleted_at to neta_ops.jobs table
ALTER TABLE neta_ops.jobs 
ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP WITH TIME ZONE DEFAULT NULL;

-- Add deleted_at to lab_ops.lab_jobs table  
ALTER TABLE lab_ops.lab_jobs 
ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP WITH TIME ZONE DEFAULT NULL;

-- Create indexes for better performance when filtering out deleted jobs
CREATE INDEX IF NOT EXISTS idx_jobs_deleted_at ON neta_ops.jobs(deleted_at);
CREATE INDEX IF NOT EXISTS idx_lab_jobs_deleted_at ON lab_ops.lab_jobs(deleted_at);

-- Add comments to document the soft delete functionality
COMMENT ON COLUMN neta_ops.jobs.deleted_at IS 'Timestamp when job was soft deleted. NULL means job is active.';
COMMENT ON COLUMN lab_ops.lab_jobs.deleted_at IS 'Timestamp when job was soft deleted. NULL means job is active.';
