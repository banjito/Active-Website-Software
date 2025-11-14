-- Add fireteam_lead column to jobs table
-- This allows tracking the fireteam lead responsible for each job

-- Add the column to neta_ops.jobs table
ALTER TABLE neta_ops.jobs 
ADD COLUMN fireteam_lead TEXT;

-- Add comment for documentation
COMMENT ON COLUMN neta_ops.jobs.fireteam_lead IS 'The name of the person responsible for leading the fireteam on this job';

-- Also add to lab_ops.lab_jobs if it exists (for lab division jobs)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'lab_ops' AND table_name = 'lab_jobs') THEN
        ALTER TABLE lab_ops.lab_jobs ADD COLUMN fireteam_lead TEXT;
        COMMENT ON COLUMN lab_ops.lab_jobs.fireteam_lead IS 'The name of the person responsible for leading the fireteam on this job';
    END IF;
END $$;
