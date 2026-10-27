-- Which company runs an engineering job: AMP or the engineering company (C&E Design).
--
-- Why: engineering-division jobs can belong to AMP or to C&E. A C&E job opens on the
-- engineering portal's job page (no NETA reports); an AMP one keeps the normal job page.
-- Every job starts as AMP; anyone who can edit the job can flip it.
--
--   neta_ops.jobs.engineering_company            true = C&E job
--   neta_ops.reset_engineering_company()         forces false outside the engineering division

ALTER TABLE neta_ops.jobs
  ADD COLUMN IF NOT EXISTS engineering_company boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN neta_ops.jobs.engineering_company IS
  'true = the job belongs to the engineering company (companyConfig.engineeringName, C&E Design) instead of AMP. Only meaningful when division = ''engineering''; forced false otherwise.';

-- ---------------------------------------------------------------------------
-- Only engineering jobs can be C&E
-- ---------------------------------------------------------------------------

-- A trigger rather than a check constraint, so moving a C&E job to another division
-- (job form, All Jobs, PM dashboard) quietly turns it back into an AMP job instead of
-- failing the save.
CREATE OR REPLACE FUNCTION neta_ops.reset_engineering_company() RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NEW.division IS DISTINCT FROM 'engineering' THEN
    NEW.engineering_company := false;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_jobs_reset_engineering_company ON neta_ops.jobs;
CREATE TRIGGER trg_jobs_reset_engineering_company
  BEFORE INSERT OR UPDATE OF division, engineering_company ON neta_ops.jobs
  FOR EACH ROW EXECUTE FUNCTION neta_ops.reset_engineering_company();
