-- Monthly calibration due report.
--
-- Emails everything whose calibration falls due in the next 60 days, plus anything
-- already past due, grouped by site, truck or person. Goes to the admin-managed
-- recipient list (common.app_settings key 'calibration_report_recipients') unioned with
-- individual opt-ins.
--
-- PREREQUISITES
--   1. Deploy the function:  supabase functions deploy monthly-calibration-due-report
--   2. Set the two settings below, once per instance. They are read at call time rather
--      than hardcoded, so this file carries no secrets and is safe to commit.
--
--      ALTER DATABASE postgres SET app.settings.supabase_url =
--        'https://<project-ref>.supabase.co';
--      ALTER DATABASE postgres SET app.settings.service_role_key =
--        '<service-role-key>';
--
--      Reconnect afterwards; current_setting only picks these up on a new session.
--      If the approval-reminders job is already running, these are set already.
--
-- Safe to re-run.

CREATE OR REPLACE FUNCTION common.trigger_monthly_calibration_report()
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
    RAISE WARNING 'trigger_monthly_calibration_report: app.settings.supabase_url / service_role_key not configured, skipping';
    RETURN;
  END IF;

  PERFORM net.http_post(
    url     := base_url || '/functions/v1/monthly-calibration-due-report',
    headers := jsonb_build_object(
                 'Content-Type', 'application/json',
                 'Authorization', 'Bearer ' || service_key
               ),
    body    := '{}'::jsonb
  );
END;
$$;

COMMENT ON FUNCTION common.trigger_monthly_calibration_report() IS
  'Invoked by pg_cron on the 1st of each month. Calls the monthly-calibration-due-report '
  'edge function, which emails equipment due for calibration within 60 days.';

REVOKE ALL ON FUNCTION common.trigger_monthly_calibration_report() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION common.trigger_monthly_calibration_report() TO postgres;

-- 14:00 UTC on the 1st: 8:00 AM Central, matching the other morning digests, so it lands
-- before the day starts rather than overnight. Unschedule first so re-running is safe.
SELECT cron.unschedule('monthly-calibration-report')
  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'monthly-calibration-report');

SELECT cron.schedule(
  'monthly-calibration-report',
  '0 14 1 * *',
  'SELECT common.trigger_monthly_calibration_report();'
);
