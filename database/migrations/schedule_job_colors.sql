-- Job colors on the schedule, shared by everyone.
-- Before this, each person's colors were saved only in their own browser.
-- No foreign key to neta_ops.jobs on purpose (DDL on that busy table can hang).

CREATE TABLE IF NOT EXISTS common.schedule_job_colors (
  job_id     uuid        PRIMARY KEY,
  color      text        NOT NULL CHECK (color ~ '^#[0-9a-fA-F]{6}$'),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE common.schedule_job_colors ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS schedule_job_colors_select ON common.schedule_job_colors;
CREATE POLICY schedule_job_colors_select ON common.schedule_job_colors
  FOR SELECT TO authenticated USING (true);

-- Only Admins and Schedulers can set colors (same rule as creating assignments).
DROP POLICY IF EXISTS schedule_job_colors_insert ON common.schedule_job_colors;
CREATE POLICY schedule_job_colors_insert ON common.schedule_job_colors
  FOR INSERT TO authenticated WITH CHECK (common.is_admin_or_scheduler());

DROP POLICY IF EXISTS schedule_job_colors_update ON common.schedule_job_colors;
CREATE POLICY schedule_job_colors_update ON common.schedule_job_colors
  FOR UPDATE TO authenticated
  USING (common.is_admin_or_scheduler())
  WITH CHECK (common.is_admin_or_scheduler());

GRANT SELECT, INSERT, UPDATE ON common.schedule_job_colors TO authenticated;
GRANT ALL ON common.schedule_job_colors TO service_role;
