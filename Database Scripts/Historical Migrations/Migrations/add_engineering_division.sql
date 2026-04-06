-- Add 'engineering' to the jobs division check constraint
-- This allows opportunities with amp_division='engineering' to be converted to jobs

-- Step 1: Check current constraint (for reference)
SELECT conname, pg_get_constraintdef(oid) 
FROM pg_constraint 
WHERE conname = 'jobs_division_check' 
  AND conrelid = 'neta_ops.jobs'::regclass;

-- Step 2: Drop the existing constraint (required by PostgreSQL to modify it)
ALTER TABLE neta_ops.jobs 
DROP CONSTRAINT IF EXISTS jobs_division_check;

-- Step 3: Recreate it with ALL existing values PLUS 'engineering'
-- Note: PostgreSQL requires drop+recreate to modify constraints - this is safe and standard
ALTER TABLE neta_ops.jobs 
ADD CONSTRAINT jobs_division_check 
CHECK (division IN (
  'north_alabama', 'tennessee', 'georgia', 'international',
  'engineering',  -- ⭐ ONLY NEW VALUE ADDED
  'calibration', 'armadillo', 'scavenger', 'lab', 'field_tech', 'hr', 'Decatur'
));

