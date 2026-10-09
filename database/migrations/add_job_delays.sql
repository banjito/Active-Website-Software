-- Job delay log: time a crew lost on a job, and why.
-- Feeds the Delays tab on the job page (delay man-hours vs. time on site).
--
--   neta_ops.job_delays          one row per delay
--   neta_ops.job_onsite_hours    total clocked hours on a job, for the "% lost" figure

CREATE TABLE IF NOT EXISTS neta_ops.job_delays (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES neta_ops.jobs(id) ON DELETE CASCADE,
  -- Who logged it
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id),
  logged_by_name text,
  delay_date date NOT NULL,
  -- Optional. When both are set the app works out hours from them
  start_time time,
  end_time time,
  hours numeric(6,2) NOT NULL CHECK (hours > 0),
  crew_size integer NOT NULL DEFAULT 1 CHECK (crew_size > 0),
  man_hours numeric GENERATED ALWAYS AS (hours * crew_size) STORED,
  reason text NOT NULL,
  caused_by text NOT NULL DEFAULT 'customer'
    CHECK (caused_by IN ('customer', 'contractor', 'internal', 'none')),
  billable boolean NOT NULL DEFAULT false,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_job_delays_job_id ON neta_ops.job_delays (job_id);

COMMENT ON TABLE neta_ops.job_delays IS 'Delays logged against a job: hours lost, crew size, reason, and who caused it.';

ALTER TABLE neta_ops.job_delays ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE neta_ops.job_delays TO authenticated;
GRANT ALL ON TABLE neta_ops.job_delays TO service_role;

-- Any signed-in user can read and add. You edit your own; Admins edit and delete all.
DROP POLICY IF EXISTS "job_delays_select" ON neta_ops.job_delays;
CREATE POLICY "job_delays_select"
  ON neta_ops.job_delays FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "job_delays_insert_own" ON neta_ops.job_delays;
CREATE POLICY "job_delays_insert_own"
  ON neta_ops.job_delays FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "job_delays_update_own_or_admin" ON neta_ops.job_delays;
CREATE POLICY "job_delays_update_own_or_admin"
  ON neta_ops.job_delays FOR UPDATE
  TO authenticated
  USING (
    user_id = auth.uid()
    OR coalesce(auth.jwt()->'user_metadata'->>'role', '') = 'Admin'
  )
  WITH CHECK (
    user_id = auth.uid()
    OR coalesce(auth.jwt()->'user_metadata'->>'role', '') = 'Admin'
  );

DROP POLICY IF EXISTS "job_delays_delete_admin" ON neta_ops.job_delays;
CREATE POLICY "job_delays_delete_admin"
  ON neta_ops.job_delays FOR DELETE
  TO authenticated
  USING (coalesce(auth.jwt()->'user_metadata'->>'role', '') = 'Admin');

-- Total clocked hours on a job. Returns one number, never who worked them,
-- so it can run for any signed-in user even though punches are private.
-- Returns NULL when the time clock tables are not installed or nobody has clocked in.
CREATE OR REPLACE FUNCTION neta_ops.job_onsite_hours(p_job_id uuid)
RETURNS numeric
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = common, public
AS $$
DECLARE
  v_hours numeric;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT sum(e.hours)
    INTO v_hours
    FROM common.time_entries e
    JOIN common.time_jobs j ON j.qb_time_jobcode_id = e.qb_time_jobcode_id
   WHERE j.job_id = p_job_id
     AND j.kind = 'job';

  RETURN v_hours;
EXCEPTION
  WHEN undefined_table THEN
    RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION neta_ops.job_onsite_hours(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION neta_ops.job_onsite_hours(uuid) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
