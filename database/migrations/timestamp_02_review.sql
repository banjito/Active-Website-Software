-- TimeStAMP, part 2: the weekly review
--
-- Why: hours are not paid until a boss says the week is right. This adds the week,
-- who may review it, fixing a punch with a paper trail, and the lock after approval.
--
-- What this adds (all in the common schema):
--   time_settings          company time zone, flat per diem and mileage amounts
--   time_approver_backups  a stand-in for an approver who is out
--   time_weeks             one row per person per week: open, submitted, approved, denied
--   time_week_events       every submit, approve, deny, and reopen, kept forever
--   time_entry_changes     every fixed, added, or removed punch, kept forever
--   time_can_see           the privacy rule: you, your boss, payroll. Nobody else.
--   time_fix_entry / time_add_entry / time_remove_entry       fixing punches
--   time_submit_week / time_approve_week / time_deny_week / time_reopen_week
--   time_my_reviews        the list an approver works from
--
-- The org chart decides who the boss is. A week still open Tuesday 8:00 AM can also be
-- seen by the boss's boss. An approved week is locked.
--
-- The last block runs a practice week for one real person in the year 2001, checks the
-- rules, then undoes all of it. Nothing from the practice run is kept.
--
-- Not here yet: sending approved hours to QuickBooks Time (part 3).
--
-- Safe to run more than once.

-- ---------------------------------------------------------------------------
-- Settings and small helpers
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS common.time_settings (
  -- One row only
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  -- The clock the Monday and Tuesday 8:00 AM cut-offs run on
  time_zone text NOT NULL DEFAULT 'America/Chicago',
  -- Flat company amounts for the paycheck list. Not anyone's pay rate.
  per_diem_rate numeric(8,2),
  mileage_rate numeric(6,3),
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO common.time_settings (id) VALUES (true) ON CONFLICT (id) DO NOTHING;

-- Today's date on the company clock
CREATE OR REPLACE FUNCTION common.time_today() RETURNS date
LANGUAGE sql STABLE
AS $$
  SELECT (now() AT TIME ZONE (SELECT s.time_zone FROM common.time_settings s LIMIT 1))::date;
$$;

-- The Sunday a day belongs to
CREATE OR REPLACE FUNCTION common.time_week_start(d date) RETURNS date
LANGUAGE sql IMMUTABLE
AS $$
  SELECT d - extract(dow FROM d)::int;
$$;

-- 8:00 AM company time, p_days after a week's Sunday.
--   8 = the Monday after (review opens)   9 = the Tuesday after (moves up one level)
CREATE OR REPLACE FUNCTION common.time_week_mark(p_week_start date, p_days int) RETURNS timestamptz
LANGUAGE sql STABLE
AS $$
  SELECT ((p_week_start + p_days)::timestamp + time '08:00')
         AT TIME ZONE (SELECT s.time_zone FROM common.time_settings s LIMIT 1);
$$;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS common.time_approver_backups (
  approver_profile_id uuid PRIMARY KEY REFERENCES auth.users(id),
  backup_profile_id uuid NOT NULL REFERENCES auth.users(id),
  -- Empty dates mean "always"
  starts_on date,
  ends_on date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT time_approver_backups_not_self CHECK (backup_profile_id <> approver_profile_id)
);

CREATE TABLE IF NOT EXISTS common.time_weeks (
  profile_id uuid NOT NULL REFERENCES auth.users(id),
  week_start date NOT NULL CHECK (extract(dow FROM week_start) = 0),
  status text NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'submitted', 'approved', 'denied')),
  submitted_at timestamptz,
  decided_by uuid REFERENCES auth.users(id),
  decided_at timestamptz,
  -- Hours on the week at the moment it was approved
  approved_hours numeric,
  -- Why it was denied, and which days (empty = the whole week)
  denied_note text,
  denied_days date[] NOT NULL DEFAULT '{}',
  -- Payroll's tick: per diem and miles made it onto the paycheck
  extras_paid_at timestamptz,
  extras_paid_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (profile_id, week_start)
);

CREATE TABLE IF NOT EXISTS common.time_week_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  profile_id uuid NOT NULL REFERENCES auth.users(id),
  week_start date NOT NULL,
  action text NOT NULL
    CHECK (action IN ('submit', 'approve', 'deny', 'reopen', 'extras_paid', 'extras_unpaid')),
  by_profile_id uuid NOT NULL REFERENCES auth.users(id),
  note text,
  hours numeric,
  happened_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_time_week_events_week
  ON common.time_week_events (profile_id, week_start);

