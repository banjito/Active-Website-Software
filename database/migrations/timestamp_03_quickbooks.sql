-- TimeStAMP, part 3: sending approved hours to QuickBooks Time
--
-- Why: payroll reads hours from QuickBooks Time. Once a week is approved, its hours go
-- there as one entry per day per job. This keeps a record of exactly what was sent, so
-- nothing is sent twice and a reopened week can take its entries back out first.
--
-- What this adds (all in the common schema):
--   time_weeks.qb_sent_at / qb_error   when the week reached QuickBooks Time, or why not
--   time_qb_sends                      one row per entry made in QuickBooks Time
--   time_reopen_week                   now refuses while entries are still in QuickBooks Time
--
-- The sending itself is done by the quickbooks-time-api server function.
--
-- Safe to run more than once.

ALTER TABLE common.time_weeks ADD COLUMN IF NOT EXISTS qb_sent_at timestamptz;
ALTER TABLE common.time_weeks ADD COLUMN IF NOT EXISTS qb_error text;

CREATE TABLE IF NOT EXISTS common.time_qb_sends (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  profile_id uuid NOT NULL REFERENCES auth.users(id),
  week_start date NOT NULL,
  work_date date NOT NULL,
  qb_time_jobcode_id bigint NOT NULL REFERENCES common.time_jobs(qb_time_jobcode_id),
  hours numeric NOT NULL,
  -- The entry's ID in QuickBooks Time, needed to take it back out
  qb_time_timesheet_id bigint NOT NULL,
  sent_at timestamptz NOT NULL DEFAULT now(),
  -- Set when the entry was taken back out of QuickBooks Time
  removed_at timestamptz
);

-- One live entry per person, day, and job. A second send of the same hours is refused.
CREATE UNIQUE INDEX IF NOT EXISTS uq_time_qb_sends_live
  ON common.time_qb_sends (profile_id, work_date, qb_time_jobcode_id) WHERE removed_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_time_qb_sends_week
  ON common.time_qb_sends (profile_id, week_start);

ALTER TABLE common.time_qb_sends ENABLE ROW LEVEL SECURITY;

-- Read-only for people. Only the server function writes it.
GRANT SELECT ON TABLE common.time_qb_sends TO authenticated;
GRANT ALL ON TABLE common.time_qb_sends TO service_role;

DROP POLICY IF EXISTS "time_qb_sends_select_visible" ON common.time_qb_sends;
CREATE POLICY "time_qb_sends_select_visible"
  ON common.time_qb_sends FOR SELECT
  TO authenticated
  USING (common.time_can_see(profile_id, week_start));

-- Unlock an approved week. Payroll only. If its hours are in QuickBooks Time they must
-- come back out first, or the fixed week would be sent on top of the old one.
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
  IF v_week.qb_sent_at IS NOT NULL OR EXISTS (
    SELECT 1 FROM common.time_qb_sends
     WHERE profile_id = p_profile_id AND week_start = p_week_start AND removed_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Its hours are still in QuickBooks Time. Pull them back first.';
  END IF;

  UPDATE common.time_weeks
     SET status = 'open', decided_by = NULL, decided_at = NULL, approved_hours = NULL, qb_error = NULL
   WHERE profile_id = p_profile_id AND week_start = p_week_start
  RETURNING * INTO v_week;

  INSERT INTO common.time_week_events (profile_id, week_start, action, by_profile_id, note)
  VALUES (p_profile_id, p_week_start, 'reopen', v_me, btrim(p_note));

  RETURN v_week;
END;
$$;

-- Result. Expect: sends_table = time_qb_sends, week_columns = qb_error, qb_sent_at
SELECT
  (SELECT string_agg(table_name::text, ', ')
     FROM information_schema.tables
    WHERE table_schema = 'common' AND table_name = 'time_qb_sends') AS sends_table,
  (SELECT string_agg(column_name::text, ', ' ORDER BY column_name::text)
     FROM information_schema.columns
    WHERE table_schema = 'common' AND table_name = 'time_weeks'
      AND column_name IN ('qb_sent_at', 'qb_error')) AS week_columns;
