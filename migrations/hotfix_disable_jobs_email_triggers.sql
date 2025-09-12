-- Hotfix: disable jobs AFTER UPDATE triggers that read from users and fail RLS
-- This unblocks admin updates to job status/priority

-- Ensure correct schema qualification and only disable if triggers exist
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_trigger 
    WHERE tgrelid = 'neta_ops.jobs'::regclass 
      AND tgname = 'job_status_change_notification_trigger'
  ) THEN
    ALTER TABLE neta_ops.jobs DISABLE TRIGGER job_status_change_notification_trigger;
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_trigger 
    WHERE tgrelid = 'neta_ops.jobs'::regclass 
      AND tgname = 'trigger_ready_to_bill_email_jobs'
  ) THEN
    ALTER TABLE neta_ops.jobs DISABLE TRIGGER trigger_ready_to_bill_email_jobs;
  END IF;
END $$;

-- Note: set_job_number is a BEFORE INSERT helper and is left enabled


