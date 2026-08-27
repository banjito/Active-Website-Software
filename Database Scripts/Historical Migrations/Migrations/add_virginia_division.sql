-- Add 'virginia' to the jobs division check constraint
-- New AMP division: Virginia (internal id 'virginia', displayed as "Virginia")
--
-- business.opportunities.amp_division is unconstrained text, so nothing to change there.

-- Step 1: Check current constraint (for reference)
SELECT conname, pg_get_constraintdef(oid)
FROM pg_constraint
WHERE conname = 'jobs_division_check'
  AND conrelid = 'neta_ops.jobs'::regclass;

-- Step 2: Drop the existing constraint (required by PostgreSQL to modify it)
ALTER TABLE neta_ops.jobs
DROP CONSTRAINT IF EXISTS jobs_division_check;

-- Step 3: Recreate it with ALL existing values PLUS 'virginia'
ALTER TABLE neta_ops.jobs
ADD CONSTRAINT jobs_division_check
CHECK (division IN (
  'north_alabama', 'tennessee', 'georgia',
  'virginia',  -- new value
  'international', 'engineering',
  'calibration', 'armadillo', 'scavenger', 'lab', 'field_tech', 'hr', 'Decatur'
));

COMMENT ON COLUMN neta_ops.jobs.division IS 'Division responsible for the job (north_alabama, tennessee, georgia, virginia, international)';
