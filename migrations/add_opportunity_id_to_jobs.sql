-- Add opportunity_id field to neta_ops.jobs table
-- This will allow jobs to be linked back to their original opportunities

-- Add the opportunity_id column to the jobs table
ALTER TABLE neta_ops.jobs 
ADD COLUMN opportunity_id UUID REFERENCES business.opportunities(id);

-- Add an index for better query performance
CREATE INDEX idx_jobs_opportunity_id ON neta_ops.jobs(opportunity_id);

-- Add a comment to document the purpose
COMMENT ON COLUMN neta_ops.jobs.opportunity_id IS 'Links job back to the original opportunity it was converted from';

-- Show the updated table structure
SELECT 
    column_name, 
    data_type, 
    is_nullable,
    column_default
FROM information_schema.columns 
WHERE table_schema = 'neta_ops' 
  AND table_name = 'jobs' 
  AND column_name = 'opportunity_id';
