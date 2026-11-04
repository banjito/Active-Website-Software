-- TimeStAMP: missed-time email, holidays, and start/end odometer.
--
-- Why (Oct 28 leadership meeting):
--   - Anyone with no time logged on a work day gets an email the next morning.
--     Monday checks Friday, Saturday and Sunday. Holidays, approved time off,
--     people who don't clock in, and deactivated accounts are skipped.
--   - Mileage is entered as start and end odometer readings instead of one lump
--     number, for accurate reimbursement. miles stays as end minus start, so older
--     rows and everything that reads miles keep working.
--
-- The email starts OFF. Payroll turns it on in HR > Timesheets > Missed-time email
-- on the day crews move to TimeStAMP, so nobody on Workforce gets mailed.
--
--   time_settings.missed_time_emails   the on/off switch (default off)
--   time_settings.holidays             days nobody is expected to clock in
--   time_day_extras.odometer_start/end readings; miles is worked out from them
--   time_missed_days()                 who to email and for which days
--   trigger_missed_time_email()        pg_cron calls the missed-time-email function
--
-- PREREQUISITES
--   1. Deploy the function:  supabase functions deploy missed-time-email
--   2. app.settings.supabase_url and app.settings.service_role_key must be set
--      (they already are if approval reminders run). See schedule_approval_reminders.sql.
--
-- Safe to run twice.

SET lock_timeout = '5s';

-- ---------------------------------------------------------------------------
-- Settings: the switch and the holiday list
-- ---------------------------------------------------------------------------

ALTER TABLE common.time_settings
  ADD COLUMN IF NOT EXISTS missed_time_emails boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS holidays date[] NOT NULL DEFAULT '{}';

COMMENT ON COLUMN common.time_settings.missed_time_emails IS
  'When true, people with no time on a work day get an email the next morning. Off until crews leave Workforce.';
COMMENT ON COLUMN common.time_settings.holidays IS
  'Company holidays. Nobody gets a missed-time email for these days.';

-- ---------------------------------------------------------------------------
-- Odometer readings
-- ---------------------------------------------------------------------------

ALTER TABLE common.time_day_extras
  ADD COLUMN IF NOT EXISTS odometer_start numeric(8,1) CHECK (odometer_start >= 0),
  ADD COLUMN IF NOT EXISTS odometer_end numeric(8,1) CHECK (odometer_end >= 0);

-- With both readings, miles is always end minus start, whatever the phone sent.
-- Clearing a reading that had made the miles clears the miles too. A day with no
-- readings keeps its miles, so older lump-sum entries are left alone.
CREATE OR REPLACE FUNCTION common.time_day_extras_miles() RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NEW.odometer_start IS NOT NULL AND NEW.odometer_end IS NOT NULL THEN
    IF NEW.odometer_end < NEW.odometer_start THEN
      RAISE EXCEPTION 'The end reading is lower than the start reading.';
    END IF;
    NEW.miles := round(NEW.odometer_end - NEW.odometer_start, 1);
  ELSIF TG_OP = 'UPDATE'
        AND OLD.odometer_start IS NOT NULL AND OLD.odometer_end IS NOT NULL THEN
    NEW.miles := 0;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_time_day_extras_miles ON common.time_day_extras;
CREATE TRIGGER trg_time_day_extras_miles
  BEFORE INSERT OR UPDATE ON common.time_day_extras
  FOR EACH ROW EXECUTE FUNCTION common.time_day_extras_miles();

-- ---------------------------------------------------------------------------
-- Who missed time
-- ---------------------------------------------------------------------------

