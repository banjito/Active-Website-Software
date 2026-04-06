-- Add estimated_man_hours to jobs for manual entry when no estimate/letter proposal
-- Run in Supabase SQL Editor.

ALTER TABLE neta_ops.jobs
ADD COLUMN IF NOT EXISTS estimated_man_hours NUMERIC(10, 2);

COMMENT ON COLUMN neta_ops.jobs.estimated_man_hours IS 'Estimated man hours for the job; from linked opportunity estimate when set there, or manually entered when no letter proposal';
