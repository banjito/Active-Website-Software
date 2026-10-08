-- TimeStAMP, part 1: the clock
--
-- Why: TimeStAMP is the internal time clock. Hours are kept here, approved here,
-- and only then sent to QuickBooks Time, which is where payroll reads them.
--
-- What this adds (all in the common schema):
--   time_people      who uses the clock, and which QuickBooks Time user their hours post to
--   time_jobs        copy of the QuickBooks Time job list, linked to ampOS jobs by job number
--   time_entries     one row per stretch on the clock (real punch times + counted times)
--   time_day_extras  per diem and miles for a day
--   time_clock_in / time_clock_out / time_switch_job   the only way entries get written
--
-- Entries are written only through the three functions, so the rounding rules live in
-- one place and a phone cannot send its own counted times.
--
-- Not here yet: weekly review and approval (part 2), fixing a punch, sending to QuickBooks Time.
--
-- Safe to run more than once.

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

-- Who sees everyone's time. Same role list as the org chart lock.
CREATE OR REPLACE FUNCTION common.time_is_payroll_admin() RETURNS boolean
LANGUAGE sql STABLE
AS $$
  SELECT COALESCE((auth.jwt() -> 'user_metadata' ->> 'role'), '')
    IN ('Admin', 'Super Admin', 'HR', 'HR Rep', 'HR Representative');
$$;