-- One row per person with the work days they logged nothing on. Days checked:
-- yesterday, or Friday through Sunday when today is Monday (company time zone).
-- Returns nothing while the switch is off, unless p_ignore_switch (test runs).
CREATE OR REPLACE FUNCTION common.time_missed_days(
  p_today date DEFAULT NULL,
  p_ignore_switch boolean DEFAULT false
)
RETURNS TABLE (profile_id uuid, email text, full_name text, missed_days date[])
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  WITH settings AS (
    SELECT s.missed_time_emails, s.holidays FROM common.time_settings s LIMIT 1
  ),
  today AS (
    SELECT COALESCE(p_today, common.time_today()) AS d
  ),
  days AS (
    SELECT gs::date AS day
      FROM today t
     CROSS JOIN LATERAL generate_series(
             t.d - CASE WHEN extract(dow FROM t.d) = 1 THEN 3 ELSE 1 END,
             t.d - 1,
             interval '1 day'
           ) AS gs
  ),
  missed AS (
    SELECT tp.profile_id, dy.day
      FROM common.time_people tp
     CROSS JOIN days dy
      LEFT JOIN common.profiles pr ON pr.id = tp.profile_id
     WHERE tp.clocks_in
       AND COALESCE(pr.is_active, true)
       AND extract(dow FROM dy.day)::smallint = ANY (tp.work_days)
       -- Not before they were set up in TimeStAMP
       AND tp.created_at::date <= dy.day
       AND NOT (dy.day = ANY (COALESCE((SELECT holidays FROM settings), '{}'::date[])))
       AND NOT EXISTS (
             SELECT 1 FROM common.time_entries e
              WHERE e.profile_id = tp.profile_id AND e.work_date = dy.day
           )
       AND NOT EXISTS (
             SELECT 1 FROM common.technician_time_off o
              WHERE o.user_id = tp.profile_id
                AND o.status = 'approved'
                AND dy.day BETWEEN o.start_date AND o.end_date
           )
  )
  SELECT m.profile_id,
         u.email::text,
         pr.full_name::text,
         array_agg(m.day ORDER BY m.day)
    FROM missed m
    JOIN auth.users u ON u.id = m.profile_id
    LEFT JOIN common.profiles pr ON pr.id = m.profile_id
   WHERE p_ignore_switch OR COALESCE((SELECT missed_time_emails FROM settings), false)
   GROUP BY m.profile_id, u.email, pr.full_name;
$$;

-- Only the email function (service role) may ask. It lists people and emails.
REVOKE ALL ON FUNCTION common.time_missed_days(date, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION common.time_missed_days(date, boolean) TO service_role;

-- ---------------------------------------------------------------------------
-- Schedule
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION common.trigger_missed_time_email()
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
    RAISE WARNING 'trigger_missed_time_email: app.settings.supabase_url / service_role_key not configured, skipping';
    RETURN;
  END IF;

  PERFORM net.http_post(
    url     := base_url || '/functions/v1/missed-time-email',
    headers := jsonb_build_object(
                 'Content-Type', 'application/json',
                 'Authorization', 'Bearer ' || service_key
               ),
    body    := '{}'::jsonb
  );
END;
$$;

REVOKE ALL ON FUNCTION common.trigger_missed_time_email() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION common.trigger_missed_time_email() TO postgres;

-- 13:00 UTC on weekdays: 7 AM Central in winter, 8 AM in summer.
-- The switch is checked when it runs, so this can be scheduled before go-live.
SELECT cron.unschedule('missed-time-email')
  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'missed-time-email');

SELECT cron.schedule(
  'missed-time-email',
  '0 13 * * 1-5',
  'SELECT common.trigger_missed_time_email();'
);

NOTIFY pgrst, 'reload schema';

-- Expected result: one row. switch_on = false, holidays = {}, odometer_columns = 2,
-- scheduled = true.
SELECT (SELECT missed_time_emails FROM common.time_settings LIMIT 1) AS switch_on,
       (SELECT holidays FROM common.time_settings LIMIT 1) AS holidays,
       (SELECT count(*) FROM information_schema.columns
         WHERE table_schema = 'common' AND table_name = 'time_day_extras'
           AND column_name IN ('odometer_start', 'odometer_end')) AS odometer_columns,
       EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'missed-time-email') AS scheduled;
