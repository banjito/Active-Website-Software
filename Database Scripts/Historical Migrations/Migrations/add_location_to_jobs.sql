-- Add site_address column to neta_ops.jobs table
-- This is needed for opportunity-to-job conversion to store jobsite location

-- Add the site_address column to the jobs table
ALTER TABLE neta_ops.jobs 
ADD COLUMN IF NOT EXISTS site_address TEXT;

-- Add a comment to document the purpose
COMMENT ON COLUMN neta_ops.jobs.site_address IS 'The jobsite location/address where work will be performed (used in reports)';

-- Show the updated table structure for site_address column
SELECT 
    column_name, 
    data_type, 
    is_nullable,
    column_default
FROM information_schema.columns 
WHERE table_schema = 'neta_ops' 
  AND table_name = 'jobs' 
  AND column_name = 'site_address';
