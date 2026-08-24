-- Job requisitions: support hourly pay in addition to salary.
--
-- Adds a pay_type discriminator so the min/max range can be read as either an
-- annual salary or an hourly rate. Existing rows keep their current meaning
-- (annual salary), which is why the default is 'salary'.
--
-- Priority was removed from the requisition UI. The column is left in place so
-- existing rows and the NOT NULL default keep working; nothing reads it now.

ALTER TABLE common.job_requisitions
  ADD COLUMN IF NOT EXISTS pay_type character varying(10) DEFAULT 'salary';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'job_requisitions_pay_type_check'
      AND conrelid = 'common.job_requisitions'::regclass
  ) THEN
    ALTER TABLE common.job_requisitions
      ADD CONSTRAINT job_requisitions_pay_type_check
      CHECK (pay_type IN ('salary', 'hourly'));
  END IF;
END $$;

UPDATE common.job_requisitions SET pay_type = 'salary' WHERE pay_type IS NULL;

-- Mirror onto the legacy hr schema copy if this instance still has one.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'hr' AND table_name = 'job_requisitions'
  ) THEN
    ALTER TABLE hr.job_requisitions
      ADD COLUMN IF NOT EXISTS pay_type character varying(10) DEFAULT 'salary';
    UPDATE hr.job_requisitions SET pay_type = 'salary' WHERE pay_type IS NULL;
  END IF;
END $$;

-- Priority is no longer collected by the UI; make sure inserts that omit it
-- still satisfy the NOT NULL constraint.
ALTER TABLE common.job_requisitions
  ALTER COLUMN priority SET DEFAULT 'medium';
