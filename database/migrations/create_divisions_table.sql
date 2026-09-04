-- Divisions as data instead of a hardcoded list.
--
-- Until now a division was a bare string repeated in ~13 frontend arrays and ~17
-- text columns, and the only thing validating it anywhere was
-- neta_ops.jobs_division_check -- a CHECK listing the 13 known ids. Adding a
-- division therefore meant a migration (see Historical Migrations/Migrations/
-- add_virginia_division.sql) plus editing every array by hand.
--
-- This table is the single source of truth, and the jobs CHECK becomes a foreign
-- key to it, so "+ New Division" in the sidebar is one INSERT and the constraint
-- follows along on its own.
--
-- Data safety: nothing here reads, rewrites, or deletes a row of neta_ops.jobs.
-- The table is seeded from the ids actually present in that column (unioned with
-- the 13 values the old CHECK allowed), so the foreign key cannot reject an
-- existing job. If a job somehow still held an unknown division the ALTER would
-- fail and roll back -- it never nulls or drops a row. NULL divisions stay NULL;
-- a foreign key ignores them.
--
-- Idempotent: safe to run twice, and safe on an instance that already ran it.

CREATE TABLE IF NOT EXISTS common.divisions (
  id            text PRIMARY KEY,
  label         text NOT NULL,
  sort_order    integer NOT NULL DEFAULT 0,
  is_field_tech boolean NOT NULL DEFAULT true,
  active        boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE common.divisions IS
  'Every division the app knows about. neta_ops.jobs.division is a foreign key to this table, so adding a row here is all it takes to add a division.';
COMMENT ON COLUMN common.divisions.id IS
  'Internal identifier, also the URL segment: /north_alabama/jobs. Never rename an id in place unless you mean it -- the jobs foreign key cascades the rename.';
COMMENT ON COLUMN common.divisions.label IS
  'What users see in the division switcher, e.g. north_alabama displays as "Decatur".';
COMMENT ON COLUMN common.divisions.is_field_tech IS
  'True for the cities in the Field Technician Portal switcher; false for standalone portals (engineering, calibration, lab, hr).';
COMMENT ON COLUMN common.divisions.active IS
  'Set false to retire a division instead of deleting it. Deleting one that still has jobs is blocked by the foreign key, which is the point.';

-- Readable by any signed-in user, writable only by administrators. Same policy
-- shape common.app_settings uses.
ALTER TABLE common.divisions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS divisions_select_authenticated ON common.divisions;
CREATE POLICY divisions_select_authenticated
  ON common.divisions FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS divisions_write_admin ON common.divisions;
CREATE POLICY divisions_write_admin
  ON common.divisions TO authenticated
  USING (
    ((auth.jwt() -> 'user_metadata') ->> 'role') = ANY (ARRAY['Admin', 'Super Admin'])
    OR common.is_superuser_email(auth.jwt() ->> 'email')
  )
  WITH CHECK (
    ((auth.jwt() -> 'user_metadata') ->> 'role') = ANY (ARRAY['Admin', 'Super Admin'])
    OR common.is_superuser_email(auth.jwt() ->> 'email')
  );

GRANT USAGE ON SCHEMA common TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON common.divisions TO authenticated;

-- The Field Technician Portal switcher, in sidebar order.
INSERT INTO common.divisions (id, label, sort_order, is_field_tech) VALUES
  ('field_tech',     'Field Tech (All)', 10, true),
  ('north_alabama',  'Decatur',          20, true),
  ('tennessee',      'Nashville',        30, true),
  ('georgia',        'Atlanta',          40, true),
  ('virginia',       'Virginia',         50, true),
  ('international',  'International',    60, true)
ON CONFLICT (id) DO NOTHING;

-- Standalone portals that jobs already reference. They are not part of the
-- Field Tech switcher, but the foreign key still needs them to exist.
INSERT INTO common.divisions (id, label, sort_order, is_field_tech) VALUES
  ('engineering', 'Engineering',         100, false),
  ('calibration', 'Calibration Division',110, false),
  ('armadillo',   'Armadillo Division',  120, false),
  ('scavenger',   'Scavenger Division',  130, false),
  ('lab',         'Lab',                 140, false),
  ('hr',          'HR',                  150, false)
ON CONFLICT (id) DO NOTHING;

-- Legacy: 'Decatur' was accepted as a raw id alongside 'north_alabama'. Kept so
-- the foreign key accepts any job still carrying it, but inactive so no UI
-- offers it as a choice.
INSERT INTO common.divisions (id, label, sort_order, is_field_tech, active) VALUES
  ('Decatur', 'Decatur (legacy)', 900, false, false)
ON CONFLICT (id) DO NOTHING;

-- Anything a real job uses that the seeds above missed. Without this the foreign
-- key below would fail on instances carrying a division we do not know about.
INSERT INTO common.divisions (id, label, sort_order, is_field_tech, active)
SELECT DISTINCT
  j.division,
  initcap(replace(j.division, '_', ' ')),
  950,
  false,
  false
FROM neta_ops.jobs j
WHERE j.division IS NOT NULL
ON CONFLICT (id) DO NOTHING;

-- Swap the hardcoded whitelist for the table. ON UPDATE CASCADE so renaming an
-- id carries the jobs with it; no ON DELETE clause, so Postgres refuses to
-- delete a division that still has jobs.
ALTER TABLE neta_ops.jobs
  DROP CONSTRAINT IF EXISTS jobs_division_check;
ALTER TABLE neta_ops.jobs
  DROP CONSTRAINT IF EXISTS jobs_division_fkey;
ALTER TABLE neta_ops.jobs
  ADD CONSTRAINT jobs_division_fkey
  FOREIGN KEY (division) REFERENCES common.divisions(id) ON UPDATE CASCADE;

COMMENT ON COLUMN neta_ops.jobs.division IS
  'Division responsible for the job. Foreign key to common.divisions -- add a division there, not by editing a constraint.';
