-- Nightly nudge for approvals that have been sitting unactioned.
--
-- Requisitions and offers stuck in pending_approval currently get exactly one
-- email, when they first land on someone. If that approver misses it, nothing
-- chases them. This schedules the approval-reminders edge function to re-send
-- the "your turn" mail to the current approver each night.
--
-- PREREQUISITES
--   1. Deploy the function:  supabase functions deploy approval-reminders
--   2. Set the two settings below. They are read at call time rather than
--      hardcoded, so this file carries no secrets and is safe to commit.
--
--      ALTER DATABASE postgres SET app.settings.supabase_url =
--        'https://<project-ref>.supabase.co';
--      ALTER DATABASE postgres SET app.settings.service_role_key =
--        '<service-role-key>';
--
--      Reconnect after setting these; current_setting only picks them up on a
--      new session.
--
-- The reminder window defaults to 3 days and is overridable per call via the
-- afterDays field, or globally with the APPROVAL_REMINDER_DAYS function secret.

CREATE OR REPLACE FUNCTION common.trigger_approval_reminders()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = common, net, public
AS $$
DECLARE
  base_url text := current_setting('app.settings.supabase_url', true);
  service_key text := current_setting('app.settings.service_role_key', true);
BEGIN
  IF base_url IS NULL OR service_key IS NULL THEN
    RAISE WARNING 'trigger_approval_reminders: app.settings.supabase_url / service_role_key not configured, skipping';
    RETURN;
  END IF;

  PERFORM net.http_post(
    url     := base_url || '/functions/v1/approval-reminders',
    headers := jsonb_build_object(
                 'Content-Type', 'application/json',
                 'Authorization', 'Bearer ' || service_key
               ),
    body    := '{}'::jsonb
  );
END;
$$;

COMMENT ON FUNCTION common.trigger_approval_reminders() IS
  'Invoked by pg_cron. Calls the approval-reminders edge function, which emails '
  'the current approver for any requisition or offer left pending too long.';

REVOKE ALL ON FUNCTION common.trigger_approval_reminders() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION common.trigger_approval_reminders() TO postgres;

-- 14:00 UTC daily: mid-morning US Central/Eastern, so a nudge lands during the
-- working day rather than overnight. Unschedule first so re-running is safe.
SELECT cron.unschedule('approval-reminders')
  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'approval-reminders');

SELECT cron.schedule(
  'approval-reminders',
  '0 14 * * 1-5',
  'SELECT common.trigger_approval_reminders();'
);