-- Quarter-hour rounding, after dropping seconds.
--   'back'    start of day: 7:08 counts as 7:00 (employee's favor)
--   'forward' end of day:   3:31 counts as 3:45 (employee's favor)
--   'nearest' a moment that must not favor either side (lunch out, job switch)
CREATE OR REPLACE FUNCTION common.time_round_quarter(ts timestamptz, direction text)
RETURNS timestamptz
LANGUAGE sql IMMUTABLE
AS $$
  SELECT to_timestamp((
    CASE direction
      WHEN 'back' THEN floor(floor(extract(epoch FROM ts) / 60) / 15.0)
      WHEN 'forward' THEN ceil(floor(extract(epoch FROM ts) / 60) / 15.0)
      ELSE round((floor(extract(epoch FROM ts) / 60) / 15.0)::numeric)
    END * 900
  )::double precision);
$$;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS common.time_people (
  profile_id uuid PRIMARY KEY REFERENCES auth.users(id),
  -- QuickBooks Time user this person's approved hours post to
  qb_time_user_id bigint UNIQUE,
  -- Hourly staff clock in. Salaried people only approve.
  clocks_in boolean NOT NULL DEFAULT true,
  -- Only set when the org chart gives someone two bosses: the one who approves their time
  approver_profile_id uuid REFERENCES auth.users(id),
  -- For the "you aren't clocked in" alarm. 0 = Sunday.
  start_time time,
  work_days smallint[] NOT NULL DEFAULT '{1,2,3,4,5}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS common.time_jobs (
  qb_time_jobcode_id bigint PRIMARY KEY,
  parent_jobcode_id bigint,
  name text NOT NULL,
  -- Parent's name, kept here so the job picker needs no second lookup
  customer_name text,
  -- Leading number of the name ("26103- TA Realty" -> 26103), used to find the ampOS job
  job_number text,
  job_id uuid REFERENCES neta_ops.jobs(id) ON DELETE SET NULL,
  kind text NOT NULL DEFAULT 'job'
    CHECK (kind IN ('job', 'shop', 'travel', 'training', 'pto', 'holiday')),
  active boolean NOT NULL DEFAULT true,
  synced_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_time_jobs_job_number ON common.time_jobs (job_number);
CREATE INDEX IF NOT EXISTS idx_time_jobs_job_id ON common.time_jobs (job_id);

CREATE TABLE IF NOT EXISTS common.time_entries (
  -- Made on the phone, so a punch saved with no signal and sent twice is stored once
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES auth.users(id),
  -- The day on the phone when the person clocked in
  work_date date NOT NULL,
  qb_time_jobcode_id bigint NOT NULL REFERENCES common.time_jobs(qb_time_jobcode_id),
  -- Real punch times
  clock_in_at timestamptz NOT NULL,
  clock_out_at timestamptz,
  -- Times that get paid, after quarter-hour rounding
  counted_in_at timestamptz NOT NULL,
  counted_out_at timestamptz,
  started_from text NOT NULL CHECK (started_from IN ('day', 'lunch', 'switch')),
  ended_for text CHECK (ended_for IN ('day', 'lunch', 'switch')),
  hours numeric GENERATED ALWAYS AS (
    round((extract(epoch FROM (counted_out_at - counted_in_at)) / 3600.0)::numeric, 2)
  ) STORED,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT time_entries_out_after_in
    CHECK (clock_out_at IS NULL OR clock_out_at >= clock_in_at),
  CONSTRAINT time_entries_closed_together
    CHECK ((clock_out_at IS NULL) = (counted_out_at IS NULL)
       AND (clock_out_at IS NULL) = (ended_for IS NULL))
);

-- A person can only be on the clock once
CREATE UNIQUE INDEX IF NOT EXISTS uq_time_entries_one_open
  ON common.time_entries (profile_id) WHERE clock_out_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_time_entries_profile_date
  ON common.time_entries (profile_id, work_date);

CREATE TABLE IF NOT EXISTS common.time_day_extras (
  profile_id uuid NOT NULL REFERENCES auth.users(id),
  work_date date NOT NULL,
  per_diem boolean NOT NULL DEFAULT false,
  miles numeric(6,1) NOT NULL DEFAULT 0 CHECK (miles >= 0),
  -- Job the per diem and miles are tagged to
  qb_time_jobcode_id bigint REFERENCES common.time_jobs(qb_time_jobcode_id),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (profile_id, work_date)
);

DROP TRIGGER IF EXISTS trg_time_people_updated_at ON common.time_people;
CREATE TRIGGER trg_time_people_updated_at
  BEFORE UPDATE ON common.time_people
  FOR EACH ROW EXECUTE FUNCTION common.set_updated_at();

DROP TRIGGER IF EXISTS trg_time_entries_updated_at ON common.time_entries;
CREATE TRIGGER trg_time_entries_updated_at
  BEFORE UPDATE ON common.time_entries
  FOR EACH ROW EXECUTE FUNCTION common.set_updated_at();

DROP TRIGGER IF EXISTS trg_time_day_extras_updated_at ON common.time_day_extras;
CREATE TRIGGER trg_time_day_extras_updated_at
  BEFORE UPDATE ON common.time_day_extras
  FOR EACH ROW EXECUTE FUNCTION common.set_updated_at();

-- ---------------------------------------------------------------------------
-- Who can see and change what
-- ---------------------------------------------------------------------------

ALTER TABLE common.time_people ENABLE ROW LEVEL SECURITY;
ALTER TABLE common.time_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE common.time_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE common.time_day_extras ENABLE ROW LEVEL SECURITY;

-- time_entries and time_jobs get no write grant: entries change only through the
-- clock functions below, and the job list only through the QuickBooks Time sync.
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE common.time_people TO authenticated;
GRANT SELECT ON TABLE common.time_jobs TO authenticated;
GRANT SELECT ON TABLE common.time_entries TO authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE common.time_day_extras TO authenticated;
-- The QuickBooks Time sync runs on the server with the service role
GRANT ALL ON TABLE common.time_people, common.time_jobs, common.time_entries, common.time_day_extras
  TO service_role;

-- People: you see your own row, payroll admins see and manage all
DROP POLICY IF EXISTS "time_people_select_own_or_admin" ON common.time_people;
CREATE POLICY "time_people_select_own_or_admin"
  ON common.time_people FOR SELECT
  TO authenticated
  USING (profile_id = auth.uid() OR common.time_is_payroll_admin());

DROP POLICY IF EXISTS "time_people_write_admin" ON common.time_people;
CREATE POLICY "time_people_write_admin"
  ON common.time_people FOR ALL
  TO authenticated
  USING (common.time_is_payroll_admin())
  WITH CHECK (common.time_is_payroll_admin());

-- Jobs: everyone signed in can read the list
DROP POLICY IF EXISTS "time_jobs_select_all" ON common.time_jobs;
CREATE POLICY "time_jobs_select_all"
  ON common.time_jobs FOR SELECT
  TO authenticated
  USING (true);

-- Entries: your own, or everyone's for payroll admins. Approvers are added in part 2.
DROP POLICY IF EXISTS "time_entries_select_own_or_admin" ON common.time_entries;
CREATE POLICY "time_entries_select_own_or_admin"
  ON common.time_entries FOR SELECT
  TO authenticated
  USING (profile_id = auth.uid() OR common.time_is_payroll_admin());

-- Per diem and miles: your own days, or everyone's for payroll admins
DROP POLICY IF EXISTS "time_day_extras_select_own_or_admin" ON common.time_day_extras;
CREATE POLICY "time_day_extras_select_own_or_admin"
  ON common.time_day_extras FOR SELECT
  TO authenticated
  USING (profile_id = auth.uid() OR common.time_is_payroll_admin());

DROP POLICY IF EXISTS "time_day_extras_insert_own" ON common.time_day_extras;
CREATE POLICY "time_day_extras_insert_own"
  ON common.time_day_extras FOR INSERT
  TO authenticated
  WITH CHECK (profile_id = auth.uid());

DROP POLICY IF EXISTS "time_day_extras_update_own" ON common.time_day_extras;
CREATE POLICY "time_day_extras_update_own"
  ON common.time_day_extras FOR UPDATE
  TO authenticated
  USING (profile_id = auth.uid())
  WITH CHECK (profile_id = auth.uid());

-- ---------------------------------------------------------------------------
-- The clock
-- ---------------------------------------------------------------------------

-- Clock in, at the start of a day ('day') or back from lunch ('lunch').
CREATE OR REPLACE FUNCTION common.time_clock_in(
  p_entry_id uuid,
  p_jobcode_id bigint,
  p_at timestamptz,
  p_work_date date,
  p_from text DEFAULT 'day'
) RETURNS common.time_entries
LANGUAGE plpgsql SECURITY DEFINER SET search_path = common, public
AS $$
DECLARE
  v_me uuid := auth.uid();
  v_entry common.time_entries;
  v_last common.time_entries;
  v_counted timestamptz;
  v_lunch_minutes int;
BEGIN
  IF v_me IS NULL THEN
    RAISE EXCEPTION 'Not signed in';
  END IF;
  IF p_from NOT IN ('day', 'lunch') THEN
    RAISE EXCEPTION 'Unknown clock-in type: %', p_from;
  END IF;

  -- The phone queues punches while it has no signal and may send one twice
  SELECT * INTO v_entry FROM common.time_entries WHERE id = p_entry_id;
  IF FOUND THEN
    IF v_entry.profile_id <> v_me THEN
      RAISE EXCEPTION 'That entry belongs to someone else';
    END IF;
    RETURN v_entry;
  END IF;

  IF EXISTS (
    SELECT 1 FROM common.time_entries WHERE profile_id = v_me AND clock_out_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Already clocked in';
  END IF;

  SELECT * INTO v_last FROM common.time_entries
   WHERE profile_id = v_me
   ORDER BY clock_out_at DESC
   LIMIT 1;

  IF p_from = 'lunch' THEN
    IF v_last.id IS NULL OR v_last.ended_for <> 'lunch' THEN
      RAISE EXCEPTION 'No lunch to come back from';
    END IF;
    IF p_at < v_last.clock_out_at THEN
      RAISE EXCEPTION 'Back from lunch is before lunch started';
    END IF;
    -- Lunch counts by its real length to the nearest quarter hour, measured from the
    -- counted time it started, so a 30 minute lunch is always 30 minutes
    v_lunch_minutes := (round((
      (floor(extract(epoch FROM p_at) / 60) - floor(extract(epoch FROM v_last.clock_out_at) / 60)) / 15.0
    )::numeric) * 15)::int;
    v_counted := v_last.counted_out_at + make_interval(mins => v_lunch_minutes);
  ELSE
    v_counted := common.time_round_quarter(p_at, 'back');
    -- Rounding back must not reach into time already counted (out at 3:31 counts to
    -- 3:45; back in at 3:40 would otherwise count from 3:30)
    IF v_last.id IS NOT NULL AND v_counted < v_last.counted_out_at THEN
      v_counted := v_last.counted_out_at;
    END IF;
  END IF;

  INSERT INTO common.time_entries
    (id, profile_id, work_date, qb_time_jobcode_id, clock_in_at, counted_in_at, started_from)
  VALUES
    (p_entry_id, v_me, p_work_date, p_jobcode_id, p_at, v_counted, p_from)
  RETURNING * INTO v_entry;

  RETURN v_entry;
END;
$$;

-- Clock out, for the day ('day') or for lunch ('lunch').
CREATE OR REPLACE FUNCTION common.time_clock_out(
  p_at timestamptz,
  p_for text DEFAULT 'day'
) RETURNS common.time_entries
LANGUAGE plpgsql SECURITY DEFINER SET search_path = common, public
AS $$
DECLARE
  v_me uuid := auth.uid();
  v_entry common.time_entries;
  v_counted timestamptz;
BEGIN
  IF v_me IS NULL THEN
    RAISE EXCEPTION 'Not signed in';
  END IF;
  IF p_for NOT IN ('day', 'lunch') THEN
    RAISE EXCEPTION 'Unknown clock-out type: %', p_for;
  END IF;

  SELECT * INTO v_entry FROM common.time_entries
   WHERE profile_id = v_me AND clock_out_at IS NULL
   FOR UPDATE;

  IF NOT FOUND THEN
    -- Same punch sent twice: hand back the entry it already closed
    SELECT * INTO v_entry FROM common.time_entries
     WHERE profile_id = v_me AND clock_out_at = p_at;
    IF FOUND THEN
      RETURN v_entry;
    END IF;
    RAISE EXCEPTION 'Not clocked in';
  END IF;

  IF p_at < v_entry.clock_in_at THEN
    RAISE EXCEPTION 'Clock out is before clock in';
  END IF;

  v_counted := common.time_round_quarter(
    p_at, CASE WHEN p_for = 'day' THEN 'forward' ELSE 'nearest' END
  );
  IF v_counted < v_entry.counted_in_at THEN
    v_counted := v_entry.counted_in_at;
  END IF;

  UPDATE common.time_entries
     SET clock_out_at = p_at, counted_out_at = v_counted, ended_for = p_for
   WHERE id = v_entry.id
  RETURNING * INTO v_entry;

  RETURN v_entry;
END;
$$;

-- Switch jobs without clocking out. One counted time ends the old job and starts the
-- new one, so no minute is paid twice.
CREATE OR REPLACE FUNCTION common.time_switch_job(
  p_entry_id uuid,
  p_jobcode_id bigint,
  p_at timestamptz,
  p_work_date date
) RETURNS common.time_entries
LANGUAGE plpgsql SECURITY DEFINER SET search_path = common, public
AS $$
DECLARE
  v_me uuid := auth.uid();
  v_old common.time_entries;
  v_new common.time_entries;
  v_counted timestamptz;
BEGIN
  IF v_me IS NULL THEN
    RAISE EXCEPTION 'Not signed in';
  END IF;

  -- Same switch sent twice
  SELECT * INTO v_new FROM common.time_entries WHERE id = p_entry_id;
  IF FOUND THEN
    IF v_new.profile_id <> v_me THEN
      RAISE EXCEPTION 'That entry belongs to someone else';
    END IF;
    RETURN v_new;
  END IF;

  SELECT * INTO v_old FROM common.time_entries
   WHERE profile_id = v_me AND clock_out_at IS NULL
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Not clocked in';
  END IF;
  IF p_at < v_old.clock_in_at THEN
    RAISE EXCEPTION 'Switch is before clock in';
  END IF;

  v_counted := common.time_round_quarter(p_at, 'nearest');
  IF v_counted < v_old.counted_in_at THEN
    v_counted := v_old.counted_in_at;
  END IF;

  UPDATE common.time_entries
     SET clock_out_at = p_at, counted_out_at = v_counted, ended_for = 'switch'
   WHERE id = v_old.id;

  INSERT INTO common.time_entries
    (id, profile_id, work_date, qb_time_jobcode_id, clock_in_at, counted_in_at, started_from)
  VALUES
    (p_entry_id, v_me, p_work_date, p_jobcode_id, p_at, v_counted, 'switch')
  RETURNING * INTO v_new;

  RETURN v_new;
END;
$$;

GRANT EXECUTE ON FUNCTION common.time_is_payroll_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION common.time_clock_in(uuid, bigint, timestamptz, date, text) TO authenticated;
GRANT EXECUTE ON FUNCTION common.time_clock_out(timestamptz, text) TO authenticated;
GRANT EXECUTE ON FUNCTION common.time_switch_job(uuid, bigint, timestamptz, date) TO authenticated;

-- Result: rounding check, then the new tables. Expect:
--   in_708 = 07:00, out_331 = 15:45, switch_1007 = 10:00, switch_1008 = 10:15
--   and 4 tables: time_day_extras, time_entries, time_jobs, time_people
SELECT
  to_char(common.time_round_quarter('2026-10-08 07:08:40+00', 'back') AT TIME ZONE 'UTC', 'HH24:MI') AS in_708,
  to_char(common.time_round_quarter('2026-10-08 15:31:05+00', 'forward') AT TIME ZONE 'UTC', 'HH24:MI') AS out_331,
  to_char(common.time_round_quarter('2026-10-08 10:07:59+00', 'nearest') AT TIME ZONE 'UTC', 'HH24:MI') AS switch_1007,
  to_char(common.time_round_quarter('2026-10-08 10:08:00+00', 'nearest') AT TIME ZONE 'UTC', 'HH24:MI') AS switch_1008,
  (SELECT string_agg(table_name::text, ', ' ORDER BY table_name::text)
     FROM information_schema.tables
    WHERE table_schema = 'common'
      AND table_name IN ('time_people', 'time_jobs', 'time_entries', 'time_day_extras')) AS tables;