CREATE TABLE IF NOT EXISTS common.time_entry_changes (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  -- No link to time_entries on purpose: a removed punch keeps its history here
  entry_id uuid NOT NULL,
  profile_id uuid NOT NULL REFERENCES auth.users(id),
  work_date date NOT NULL,
  action text NOT NULL CHECK (action IN ('fix', 'add', 'remove')),
  reason text NOT NULL,
  old_row jsonb,
  new_row jsonb,
  changed_by uuid NOT NULL REFERENCES auth.users(id),
  changed_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_time_entry_changes_day
  ON common.time_entry_changes (profile_id, work_date);
CREATE INDEX IF NOT EXISTS idx_time_entry_changes_entry
  ON common.time_entry_changes (entry_id);

-- Set when a punch was fixed or added by hand, so screens can mark it
ALTER TABLE common.time_entries ADD COLUMN IF NOT EXISTS fixed_at timestamptz;

DROP TRIGGER IF EXISTS trg_time_settings_updated_at ON common.time_settings;
CREATE TRIGGER trg_time_settings_updated_at
  BEFORE UPDATE ON common.time_settings
  FOR EACH ROW EXECUTE FUNCTION common.set_updated_at();

DROP TRIGGER IF EXISTS trg_time_approver_backups_updated_at ON common.time_approver_backups;
CREATE TRIGGER trg_time_approver_backups_updated_at
  BEFORE UPDATE ON common.time_approver_backups
  FOR EACH ROW EXECUTE FUNCTION common.set_updated_at();

DROP TRIGGER IF EXISTS trg_time_weeks_updated_at ON common.time_weeks;
CREATE TRIGGER trg_time_weeks_updated_at
  BEFORE UPDATE ON common.time_weeks
  FOR EACH ROW EXECUTE FUNCTION common.set_updated_at();

-- ---------------------------------------------------------------------------
-- The privacy rule
-- ---------------------------------------------------------------------------

-- Who approves a person's time. The org chart decides. When it gives someone two
-- bosses, time_people.approver_profile_id names the one.
CREATE OR REPLACE FUNCTION common.time_approvers_of(p_profile uuid) RETURNS SETOF uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = common, public
AS $$
  SELECT tp.approver_profile_id
    FROM common.time_people tp
   WHERE tp.profile_id = p_profile AND tp.approver_profile_id IS NOT NULL
  UNION
  SELECT oc.reports_to_profile_id
    FROM common.org_chart_assignments oc
   WHERE oc.profile_id = p_profile
     AND oc.reports_to_profile_id IS NOT NULL
     AND oc.reports_to_profile_id <> p_profile
     AND NOT EXISTS (
       SELECT 1 FROM common.time_people tp
        WHERE tp.profile_id = p_profile AND tp.approver_profile_id IS NOT NULL
     );
$$;

-- True when I am that approver, or their stand-in today
CREATE OR REPLACE FUNCTION common.time_acts_as(p_approver uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = common, public
AS $$
  SELECT p_approver = auth.uid() OR EXISTS (
    SELECT 1 FROM common.time_approver_backups b
     WHERE b.approver_profile_id = p_approver
       AND b.backup_profile_id = auth.uid()
       AND (b.starts_on IS NULL OR b.starts_on <= common.time_today())
       AND (b.ends_on IS NULL OR b.ends_on >= common.time_today())
  );
$$;

-- May I see this person's time for the week that holds p_date?
CREATE OR REPLACE FUNCTION common.time_can_see(p_profile uuid, p_date date) RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = common, public
AS $$
DECLARE
  v_me uuid := auth.uid();
  v_week date := common.time_week_start(p_date);
  v_status text;
  v_decided_by uuid;
BEGIN
  IF v_me IS NULL OR p_profile IS NULL OR p_date IS NULL THEN
    RETURN false;
  END IF;
  IF p_profile = v_me OR common.time_is_payroll_admin() THEN
    RETURN true;
  END IF;

  -- Their boss, or the boss's stand-in
  IF EXISTS (
    SELECT 1 FROM common.time_approvers_of(p_profile) AS a(boss_id)
     WHERE common.time_acts_as(a.boss_id)
  ) THEN
    RETURN true;
  END IF;

  -- One level up, only for a week that ran late
  IF now() < common.time_week_mark(v_week, 9) THEN
    RETURN false;
  END IF;
  SELECT w.status, w.decided_by INTO v_status, v_decided_by
    FROM common.time_weeks w
   WHERE w.profile_id = p_profile AND w.week_start = v_week;
  -- Once the boss approves it, the level above loses sight of it again
  IF v_status = 'approved' AND v_decided_by IS DISTINCT FROM v_me THEN
    RETURN false;
  END IF;
  RETURN EXISTS (
    SELECT 1
      FROM common.time_approvers_of(p_profile) AS a(boss_id)
     CROSS JOIN LATERAL common.time_approvers_of(a.boss_id) AS up(boss_id)
     WHERE common.time_acts_as(up.boss_id)
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- Guards
-- ---------------------------------------------------------------------------

-- An approved week is locked: no new, changed, or removed punches, per diem, or miles
CREATE OR REPLACE FUNCTION common.time_guard_week() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = common, public
AS $$
DECLARE
  v_locked boolean := false;
BEGIN
  IF TG_OP IN ('UPDATE', 'DELETE') THEN
    v_locked := EXISTS (
      SELECT 1 FROM common.time_weeks w
       WHERE w.profile_id = OLD.profile_id
         AND w.week_start = common.time_week_start(OLD.work_date)
         AND w.status = 'approved'
    );
  END IF;
  IF NOT v_locked AND TG_OP IN ('INSERT', 'UPDATE') THEN
    v_locked := EXISTS (
      SELECT 1 FROM common.time_weeks w
       WHERE w.profile_id = NEW.profile_id
         AND w.week_start = common.time_week_start(NEW.work_date)
         AND w.status = 'approved'
    );
  END IF;
  IF v_locked THEN
    RAISE EXCEPTION 'That week is approved and locked. Payroll can reopen it.';
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION common.time_guard_new_entry() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = common, public
AS $$
BEGIN
  -- Hours for someone with no QuickBooks Time match could never be paid
  IF NOT EXISTS (
    SELECT 1 FROM common.time_people p
     WHERE p.profile_id = NEW.profile_id AND p.clocks_in AND p.qb_time_user_id IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'You are not set up for the time clock yet. Ask payroll.';
  END IF;
  -- A punch removed on purpose must not come back when a phone sends it again
  IF EXISTS (
    SELECT 1 FROM common.time_entry_changes c
     WHERE c.entry_id = NEW.id AND c.action = 'remove'
  ) THEN
    RAISE EXCEPTION 'That punch was removed';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_time_entries_guard_week ON common.time_entries;
CREATE TRIGGER trg_time_entries_guard_week
  BEFORE INSERT OR UPDATE OR DELETE ON common.time_entries
  FOR EACH ROW EXECUTE FUNCTION common.time_guard_week();

DROP TRIGGER IF EXISTS trg_time_entries_guard_new ON common.time_entries;
CREATE TRIGGER trg_time_entries_guard_new
  BEFORE INSERT ON common.time_entries
  FOR EACH ROW EXECUTE FUNCTION common.time_guard_new_entry();

DROP TRIGGER IF EXISTS trg_time_day_extras_guard_week ON common.time_day_extras;
CREATE TRIGGER trg_time_day_extras_guard_week
  BEFORE INSERT OR UPDATE OR DELETE ON common.time_day_extras
  FOR EACH ROW EXECUTE FUNCTION common.time_guard_week();

-- ---------------------------------------------------------------------------
-- Fixing punches
-- ---------------------------------------------------------------------------

-- Work out a day's counted times again from its real punch times, with the same
-- rounding rules the clock uses. Run after any fix so the day stays consistent.
CREATE OR REPLACE FUNCTION common.time_recount_day(p_profile uuid, p_date date) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = common, public
AS $$
DECLARE
  v_e common.time_entries;
  v_prev common.time_entries;
  v_in timestamptz;
  v_out timestamptz;
BEGIN
  FOR v_e IN
    SELECT * FROM common.time_entries
     WHERE profile_id = p_profile AND work_date = p_date
     ORDER BY clock_in_at, created_at, id
  LOOP
    -- Read fresh each time: the entry before may have just been recounted
    SELECT * INTO v_prev FROM common.time_entries
     WHERE profile_id = p_profile
       AND (clock_in_at, created_at, id) < (v_e.clock_in_at, v_e.created_at, v_e.id)
     ORDER BY clock_in_at DESC, created_at DESC, id DESC
     LIMIT 1;

    IF v_prev.id IS NOT NULL AND v_e.started_from = 'switch'
       AND v_prev.ended_for = 'switch' AND v_prev.clock_out_at = v_e.clock_in_at THEN
      -- Job switch: one counted time ends the old job and starts the new one
      v_in := v_prev.counted_out_at;
    ELSIF v_prev.id IS NOT NULL AND v_e.started_from = 'lunch' AND v_prev.ended_for = 'lunch' THEN
      -- Lunch counts by its real length to the nearest quarter hour
      v_in := v_prev.counted_out_at + make_interval(mins => (round((
        (floor(extract(epoch FROM v_e.clock_in_at) / 60) - floor(extract(epoch FROM v_prev.clock_out_at) / 60)) / 15.0
      )::numeric) * 15)::int);
    ELSE
      v_in := common.time_round_quarter(v_e.clock_in_at, 'back');
      -- Rounding back must not reach into time already counted
      IF v_prev.id IS NOT NULL AND v_prev.counted_out_at IS NOT NULL AND v_in < v_prev.counted_out_at THEN
        v_in := v_prev.counted_out_at;
      END IF;
    END IF;

    IF v_e.clock_out_at IS NULL THEN
      v_out := NULL;
    ELSE
      v_out := common.time_round_quarter(
        v_e.clock_out_at, CASE WHEN v_e.ended_for = 'day' THEN 'forward' ELSE 'nearest' END
      );
      IF v_out < v_in THEN
        v_out := v_in;
      END IF;
    END IF;

    UPDATE common.time_entries
       SET counted_in_at = v_in, counted_out_at = v_out
     WHERE id = v_e.id
       AND (counted_in_at IS DISTINCT FROM v_in OR counted_out_at IS DISTINCT FROM v_out);
  END LOOP;
END;
$$;

-- Fix a punch: change its in time, out time, or job. Leave a value empty to keep it.
-- Giving an out time to an open punch closes it (the "forgot to clock out" fix).
CREATE OR REPLACE FUNCTION common.time_fix_entry(
  p_entry_id uuid,
  p_clock_in_at timestamptz,
  p_clock_out_at timestamptz,
  p_jobcode_id bigint,
  p_reason text,
  p_ended_for text DEFAULT NULL
) RETURNS common.time_entries
LANGUAGE plpgsql SECURITY DEFINER SET search_path = common, public
AS $$
DECLARE
  v_me uuid := auth.uid();
  v_old common.time_entries;
  v_new common.time_entries;
  v_in timestamptz;
  v_out timestamptz;
  v_for text;
  v_job bigint;
  v_date_before date;
  v_date_after date;
BEGIN
  IF v_me IS NULL THEN
    RAISE EXCEPTION 'Not signed in';
  END IF;
  IF btrim(COALESCE(p_reason, '')) = '' THEN
    RAISE EXCEPTION 'Say why the punch is being fixed';
  END IF;
  IF p_ended_for IS NOT NULL AND p_ended_for NOT IN ('day', 'lunch') THEN
    RAISE EXCEPTION 'Unknown clock-out type: %', p_ended_for;
  END IF;

  SELECT * INTO v_old FROM common.time_entries WHERE id = p_entry_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Punch not found';
  END IF;
  IF v_old.profile_id <> v_me AND NOT common.time_is_payroll_admin() THEN
    RAISE EXCEPTION 'Only the person or payroll can fix a punch';
  END IF;

  v_in := COALESCE(p_clock_in_at, v_old.clock_in_at);
  v_out := COALESCE(p_clock_out_at, v_old.clock_out_at);
  v_job := COALESCE(p_jobcode_id, v_old.qb_time_jobcode_id);
  v_for := CASE WHEN v_out IS NULL THEN NULL ELSE COALESCE(p_ended_for, v_old.ended_for, 'day') END;

  IF v_in > now() + interval '5 minutes' OR v_out > now() + interval '5 minutes' THEN
    RAISE EXCEPTION 'A punch cannot be in the future';
  END IF;
  IF v_out IS NOT NULL AND v_out < v_in THEN
    RAISE EXCEPTION 'Clock out is before clock in';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM common.time_jobs WHERE qb_time_jobcode_id = v_job) THEN
    RAISE EXCEPTION 'Job not found';
  END IF;

  -- A job switch is one moment shared by two entries. Move the other side with it.
  IF v_old.started_from = 'switch' AND v_in <> v_old.clock_in_at THEN
    UPDATE common.time_entries
       SET clock_out_at = v_in, counted_out_at = v_in, fixed_at = now()
     WHERE profile_id = v_old.profile_id AND id <> v_old.id
       AND ended_for = 'switch' AND clock_out_at = v_old.clock_in_at
       AND clock_in_at <= v_in
    RETURNING work_date INTO v_date_before;
  END IF;
  IF v_old.ended_for = 'switch' AND v_out <> v_old.clock_out_at THEN
    UPDATE common.time_entries
       SET clock_in_at = v_out, fixed_at = now()
     WHERE profile_id = v_old.profile_id AND id <> v_old.id
       AND started_from = 'switch' AND clock_in_at = v_old.clock_out_at
       AND (clock_out_at IS NULL OR clock_out_at >= v_out)
    RETURNING work_date INTO v_date_after;
  END IF;

  UPDATE common.time_entries
     SET clock_in_at = v_in,
         clock_out_at = v_out,
         -- Placeholder. The recount below sets the real counted time.
         counted_out_at = v_out,
         ended_for = v_for,
         qb_time_jobcode_id = v_job,
         fixed_at = now()
   WHERE id = v_old.id;

  IF EXISTS (
    SELECT 1 FROM common.time_entries o
     WHERE o.profile_id = v_old.profile_id AND o.id <> v_old.id
       AND o.clock_in_at < COALESCE(v_out, 'infinity'::timestamptz)
       AND COALESCE(o.clock_out_at, 'infinity'::timestamptz) > v_in
  ) THEN
    RAISE EXCEPTION 'That overlaps another punch';
  END IF;

  IF v_date_before IS NOT NULL AND v_date_before <> v_old.work_date THEN
    PERFORM common.time_recount_day(v_old.profile_id, v_date_before);
  END IF;
  PERFORM common.time_recount_day(v_old.profile_id, v_old.work_date);
  IF v_date_after IS NOT NULL AND v_date_after <> v_old.work_date THEN
    PERFORM common.time_recount_day(v_old.profile_id, v_date_after);
  END IF;

  SELECT * INTO v_new FROM common.time_entries WHERE id = v_old.id;
  INSERT INTO common.time_entry_changes
    (entry_id, profile_id, work_date, action, reason, old_row, new_row, changed_by)
  VALUES
    (v_old.id, v_old.profile_id, v_old.work_date, 'fix', btrim(p_reason), to_jsonb(v_old), to_jsonb(v_new), v_me);

  RETURN v_new;
END;
$$;

-- Add a stretch that was never punched (forgot to clock in at all).
-- p_profile_id empty = me. Only payroll can add one for someone else.
CREATE OR REPLACE FUNCTION common.time_add_entry(
  p_entry_id uuid,
  p_profile_id uuid,
  p_work_date date,
  p_jobcode_id bigint,
  p_clock_in_at timestamptz,
  p_clock_out_at timestamptz,
  p_reason text,
  p_from text DEFAULT 'day',
  p_for text DEFAULT 'day'
) RETURNS common.time_entries
LANGUAGE plpgsql SECURITY DEFINER SET search_path = common, public
AS $$
DECLARE
  v_me uuid := auth.uid();
  v_who uuid;
  v_new common.time_entries;
BEGIN
  IF v_me IS NULL THEN
    RAISE EXCEPTION 'Not signed in';
  END IF;
  v_who := COALESCE(p_profile_id, v_me);
  IF v_who <> v_me AND NOT common.time_is_payroll_admin() THEN
    RAISE EXCEPTION 'Only the person or payroll can add a punch';
  END IF;

  -- Same request sent twice
  SELECT * INTO v_new FROM common.time_entries WHERE id = p_entry_id;
  IF FOUND THEN
    IF v_new.profile_id <> v_who THEN
      RAISE EXCEPTION 'That entry belongs to someone else';
    END IF;
    RETURN v_new;
  END IF;

  IF btrim(COALESCE(p_reason, '')) = '' THEN
    RAISE EXCEPTION 'Say why the punch is being added';
  END IF;
  IF p_work_date IS NULL OR p_clock_in_at IS NULL OR p_clock_out_at IS NULL THEN
    RAISE EXCEPTION 'A missed punch needs a day, an in time, and an out time';
  END IF;
  IF p_clock_out_at <= p_clock_in_at THEN
    RAISE EXCEPTION 'Clock out must be after clock in';
  END IF;
  IF p_clock_out_at > now() + interval '5 minutes' THEN
    RAISE EXCEPTION 'A punch cannot be in the future';
  END IF;
  IF p_from NOT IN ('day', 'lunch') OR p_for NOT IN ('day', 'lunch') THEN
    RAISE EXCEPTION 'Unknown punch type';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM common.time_jobs WHERE qb_time_jobcode_id = p_jobcode_id) THEN
    RAISE EXCEPTION 'Job not found';
  END IF;
  IF EXISTS (
    SELECT 1 FROM common.time_entries o
     WHERE o.profile_id = v_who
       AND o.clock_in_at < p_clock_out_at
       AND COALESCE(o.clock_out_at, 'infinity'::timestamptz) > p_clock_in_at
  ) THEN
    RAISE EXCEPTION 'That overlaps another punch';
  END IF;

  -- Counted times here are placeholders. The recount sets the real ones.
  INSERT INTO common.time_entries
    (id, profile_id, work_date, qb_time_jobcode_id, clock_in_at, clock_out_at,
     counted_in_at, counted_out_at, started_from, ended_for, fixed_at)
  VALUES
    (p_entry_id, v_who, p_work_date, p_jobcode_id, p_clock_in_at, p_clock_out_at,
     p_clock_in_at, p_clock_out_at, p_from, p_for, now());

  PERFORM common.time_recount_day(v_who, p_work_date);

  SELECT * INTO v_new FROM common.time_entries WHERE id = p_entry_id;
  INSERT INTO common.time_entry_changes
    (entry_id, profile_id, work_date, action, reason, old_row, new_row, changed_by)
  VALUES
    (v_new.id, v_who, p_work_date, 'add', btrim(p_reason), NULL, to_jsonb(v_new), v_me);

  RETURN v_new;
END;
$$;

-- Remove a punch made by mistake. The full punch is kept in time_entry_changes.
CREATE OR REPLACE FUNCTION common.time_remove_entry(p_entry_id uuid, p_reason text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = common, public
AS $$
DECLARE
  v_me uuid := auth.uid();
  v_old common.time_entries;
BEGIN
  IF v_me IS NULL THEN
    RAISE EXCEPTION 'Not signed in';
  END IF;
  IF btrim(COALESCE(p_reason, '')) = '' THEN
    RAISE EXCEPTION 'Say why the punch is being removed';
  END IF;

  SELECT * INTO v_old FROM common.time_entries WHERE id = p_entry_id FOR UPDATE;
  IF NOT FOUND THEN
    -- Same request sent twice
    IF EXISTS (
      SELECT 1 FROM common.time_entry_changes WHERE entry_id = p_entry_id AND action = 'remove'
    ) THEN
      RETURN;
    END IF;
    RAISE EXCEPTION 'Punch not found';
  END IF;
  IF v_old.profile_id <> v_me AND NOT common.time_is_payroll_admin() THEN
    RAISE EXCEPTION 'Only the person or payroll can remove a punch';
  END IF;

  DELETE FROM common.time_entries WHERE id = v_old.id;
  INSERT INTO common.time_entry_changes
    (entry_id, profile_id, work_date, action, reason, old_row, new_row, changed_by)
  VALUES
    (v_old.id, v_old.profile_id, v_old.work_date, 'remove', btrim(p_reason), to_jsonb(v_old), NULL, v_me);

  PERFORM common.time_recount_day(v_old.profile_id, v_old.work_date);
END;
$$;

-- ---------------------------------------------------------------------------
-- The week
-- ---------------------------------------------------------------------------

-- Send my week to my approver before Monday 8:00 AM, or send a denied week back.
CREATE OR REPLACE FUNCTION common.time_submit_week(p_week_start date) RETURNS common.time_weeks
LANGUAGE plpgsql SECURITY DEFINER SET search_path = common, public
AS $$
DECLARE
  v_me uuid := auth.uid();
  v_week common.time_weeks;
  v_hours numeric;
BEGIN
  IF v_me IS NULL THEN
    RAISE EXCEPTION 'Not signed in';
  END IF;
  IF p_week_start IS NULL OR p_week_start <> common.time_week_start(p_week_start) THEN
    RAISE EXCEPTION 'A week starts on a Sunday';
  END IF;
  IF EXISTS (
    SELECT 1 FROM common.time_entries
     WHERE profile_id = v_me AND clock_out_at IS NULL
       AND work_date >= p_week_start AND work_date < p_week_start + 7
  ) THEN
    RAISE EXCEPTION 'Clock out before you submit the week';
  END IF;

  INSERT INTO common.time_weeks (profile_id, week_start)
  VALUES (v_me, p_week_start) ON CONFLICT DO NOTHING;
  SELECT * INTO v_week FROM common.time_weeks
   WHERE profile_id = v_me AND week_start = p_week_start FOR UPDATE;
  IF v_week.status = 'approved' THEN
    RAISE EXCEPTION 'That week is already approved';
  END IF;

  SELECT COALESCE(sum(hours), 0) INTO v_hours FROM common.time_entries
   WHERE profile_id = v_me AND work_date >= p_week_start AND work_date < p_week_start + 7;

  UPDATE common.time_weeks
     SET status = 'submitted', submitted_at = now(),
         decided_by = NULL, decided_at = NULL, denied_note = NULL, denied_days = '{}'
   WHERE profile_id = v_me AND week_start = p_week_start
  RETURNING * INTO v_week;

  INSERT INTO common.time_week_events (profile_id, week_start, action, by_profile_id, hours)
  VALUES (v_me, p_week_start, 'submit', v_me, v_hours);

  RETURN v_week;
END;
$$;

-- Shared checks for approve and deny. Hands back the week row, locked for the change.
CREATE OR REPLACE FUNCTION common.time_week_for_review(p_profile_id uuid, p_week_start date)
RETURNS common.time_weeks
LANGUAGE plpgsql SECURITY DEFINER SET search_path = common, public
AS $$
DECLARE
  v_me uuid := auth.uid();
  v_week common.time_weeks;
BEGIN
  IF v_me IS NULL THEN
    RAISE EXCEPTION 'Not signed in';
  END IF;
  IF p_week_start IS NULL OR p_week_start <> common.time_week_start(p_week_start) THEN
    RAISE EXCEPTION 'A week starts on a Sunday';
  END IF;
  -- Nobody signs off on their own hours, payroll included
  IF p_profile_id = v_me THEN
    RAISE EXCEPTION 'You cannot review your own week';
  END IF;
  IF NOT common.time_can_see(p_profile_id, p_week_start) THEN
    RAISE EXCEPTION 'That is not your timesheet to review';
  END IF;
  IF common.time_today() < p_week_start + 7 THEN
    RAISE EXCEPTION 'That week is not over yet';
  END IF;

  INSERT INTO common.time_weeks (profile_id, week_start)
  VALUES (p_profile_id, p_week_start) ON CONFLICT DO NOTHING;
  SELECT * INTO v_week FROM common.time_weeks
   WHERE profile_id = p_profile_id AND week_start = p_week_start FOR UPDATE;

  IF v_week.status = 'approved' THEN
    RAISE EXCEPTION 'That week is already approved. Payroll must reopen it first.';
  END IF;
  -- Sunday is left for people to fix their own punches
  IF v_week.status <> 'submitted' AND now() < common.time_week_mark(p_week_start, 8) THEN
    RAISE EXCEPTION 'Not ready for review until Monday 8:00 AM';
  END IF;
  IF EXISTS (
    SELECT 1 FROM common.time_entries
     WHERE profile_id = p_profile_id AND clock_out_at IS NULL
       AND work_date >= p_week_start AND work_date < p_week_start + 7
  ) THEN
    RAISE EXCEPTION 'They are still clocked in';
  END IF;

  RETURN v_week;
END;
$$;

-- Approve a whole week: hours, per diem, and miles. Locks the week.
-- p_expected_hours is the total the approver was looking at. If the hours changed
-- since then, the approval is refused so nobody approves a number they never saw.
CREATE OR REPLACE FUNCTION common.time_approve_week(
  p_profile_id uuid,
  p_week_start date,
  p_expected_hours numeric DEFAULT NULL
) RETURNS common.time_weeks
LANGUAGE plpgsql SECURITY DEFINER SET search_path = common, public
AS $$
DECLARE
  v_week common.time_weeks;
  v_hours numeric;
  v_punches int;
BEGIN
  v_week := common.time_week_for_review(p_profile_id, p_week_start);

  SELECT COALESCE(sum(hours), 0), count(*) INTO v_hours, v_punches FROM common.time_entries
   WHERE profile_id = p_profile_id AND work_date >= p_week_start AND work_date < p_week_start + 7;

  IF v_punches = 0 AND NOT EXISTS (
    SELECT 1 FROM common.time_day_extras
     WHERE profile_id = p_profile_id AND work_date >= p_week_start AND work_date < p_week_start + 7
       AND (per_diem OR miles > 0)
  ) THEN
    RAISE EXCEPTION 'Nothing to approve for that week';
  END IF;
  IF p_expected_hours IS NOT NULL AND p_expected_hours <> v_hours THEN
    RAISE EXCEPTION 'Hours changed since you looked. Check the week again.';
  END IF;

  UPDATE common.time_weeks
     SET status = 'approved', decided_by = auth.uid(), decided_at = now(),
         approved_hours = v_hours, denied_note = NULL, denied_days = '{}'
   WHERE profile_id = p_profile_id AND week_start = p_week_start
  RETURNING * INTO v_week;

  INSERT INTO common.time_week_events (profile_id, week_start, action, by_profile_id, hours)
  VALUES (p_profile_id, p_week_start, 'approve', auth.uid(), v_hours);

  RETURN v_week;
END;
$$;

-- Deny a week, or some of its days. Goes back to the person with the note.
CREATE OR REPLACE FUNCTION common.time_deny_week(
  p_profile_id uuid,
  p_week_start date,
  p_note text,
  p_days date[] DEFAULT NULL
) RETURNS common.time_weeks
LANGUAGE plpgsql SECURITY DEFINER SET search_path = common, public
AS $$
DECLARE
  v_week common.time_weeks;
BEGIN
  IF btrim(COALESCE(p_note, '')) = '' THEN
    RAISE EXCEPTION 'A note is required to deny time';
  END IF;
  v_week := common.time_week_for_review(p_profile_id, p_week_start);
  IF p_days IS NOT NULL AND EXISTS (
    SELECT 1 FROM unnest(p_days) AS d(day) WHERE d.day < p_week_start OR d.day >= p_week_start + 7
  ) THEN
    RAISE EXCEPTION 'Those days are not in that week';
  END IF;

  UPDATE common.time_weeks
     SET status = 'denied', decided_by = auth.uid(), decided_at = now(),
         approved_hours = NULL, denied_note = btrim(p_note), denied_days = COALESCE(p_days, '{}')
   WHERE profile_id = p_profile_id AND week_start = p_week_start
  RETURNING * INTO v_week;

  INSERT INTO common.time_week_events (profile_id, week_start, action, by_profile_id, note)
  VALUES (p_profile_id, p_week_start, 'deny', auth.uid(), btrim(p_note));

  RETURN v_week;
END;
$$;

-- Unlock an approved week. Payroll only.
CREATE OR REPLACE FUNCTION common.time_reopen_week(
  p_profile_id uuid,
  p_week_start date,
  p_note text
) RETURNS common.time_weeks
LANGUAGE plpgsql SECURITY DEFINER SET search_path = common, public
AS $$
DECLARE
  v_me uuid := auth.uid();
  v_week common.time_weeks;
BEGIN
  IF v_me IS NULL THEN
    RAISE EXCEPTION 'Not signed in';
  END IF;
  IF NOT common.time_is_payroll_admin() THEN
    RAISE EXCEPTION 'Only payroll can reopen a week';
  END IF;
  IF btrim(COALESCE(p_note, '')) = '' THEN
    RAISE EXCEPTION 'Say why the week is being reopened';
  END IF;

  SELECT * INTO v_week FROM common.time_weeks
   WHERE profile_id = p_profile_id AND week_start = p_week_start FOR UPDATE;
  IF NOT FOUND OR v_week.status <> 'approved' THEN
    RAISE EXCEPTION 'That week is not approved';
  END IF;

  UPDATE common.time_weeks
     SET status = 'open', decided_by = NULL, decided_at = NULL, approved_hours = NULL
   WHERE profile_id = p_profile_id AND week_start = p_week_start
  RETURNING * INTO v_week;

  INSERT INTO common.time_week_events (profile_id, week_start, action, by_profile_id, note)
  VALUES (p_profile_id, p_week_start, 'reopen', v_me, btrim(p_note));

  RETURN v_week;
END;
$$;

-- Payroll's tick that a week's per diem and miles made it onto the paycheck.
CREATE OR REPLACE FUNCTION common.time_mark_extras_paid(
  p_profile_id uuid,
  p_week_start date,
  p_paid boolean DEFAULT true
) RETURNS common.time_weeks
LANGUAGE plpgsql SECURITY DEFINER SET search_path = common, public
AS $$
DECLARE
  v_me uuid := auth.uid();
  v_week common.time_weeks;
BEGIN
  IF v_me IS NULL THEN
    RAISE EXCEPTION 'Not signed in';
  END IF;
  IF NOT common.time_is_payroll_admin() THEN
    RAISE EXCEPTION 'Only payroll can mark per diem and miles as paid';
  END IF;

  UPDATE common.time_weeks
     SET extras_paid_at = CASE WHEN p_paid THEN now() END,
         extras_paid_by = CASE WHEN p_paid THEN v_me END
   WHERE profile_id = p_profile_id AND week_start = p_week_start AND status = 'approved'
  RETURNING * INTO v_week;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'That week is not approved yet';
  END IF;

  INSERT INTO common.time_week_events (profile_id, week_start, action, by_profile_id)
  VALUES (p_profile_id, p_week_start, CASE WHEN p_paid THEN 'extras_paid' ELSE 'extras_unpaid' END, v_me);

  RETURN v_week;
END;
$$;

-- The list an approver works from: everyone whose week I may review, with totals and
-- flags. Payroll gets everyone. is_direct marks my own reports.
CREATE OR REPLACE FUNCTION common.time_my_reviews(p_week_start date)
RETURNS TABLE (
  profile_id uuid,
  full_name text,
  status text,
  hours numeric,
  per_diem_days integer,
  miles numeric,
  fixes integer,
  no_lunch_days integer,
  clocked_in boolean,
  is_direct boolean,
  is_ready boolean,
  is_late boolean,
  decided_by uuid,
  decided_at timestamptz,
  denied_note text,
  denied_days date[],
  extras_paid_at timestamptz
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = common, public
AS $$
  WITH people AS (
    SELECT x.profile_id
      FROM (
        SELECT e.profile_id FROM common.time_entries e
         WHERE e.work_date >= p_week_start AND e.work_date < p_week_start + 7
        UNION
        SELECT d.profile_id FROM common.time_day_extras d
         WHERE d.work_date >= p_week_start AND d.work_date < p_week_start + 7
           AND (d.per_diem OR d.miles > 0)
      ) x
     WHERE x.profile_id <> auth.uid()
       AND common.time_can_see(x.profile_id, p_week_start)
  ),
  days AS (
    SELECT e.profile_id, e.work_date,
           COALESCE(sum(e.hours), 0) AS hours,
           COALESCE(bool_or(e.ended_for = 'lunch'), false) AS had_lunch,
           bool_or(e.clock_out_at IS NULL) AS open_now
      FROM common.time_entries e
      JOIN people p ON p.profile_id = e.profile_id
     WHERE e.work_date >= p_week_start AND e.work_date < p_week_start + 7
     GROUP BY e.profile_id, e.work_date
  ),
  totals AS (
    SELECT d.profile_id,
           sum(d.hours) AS hours,
           -- A day over 6 hours with no lunch punch
           count(*) FILTER (WHERE d.hours > 6 AND NOT d.had_lunch) AS no_lunch_days,
           bool_or(d.open_now) AS clocked_in
      FROM days d
     GROUP BY d.profile_id
  ),
  extras AS (
    SELECT d.profile_id,
           count(*) FILTER (WHERE d.per_diem) AS per_diem_days,
           sum(d.miles) AS miles
      FROM common.time_day_extras d
      JOIN people p ON p.profile_id = d.profile_id
     WHERE d.work_date >= p_week_start AND d.work_date < p_week_start + 7
     GROUP BY d.profile_id
  ),
  fixed AS (
    SELECT c.profile_id, count(*) AS fixes
      FROM common.time_entry_changes c
      JOIN people p ON p.profile_id = c.profile_id
     WHERE c.work_date >= p_week_start AND c.work_date < p_week_start + 7
     GROUP BY c.profile_id
  )
  SELECT p.profile_id,
         pr.full_name::text,
         COALESCE(w.status, 'open'),
         COALESCE(t.hours, 0),
         COALESCE(x.per_diem_days, 0)::integer,
         COALESCE(x.miles, 0),
         COALESCE(f.fixes, 0)::integer,
         COALESCE(t.no_lunch_days, 0)::integer,
         COALESCE(t.clocked_in, false),
         EXISTS (
           SELECT 1 FROM common.time_approvers_of(p.profile_id) AS a(boss_id)
            WHERE common.time_acts_as(a.boss_id)
         ),
         COALESCE(w.status, 'open') = 'submitted' OR now() >= common.time_week_mark(p_week_start, 8),
         COALESCE(w.status, 'open') <> 'approved' AND now() >= common.time_week_mark(p_week_start, 9),
         w.decided_by,
         w.decided_at,
         w.denied_note,
         COALESCE(w.denied_days, '{}'::date[]),
         w.extras_paid_at
    FROM people p
    LEFT JOIN common.profiles pr ON pr.id = p.profile_id
    LEFT JOIN common.time_weeks w ON w.profile_id = p.profile_id AND w.week_start = p_week_start
    LEFT JOIN totals t ON t.profile_id = p.profile_id
    LEFT JOIN extras x ON x.profile_id = p.profile_id
    LEFT JOIN fixed f ON f.profile_id = p.profile_id
   ORDER BY pr.full_name;
$$;

-- ---------------------------------------------------------------------------
-- Who can see and change what
-- ---------------------------------------------------------------------------

ALTER TABLE common.time_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE common.time_approver_backups ENABLE ROW LEVEL SECURITY;
ALTER TABLE common.time_weeks ENABLE ROW LEVEL SECURITY;
ALTER TABLE common.time_week_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE common.time_entry_changes ENABLE ROW LEVEL SECURITY;

-- Weeks, their history, and punch fixes get no write grant: they change only through
-- the functions above.
GRANT SELECT, UPDATE ON TABLE common.time_settings TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE common.time_approver_backups TO authenticated;
GRANT SELECT ON TABLE common.time_weeks, common.time_week_events, common.time_entry_changes TO authenticated;
GRANT ALL ON TABLE common.time_settings, common.time_approver_backups, common.time_weeks,
  common.time_week_events, common.time_entry_changes TO service_role;

-- Entries: now also your boss, through the privacy rule
DROP POLICY IF EXISTS "time_entries_select_own_or_admin" ON common.time_entries;
DROP POLICY IF EXISTS "time_entries_select_visible" ON common.time_entries;
CREATE POLICY "time_entries_select_visible"
  ON common.time_entries FOR SELECT
  TO authenticated
  USING (profile_id = auth.uid() OR common.time_is_payroll_admin()
         OR common.time_can_see(profile_id, work_date));

DROP POLICY IF EXISTS "time_day_extras_select_own_or_admin" ON common.time_day_extras;
DROP POLICY IF EXISTS "time_day_extras_select_visible" ON common.time_day_extras;
CREATE POLICY "time_day_extras_select_visible"
  ON common.time_day_extras FOR SELECT
  TO authenticated
  USING (profile_id = auth.uid() OR common.time_is_payroll_admin()
         OR common.time_can_see(profile_id, work_date));

DROP POLICY IF EXISTS "time_weeks_select_visible" ON common.time_weeks;
CREATE POLICY "time_weeks_select_visible"
  ON common.time_weeks FOR SELECT
  TO authenticated
  USING (common.time_can_see(profile_id, week_start));

DROP POLICY IF EXISTS "time_week_events_select_visible" ON common.time_week_events;
CREATE POLICY "time_week_events_select_visible"
  ON common.time_week_events FOR SELECT
  TO authenticated
  USING (common.time_can_see(profile_id, week_start));

DROP POLICY IF EXISTS "time_entry_changes_select_visible" ON common.time_entry_changes;
CREATE POLICY "time_entry_changes_select_visible"
  ON common.time_entry_changes FOR SELECT
  TO authenticated
  USING (common.time_can_see(profile_id, work_date));

-- Settings: everyone reads, payroll changes
DROP POLICY IF EXISTS "time_settings_select_all" ON common.time_settings;
CREATE POLICY "time_settings_select_all"
  ON common.time_settings FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "time_settings_update_admin" ON common.time_settings;
CREATE POLICY "time_settings_update_admin"
  ON common.time_settings FOR UPDATE
  TO authenticated
  USING (common.time_is_payroll_admin())
  WITH CHECK (common.time_is_payroll_admin());

-- Stand-ins: payroll sets them. The two people involved can see theirs.
DROP POLICY IF EXISTS "time_approver_backups_select_involved" ON common.time_approver_backups;
CREATE POLICY "time_approver_backups_select_involved"
  ON common.time_approver_backups FOR SELECT
  TO authenticated
  USING (approver_profile_id = auth.uid() OR backup_profile_id = auth.uid()
         OR common.time_is_payroll_admin());

DROP POLICY IF EXISTS "time_approver_backups_write_admin" ON common.time_approver_backups;
CREATE POLICY "time_approver_backups_write_admin"
  ON common.time_approver_backups FOR ALL
  TO authenticated
  USING (common.time_is_payroll_admin())
  WITH CHECK (common.time_is_payroll_admin());

-- Functions are open to everyone by default, signed in or not. Close them, then open
-- only the ones a signed-in person should call.
REVOKE ALL ON FUNCTION common.time_approvers_of(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION common.time_acts_as(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION common.time_recount_day(uuid, date) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION common.time_week_for_review(uuid, date) FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION common.time_can_see(uuid, date) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION common.time_fix_entry(uuid, timestamptz, timestamptz, bigint, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION common.time_add_entry(uuid, uuid, date, bigint, timestamptz, timestamptz, text, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION common.time_remove_entry(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION common.time_submit_week(date) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION common.time_approve_week(uuid, date, numeric) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION common.time_deny_week(uuid, date, text, date[]) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION common.time_reopen_week(uuid, date, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION common.time_mark_extras_paid(uuid, date, boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION common.time_my_reviews(date) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION common.time_can_see(uuid, date) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION common.time_fix_entry(uuid, timestamptz, timestamptz, bigint, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION common.time_add_entry(uuid, uuid, date, bigint, timestamptz, timestamptz, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION common.time_remove_entry(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION common.time_submit_week(date) TO authenticated;
GRANT EXECUTE ON FUNCTION common.time_approve_week(uuid, date, numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION common.time_deny_week(uuid, date, text, date[]) TO authenticated;
GRANT EXECUTE ON FUNCTION common.time_reopen_week(uuid, date, text) TO authenticated;
GRANT EXECUTE ON FUNCTION common.time_mark_extras_paid(uuid, date, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION common.time_my_reviews(date) TO authenticated;

-- ---------------------------------------------------------------------------
-- Shop time
-- ---------------------------------------------------------------------------

-- Plain 26000 under AMP LLC is the internal overhead job, and 26000-Training is training.
-- The other 26000 codes (Estimating, Emergency Call Out, ...) stay normal jobs, picked
-- by their own names. The sync leaves these tags alone.
UPDATE common.time_jobs SET kind = 'shop'
 WHERE btrim(name) = '26000' AND customer_name = 'AMP LLC' AND kind = 'job';
UPDATE common.time_jobs SET kind = 'training'
 WHERE btrim(name) = '26000-Training' AND customer_name = 'AMP LLC' AND kind = 'job';

-- ---------------------------------------------------------------------------
-- Practice run
-- ---------------------------------------------------------------------------

-- Clocks one real hourly person through a made-up day in 2001, then checks rounding,
-- fixing, privacy, approval, the lock, and reopening. Every path out of the inner block
-- is an error on purpose, so the database undoes all of it. Only the verdict is kept.
DO $$
DECLARE
  v_w uuid;                              -- the person
  v_b uuid;                              -- their boss
  v_job bigint;
  v_week date := date '2001-01-07';      -- a Sunday
  v_day date := date '2001-01-08';
  v_e1 uuid := gen_random_uuid();
  v_e2 uuid := gen_random_uuid();
  v_hours numeric;
  v_status text;
  v_fail text := '';
BEGIN
  BEGIN
    SELECT tp.profile_id INTO v_w
      FROM common.time_people tp
     WHERE tp.clocks_in AND tp.qb_time_user_id IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM common.time_entries e WHERE e.profile_id = tp.profile_id)
       AND EXISTS (SELECT 1 FROM common.time_approvers_of(tp.profile_id))
     LIMIT 1;
    SELECT a.boss_id INTO v_b FROM common.time_approvers_of(v_w) AS a(boss_id) LIMIT 1;
    SELECT j.qb_time_jobcode_id INTO v_job FROM common.time_jobs j WHERE j.active LIMIT 1;

    IF v_w IS NULL OR v_b IS NULL OR v_job IS NULL THEN
      v_fail := 'skipped: needs one matched hourly person with a boss on the org chart, and one job';
      RAISE EXCEPTION 'timestamp_practice_done';
    END IF;

    -- Stand in as the person
    PERFORM set_config('request.jwt.claim.sub', v_w::text, true),
            set_config('request.jwt.claims', jsonb_build_object('sub', v_w, 'user_metadata', jsonb_build_object('role', 'Technician'))::text, true);
    IF auth.uid() IS DISTINCT FROM v_w THEN
      v_fail := 'skipped: could not stand in as a test person';
      RAISE EXCEPTION 'timestamp_practice_done';
    END IF;

    -- In 7:08, lunch 11:32 to 12:04, out 3:31. Should count 7:00 to 11:30 and 12:00 to 3:45.
    PERFORM common.time_clock_in(v_e1, v_job, timestamptz '2001-01-08 07:08:40+00', v_day, 'day');
    PERFORM common.time_clock_out(timestamptz '2001-01-08 11:32:10+00', 'lunch');
    PERFORM common.time_clock_in(v_e2, v_job, timestamptz '2001-01-08 12:04:00+00', v_day, 'lunch');
    PERFORM common.time_clock_out(timestamptz '2001-01-08 15:31:00+00', 'day');
    SELECT COALESCE(sum(hours), 0) INTO v_hours FROM common.time_entries WHERE profile_id = v_w AND work_date = v_day;
    IF v_hours IS DISTINCT FROM 8.25 THEN
      v_fail := v_fail || ' | day should count 8.25 h, got ' || v_hours;
    END IF;

    PERFORM common.time_recount_day(v_w, v_day);
    SELECT COALESCE(sum(hours), 0) INTO v_hours FROM common.time_entries WHERE profile_id = v_w AND work_date = v_day;
    IF v_hours IS DISTINCT FROM 8.25 THEN
      v_fail := v_fail || ' | recount changed an untouched day to ' || v_hours;
    END IF;

    -- Fix: really left at 4:02. Should count to 4:15.
    PERFORM common.time_fix_entry(v_e2, NULL, timestamptz '2001-01-08 16:02:00+00', NULL, 'practice run');
    SELECT COALESCE(sum(hours), 0) INTO v_hours FROM common.time_entries WHERE profile_id = v_w AND work_date = v_day;
    IF v_hours IS DISTINCT FROM 8.75 THEN
      v_fail := v_fail || ' | fixed day should count 8.75 h, got ' || v_hours;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM common.time_entry_changes WHERE entry_id = v_e2 AND action = 'fix') THEN
      v_fail := v_fail || ' | fix left no record';
    END IF;

    -- A stranger must not see the hours
    PERFORM set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000001', true),
            set_config('request.jwt.claims', jsonb_build_object('sub', '00000000-0000-4000-8000-000000000001', 'user_metadata', jsonb_build_object('role', 'Technician'))::text, true);
    IF common.time_can_see(v_w, v_day) THEN
      v_fail := v_fail || ' | a stranger can see the hours';
    END IF;

    -- Stand in as the boss
    PERFORM set_config('request.jwt.claim.sub', v_b::text, true),
            set_config('request.jwt.claims', jsonb_build_object('sub', v_b, 'user_metadata', jsonb_build_object('role', 'Technician'))::text, true);
    IF NOT common.time_can_see(v_w, v_day) THEN
      v_fail := v_fail || ' | the boss cannot see the hours';
    END IF;

    BEGIN
      PERFORM common.time_approve_week(v_w, v_week, 1);
      v_fail := v_fail || ' | approved a total the boss never saw';
    EXCEPTION WHEN OTHERS THEN
      IF SQLERRM NOT LIKE '%changed%' THEN
        v_fail := v_fail || ' | wrong-total check: ' || SQLERRM;
      END IF;
    END;

    PERFORM common.time_approve_week(v_w, v_week, 8.75);
    SELECT status INTO v_status FROM common.time_weeks WHERE profile_id = v_w AND week_start = v_week;
    IF v_status IS DISTINCT FROM 'approved' THEN
      v_fail := v_fail || ' | boss approval did not stick';
    END IF;

    BEGIN
      PERFORM common.time_reopen_week(v_w, v_week, 'practice run');
      v_fail := v_fail || ' | a boss reopened a locked week';
    EXCEPTION WHEN OTHERS THEN
      IF SQLERRM NOT LIKE '%Only payroll%' THEN
        v_fail := v_fail || ' | reopen check: ' || SQLERRM;
      END IF;
    END;

    -- Back as the person: the week is locked
    PERFORM set_config('request.jwt.claim.sub', v_w::text, true),
            set_config('request.jwt.claims', jsonb_build_object('sub', v_w, 'user_metadata', jsonb_build_object('role', 'Technician'))::text, true);
    BEGIN
      PERFORM common.time_fix_entry(v_e2, NULL, timestamptz '2001-01-08 18:00:00+00', NULL, 'practice run');
      v_fail := v_fail || ' | a locked week was changed';
    EXCEPTION WHEN OTHERS THEN
      IF SQLERRM NOT LIKE '%locked%' THEN
        v_fail := v_fail || ' | lock check: ' || SQLERRM;
      END IF;
    END;

    -- The person as a payroll admin still cannot approve their own week
    PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', v_w, 'user_metadata', jsonb_build_object('role', 'Admin'))::text, true);
    BEGIN
      PERFORM common.time_approve_week(v_w, v_week);
      v_fail := v_fail || ' | someone approved their own week';
    EXCEPTION WHEN OTHERS THEN
      IF SQLERRM NOT LIKE '%your own%' THEN
        v_fail := v_fail || ' | own-week check: ' || SQLERRM;
      END IF;
    END;

    -- The boss as a payroll admin reopens it
    PERFORM set_config('request.jwt.claim.sub', v_b::text, true),
            set_config('request.jwt.claims', jsonb_build_object('sub', v_b, 'user_metadata', jsonb_build_object('role', 'Admin'))::text, true);
    PERFORM common.time_reopen_week(v_w, v_week, 'practice run');
    SELECT status INTO v_status FROM common.time_weeks WHERE profile_id = v_w AND week_start = v_week;
    IF v_status IS DISTINCT FROM 'open' THEN
      v_fail := v_fail || ' | payroll reopen did not stick';
    END IF;

    -- The boss, plain again: deny needs a note
    PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', v_b, 'user_metadata', jsonb_build_object('role', 'Technician'))::text, true);
    BEGIN
      PERFORM common.time_deny_week(v_w, v_week, '  ');
      v_fail := v_fail || ' | denied with no note';
    EXCEPTION WHEN OTHERS THEN
      IF SQLERRM NOT LIKE '%note is required%' THEN
        v_fail := v_fail || ' | deny-note check: ' || SQLERRM;
      END IF;
    END;
    PERFORM common.time_deny_week(v_w, v_week, 'practice run');
    SELECT status INTO v_status FROM common.time_weeks WHERE profile_id = v_w AND week_start = v_week;
    IF v_status IS DISTINCT FROM 'denied' THEN
      v_fail := v_fail || ' | deny did not stick';
    END IF;

    -- The person sends it back, then removes the morning punch
    PERFORM set_config('request.jwt.claim.sub', v_w::text, true),
            set_config('request.jwt.claims', jsonb_build_object('sub', v_w, 'user_metadata', jsonb_build_object('role', 'Technician'))::text, true);
    PERFORM common.time_submit_week(v_week);
    SELECT status INTO v_status FROM common.time_weeks WHERE profile_id = v_w AND week_start = v_week;
    IF v_status IS DISTINCT FROM 'submitted' THEN
      v_fail := v_fail || ' | resubmit did not stick';
    END IF;

    PERFORM common.time_remove_entry(v_e1, 'practice run');
    SELECT COALESCE(sum(hours), 0) INTO v_hours FROM common.time_entries WHERE profile_id = v_w AND work_date = v_day;
    IF v_hours IS DISTINCT FROM 4.25 THEN
      v_fail := v_fail || ' | after removing the morning, day should count 4.25 h, got ' || v_hours;
    END IF;
    BEGIN
      PERFORM common.time_clock_in(v_e1, v_job, timestamptz '2001-01-08 07:08:40+00', v_day, 'day');
      v_fail := v_fail || ' | a removed punch came back';
    EXCEPTION WHEN OTHERS THEN
      IF SQLERRM NOT LIKE '%was removed%' THEN
        v_fail := v_fail || ' | removed-punch check: ' || SQLERRM;
      END IF;
    END;

    RAISE EXCEPTION 'timestamp_practice_done';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'timestamp_practice_done' THEN
      v_fail := v_fail || ' | stopped early: ' || SQLERRM;
    END IF;
  END;

  PERFORM set_config('timestamp.practice_run', CASE WHEN v_fail = '' THEN 'all passed' ELSE btrim(v_fail, ' |') END, false);
END;
$$;

-- Result. Expect:
--   practice_run = all passed
--   new_tables   = time_approver_backups, time_entry_changes, time_settings, time_week_events, time_weeks
--   leftovers    = 0   (the practice run kept nothing)
-- The other three are counts to read back: people matched to QuickBooks Time, hourly
-- people with nobody on the org chart to approve them, and the job tagged as shop.
SELECT
  current_setting('timestamp.practice_run', true) AS practice_run,
  (SELECT count(*) FROM common.time_entries WHERE work_date < date '2002-01-01') AS leftovers,
  (SELECT count(*) FROM common.time_people WHERE qb_time_user_id IS NOT NULL) AS people_matched,
  (SELECT count(*) FROM common.time_people tp
    WHERE tp.clocks_in AND tp.qb_time_user_id IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM common.time_approvers_of(tp.profile_id))) AS hourly_with_no_boss,
  (SELECT string_agg(COALESCE(customer_name || ': ', '') || name, ', ')
     FROM common.time_jobs WHERE kind = 'shop') AS shop_jobs,
  (SELECT string_agg(table_name::text, ', ' ORDER BY table_name::text)
     FROM information_schema.tables
    WHERE table_schema = 'common'
      AND table_name IN ('time_settings', 'time_approver_backups', 'time_weeks',
                         'time_week_events', 'time_entry_changes')) AS new_tables;
