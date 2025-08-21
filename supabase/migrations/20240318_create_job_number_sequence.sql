-- Create a sequence for generating job numbers in neta_ops schema
CREATE SEQUENCE IF NOT EXISTS neta_ops.job_number_seq START 25097;

-- Create a function to generate a job number on job insert (schema-qualified)
CREATE OR REPLACE FUNCTION neta_ops.generate_job_number()
RETURNS TRIGGER AS $$
BEGIN
  NEW.job_number := nextval('neta_ops.job_number_seq')::text;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Add job_number column to neta_ops.jobs table if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT FROM information_schema.columns 
    WHERE table_schema = 'neta_ops' AND table_name = 'jobs' AND column_name = 'job_number'
  ) THEN
    ALTER TABLE neta_ops.jobs ADD COLUMN job_number TEXT DEFAULT NULL;
  END IF;
END $$;

-- Ensure sequence is owned by the column so it is managed together
ALTER SEQUENCE neta_ops.job_number_seq OWNED BY neta_ops.jobs.job_number;

-- Create a trigger to automatically set job_number on insert if not already set
DROP TRIGGER IF EXISTS set_job_number ON neta_ops.jobs;
CREATE TRIGGER set_job_number
BEFORE INSERT ON neta_ops.jobs
FOR EACH ROW
WHEN (NEW.job_number IS NULL)
EXECUTE FUNCTION neta_ops.generate_job_number();

-- Update existing jobs that don't have a job_number
UPDATE neta_ops.jobs
SET job_number = nextval('neta_ops.job_number_seq')::text
WHERE job_number IS NULL;