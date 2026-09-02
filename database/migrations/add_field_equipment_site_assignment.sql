-- Field equipment assignment, phase 1 — real links instead of typed-in names.
--
-- Until now `field_equipment.assigned_to` was free text whose meaning depended on
-- `assigned_type`: a user UUID for 'user', but the *name* of a site or truck for
-- 'job_site' and 'truck'. Two consequences:
--
--   1. Renaming a site silently detached every piece of equipment from it.
--   2. "What is at DNN4" was a string comparison that missed "DNN-4".
--
-- Worse, the job-site list (neta_ops.equipment_job_sites) is a second, free-text copy
-- of the facility registry ampOS already keeps in common.sites — the one with
-- addresses, active/inactive status and the customer equipment hanging off it. This
-- migration points equipment assignment at that registry and adds the truck and user
-- links alongside it.
--
-- `assigned_to` is deliberately left in place and still written by the UI. It stays the
-- display fallback for rows the backfill could not resolve, and nothing that reads it
-- today breaks.
--
-- Safe to re-run.

-- ── 1. The link columns ───────────────────────────────────────────────────────
ALTER TABLE neta_ops.field_equipment
  ADD COLUMN IF NOT EXISTS assigned_site_id  UUID REFERENCES common.sites(id)             ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS assigned_truck_id UUID REFERENCES neta_ops.equipment_trucks(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS assigned_user_id  UUID REFERENCES auth.users(id)                ON DELETE SET NULL;

COMMENT ON COLUMN neta_ops.field_equipment.assigned_site_id IS
  'Facility this equipment is assigned to (common.sites). Set when assigned_type = ''job_site''.';
COMMENT ON COLUMN neta_ops.field_equipment.assigned_truck_id IS
  'Truck this equipment is assigned to. Set when assigned_type = ''truck''.';
COMMENT ON COLUMN neta_ops.field_equipment.assigned_user_id IS
  'Person this equipment is assigned to. Set when assigned_type = ''user''.';
COMMENT ON COLUMN neta_ops.field_equipment.assigned_to IS
  'Legacy display value: a user UUID, or a site/truck name. Superseded by assigned_site_id / '
  'assigned_truck_id / assigned_user_id, and kept as the fallback label for unresolved rows.';

-- Permissive on purpose: a row may carry an assigned_type with no resolved link (the
-- backfill could not match the name), but it may never carry a link that contradicts
-- its type, or point at two things at once.
ALTER TABLE neta_ops.field_equipment
  DROP CONSTRAINT IF EXISTS field_equipment_assignment_target_check;
ALTER TABLE neta_ops.field_equipment
  ADD CONSTRAINT field_equipment_assignment_target_check CHECK (
        (assigned_site_id  IS NULL OR assigned_type = 'job_site')
    AND (assigned_truck_id IS NULL OR assigned_type = 'truck')
    AND (assigned_user_id  IS NULL OR assigned_type = 'user')
    AND (num_nonnulls(assigned_site_id, assigned_truck_id, assigned_user_id) <= 1)
  );

CREATE INDEX IF NOT EXISTS idx_field_equipment_assigned_site_id  ON neta_ops.field_equipment (assigned_site_id)  WHERE assigned_site_id  IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_field_equipment_assigned_truck_id ON neta_ops.field_equipment (assigned_truck_id) WHERE assigned_truck_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_field_equipment_assigned_user_id  ON neta_ops.field_equipment (assigned_user_id)  WHERE assigned_user_id  IS NOT NULL;

-- ── 2. Give every job-site name in use a real facility row ────────────────────
-- Names the field team is already using are real places. Creating them here means the
-- new site filter works on day one rather than showing empty for most of the fleet.
-- Near-duplicates ("QTS" alongside "QTS ATL2") become visible on the Sites page, which
-- is where someone can merge them; leaving them as loose strings hides the problem.
INSERT INTO common.sites (name, status, notes)
SELECT DISTINCT ON (lower(btrim(fe.assigned_to)))
       btrim(fe.assigned_to),
       'active',
       'Created from the field equipment job-site list. Address and details still need completing.'
FROM neta_ops.field_equipment fe
WHERE fe.assigned_type = 'job_site'
  AND fe.assigned_to IS NOT NULL
  AND btrim(fe.assigned_to) <> ''
  AND NOT EXISTS (
        SELECT 1 FROM common.sites s
        WHERE lower(btrim(s.name)) = lower(btrim(fe.assigned_to))
      )
ORDER BY lower(btrim(fe.assigned_to)), btrim(fe.assigned_to)
ON CONFLICT DO NOTHING;

-- ── 3. Backfill the links from the text ───────────────────────────────────────

-- Sites. Only unambiguous matches: a name that resolves to two facilities in different
-- cities is left for a human, because guessing would put equipment at the wrong place.
UPDATE neta_ops.field_equipment fe
SET    assigned_site_id = m.site_id
FROM (
  SELECT fe2.id AS equipment_id,
         min(s.id) AS site_id,
         count(*)  AS match_count
  FROM   neta_ops.field_equipment fe2
  JOIN   common.sites s
    ON   lower(btrim(s.name)) = lower(btrim(fe2.assigned_to))
  WHERE  fe2.assigned_type = 'job_site'
    AND  fe2.assigned_to IS NOT NULL
  GROUP BY fe2.id
) m
WHERE fe.id = m.equipment_id
  AND m.match_count = 1
  AND fe.assigned_site_id IS NULL;

-- Trucks. equipment_trucks.name is unique, so no ambiguity is possible.
UPDATE neta_ops.field_equipment fe
SET    assigned_truck_id = t.id
FROM   neta_ops.equipment_trucks t
WHERE  fe.assigned_type = 'truck'
  AND  fe.assigned_truck_id IS NULL
  AND  fe.assigned_to IS NOT NULL
  AND  lower(btrim(t.name)) = lower(btrim(fe.assigned_to));

-- Users. Compare as text rather than casting assigned_to to uuid: a row holding a name
-- instead of an id would otherwise abort the whole migration on a cast error.
UPDATE neta_ops.field_equipment fe
SET    assigned_user_id = u.id
FROM   auth.users u
WHERE  fe.assigned_type = 'user'
  AND  fe.assigned_user_id IS NULL
  AND  fe.assigned_to IS NOT NULL
  AND  u.id::text = btrim(fe.assigned_to);

-- ── 4. Report what did not resolve ────────────────────────────────────────────
DO $$
DECLARE
  unresolved_sites  int;
  unresolved_trucks int;
  unresolved_users  int;
  sample            text;
BEGIN
  SELECT count(*) INTO unresolved_sites
  FROM neta_ops.field_equipment
  WHERE assigned_type = 'job_site' AND assigned_to IS NOT NULL AND assigned_site_id IS NULL;

  SELECT count(*) INTO unresolved_trucks
  FROM neta_ops.field_equipment
  WHERE assigned_type = 'truck' AND assigned_to IS NOT NULL AND assigned_truck_id IS NULL;

  SELECT count(*) INTO unresolved_users
  FROM neta_ops.field_equipment
  WHERE assigned_type = 'user' AND assigned_to IS NOT NULL AND assigned_user_id IS NULL;

  IF unresolved_sites > 0 THEN
    SELECT string_agg(DISTINCT btrim(assigned_to), ', ') INTO sample
    FROM neta_ops.field_equipment
    WHERE assigned_type = 'job_site' AND assigned_to IS NOT NULL AND assigned_site_id IS NULL;
    RAISE NOTICE '% equipment rows still have an unresolved job site (ambiguous name): %', unresolved_sites, sample;
  END IF;

  IF unresolved_trucks > 0 THEN
    SELECT string_agg(DISTINCT btrim(assigned_to), ', ') INTO sample
    FROM neta_ops.field_equipment
    WHERE assigned_type = 'truck' AND assigned_to IS NOT NULL AND assigned_truck_id IS NULL;
    RAISE NOTICE '% equipment rows reference a truck that is not in equipment_trucks: %', unresolved_trucks, sample;
  END IF;

  IF unresolved_users > 0 THEN
    RAISE NOTICE '% equipment rows are assigned to a user id that no longer exists in auth.users', unresolved_users;
  END IF;

  RAISE NOTICE 'Assignment backfill complete. Unresolved rows keep their assigned_to text and still display correctly.';
END $$;

-- ── 5. Assignment history ─────────────────────────────────────────────────────
-- "Where was this meter in March" is unanswerable today: the assignment is a single
-- current value. Recording it from here on costs one table and is impossible to
-- reconstruct later. The monthly inventory check needs it too — "missing" only means
-- something next to a record of when the item was last somewhere.
CREATE TABLE IF NOT EXISTS neta_ops.field_equipment_assignments (
  id                 UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  field_equipment_id UUID        NOT NULL REFERENCES neta_ops.field_equipment(id) ON DELETE CASCADE,
  assigned_type      TEXT        NOT NULL CHECK (assigned_type IN ('user', 'job_site', 'truck')),
  assigned_site_id   UUID        REFERENCES common.sites(id)              ON DELETE SET NULL,
  assigned_truck_id  UUID        REFERENCES neta_ops.equipment_trucks(id) ON DELETE SET NULL,
  assigned_user_id   UUID        REFERENCES auth.users(id)                ON DELETE SET NULL,
  -- What the assignment read at the time. Kept so history stays truthful after a site
  -- is renamed or a truck is retired.
  assigned_label     TEXT,
  started_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at           TIMESTAMPTZ,
  changed_by         UUID        REFERENCES auth.users(id) ON DELETE SET NULL
);

COMMENT ON TABLE neta_ops.field_equipment_assignments IS
  'Where each piece of field equipment has been assigned over time. One open row '
  '(ended_at IS NULL) per item, maintained by trigger.';

CREATE INDEX IF NOT EXISTS idx_fe_assignments_equipment ON neta_ops.field_equipment_assignments (field_equipment_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_fe_assignments_site      ON neta_ops.field_equipment_assignments (assigned_site_id)  WHERE assigned_site_id  IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_fe_assignments_truck     ON neta_ops.field_equipment_assignments (assigned_truck_id) WHERE assigned_truck_id IS NOT NULL;
-- At most one open assignment per item.
CREATE UNIQUE INDEX IF NOT EXISTS idx_fe_assignments_one_open
  ON neta_ops.field_equipment_assignments (field_equipment_id) WHERE ended_at IS NULL;

-- Trigger rather than application code: check-out, check-in, the edit dialog and the
-- inline assign popover all write to field_equipment by different paths, and a history
-- that only some of them remember to append to is worse than none.
CREATE OR REPLACE FUNCTION neta_ops.log_field_equipment_assignment()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = neta_ops, common, public
AS $$
BEGIN
  IF TG_OP = 'UPDATE'
     AND NEW.assigned_type      IS NOT DISTINCT FROM OLD.assigned_type
     AND NEW.assigned_to        IS NOT DISTINCT FROM OLD.assigned_to
     AND NEW.assigned_site_id   IS NOT DISTINCT FROM OLD.assigned_site_id
     AND NEW.assigned_truck_id  IS NOT DISTINCT FROM OLD.assigned_truck_id
     AND NEW.assigned_user_id   IS NOT DISTINCT FROM OLD.assigned_user_id
  THEN
    RETURN NULL;  -- nothing about the assignment changed
  END IF;

  UPDATE neta_ops.field_equipment_assignments
     SET ended_at = now()
   WHERE field_equipment_id = NEW.id
     AND ended_at IS NULL;

  IF NEW.assigned_type IS NOT NULL THEN
    INSERT INTO neta_ops.field_equipment_assignments (
      field_equipment_id, assigned_type, assigned_site_id, assigned_truck_id,
      assigned_user_id, assigned_label, started_at, changed_by
    ) VALUES (
      NEW.id, NEW.assigned_type, NEW.assigned_site_id, NEW.assigned_truck_id,
      NEW.assigned_user_id, NEW.assigned_to, now(), auth.uid()
    );
  END IF;

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS field_equipment_assignment_history ON neta_ops.field_equipment;
CREATE TRIGGER field_equipment_assignment_history
  AFTER INSERT OR UPDATE ON neta_ops.field_equipment
  FOR EACH ROW
  EXECUTE FUNCTION neta_ops.log_field_equipment_assignment();

-- Seed one open row per currently assigned item so history starts from today rather
-- than from the next time somebody touches something. updated_at is the closest thing
-- we have to when the assignment was made.
INSERT INTO neta_ops.field_equipment_assignments (
  field_equipment_id, assigned_type, assigned_site_id, assigned_truck_id,
  assigned_user_id, assigned_label, started_at
)
SELECT fe.id, fe.assigned_type, fe.assigned_site_id, fe.assigned_truck_id,
       fe.assigned_user_id, fe.assigned_to, COALESCE(fe.updated_at, now())
FROM   neta_ops.field_equipment fe
WHERE  fe.assigned_type IS NOT NULL
  AND  NOT EXISTS (
         SELECT 1 FROM neta_ops.field_equipment_assignments a
         WHERE a.field_equipment_id = fe.id AND a.ended_at IS NULL
       );

-- ── 6. Access ─────────────────────────────────────────────────────────────────
-- Matching the existing field_equipment policies rather than the stricter
-- is_employee_user() used by asset tracking: anyone who can see the equipment list can
-- see where it has been. Writes come from the SECURITY DEFINER trigger, not the client.
ALTER TABLE neta_ops.field_equipment_assignments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can view assignment history" ON neta_ops.field_equipment_assignments;
CREATE POLICY "Authenticated users can view assignment history"
  ON neta_ops.field_equipment_assignments
  FOR SELECT
  USING (auth.uid() IS NOT NULL);

GRANT SELECT ON neta_ops.field_equipment_assignments TO authenticated;
GRANT ALL    ON neta_ops.field_equipment_assignments TO service_role;

REVOKE ALL ON FUNCTION neta_ops.log_field_equipment_assignment() FROM PUBLIC;

-- ── 7. Verification ───────────────────────────────────────────────────────────
-- SELECT assigned_type,
--        count(*) AS rows,
--        count(assigned_site_id)  AS linked_sites,
--        count(assigned_truck_id) AS linked_trucks,
--        count(assigned_user_id)  AS linked_users
-- FROM   neta_ops.field_equipment
-- WHERE  assigned_type IS NOT NULL
-- GROUP  BY assigned_type;
