-- Allow deleting opportunities when jobs reference them.
-- Jobs keep their data; opportunity_id is set to NULL on those jobs.
-- Run this if you get: update or delete on table "opportunities" violates
-- foreign key constraint "jobs_opportunity_id_fkey" on table "jobs"

ALTER TABLE neta_ops.jobs
  DROP CONSTRAINT IF EXISTS jobs_opportunity_id_fkey,
  ADD CONSTRAINT jobs_opportunity_id_fkey
    FOREIGN KEY (opportunity_id) REFERENCES business.opportunities(id) ON DELETE SET NULL;
