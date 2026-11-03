-- People an admin has removed from a division's schedule (Listed View).
-- Removing only hides the row. Nothing about the person or their assignments
-- is deleted, and a hidden person still shows in any week they have a job.

CREATE TABLE IF NOT EXISTS common.schedule_hidden_people (
  division   text        NOT NULL,
  user_id    uuid        NOT NULL,
  hidden_by  uuid        DEFAULT auth.uid(),
  hidden_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (division, user_id)
);

ALTER TABLE common.schedule_hidden_people ENABLE ROW LEVEL SECURITY;

-- Everyone signed in can see who is hidden (so the schedule looks the same for all).
DROP POLICY IF EXISTS schedule_hidden_people_select ON common.schedule_hidden_people;
CREATE POLICY schedule_hidden_people_select ON common.schedule_hidden_people
  FOR SELECT TO authenticated USING (true);

-- Only Admins and Schedulers can remove or add back people
-- (same rule as creating assignments).
DROP POLICY IF EXISTS schedule_hidden_people_insert ON common.schedule_hidden_people;
CREATE POLICY schedule_hidden_people_insert ON common.schedule_hidden_people
  FOR INSERT TO authenticated WITH CHECK (common.is_admin_or_scheduler());

DROP POLICY IF EXISTS schedule_hidden_people_delete ON common.schedule_hidden_people;
CREATE POLICY schedule_hidden_people_delete ON common.schedule_hidden_people
  FOR DELETE TO authenticated USING (common.is_admin_or_scheduler());

GRANT SELECT, INSERT, DELETE ON common.schedule_hidden_people TO authenticated;
GRANT ALL ON common.schedule_hidden_people TO service_role;

-- Let Super Admins edit schedules too (they were left out of this rule,
-- so they could not add, edit, or delete assignments or remove people).
CREATE OR REPLACE FUNCTION common.is_admin_or_scheduler() RETURNS boolean
    LANGUAGE sql STABLE
    AS $$
  select
    coalesce(auth.jwt()->'user_metadata'->>'role','') in ('Admin', 'Super Admin')
    or coalesce(auth.jwt()->'user_metadata'->>'role','') ilike '%Scheduler%';
$$;
