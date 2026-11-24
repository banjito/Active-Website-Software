-- Daily JSA / JHA, item 2: the job's JHA and the hazard lists behind it
-- (scope: documentation/Scopes/scope-job-hazard-analysis.html).
--
-- Hazard lists (safety_work_types): one per kind of work. Editors change a draft copy;
-- the safety lead approves it. JHAs copy hazards out, so later edits never touch old JHAs.
-- Job JHAs (job_jhas): finishing locks a version for good. A change is a new version.
-- A JHA can't be finished on a hazard list the safety lead hasn't approved.
-- Hazards typed by hand become suggestions for the lists.
--
-- Our own words only. ampOS never picks PPE or works out boundaries.
-- Needs safety_01_questions.sql first. Safe to re-run. If it stops with "lock timeout", run it again.

SET lock_timeout = '5s';

BEGIN;

-- 1. Permissions ----------------------------------------------------------------------------

INSERT INTO common.permissions (key, area, label, description, sort_order) VALUES
  ('safety.edit_jha', 'Safety', 'Write job JHAs',
   'Start, edit and finish the JHA (the written safety plan) on a job.', 990),
  ('safety.manage_hazards', 'Safety', 'Edit hazard lists',
   'Edit the starter hazards for each kind of work, and sort through suggestions from the field.', 1005)
ON CONFLICT (key) DO NOTHING;

UPDATE common.permissions
   SET description = 'The safety lead: approve the Daily JSA questions and the hazard lists, and put them in use for every crew.'
 WHERE key = 'safety.approve_questions';

INSERT INTO common.role_permissions (role_key, permission_key) VALUES
  ('admin',           'safety.edit_jha'),
  ('project_manager', 'safety.edit_jha'),
  ('lead_tech',       'safety.edit_jha'),
  ('admin',           'safety.manage_hazards')
ON CONFLICT DO NOTHING;

-- 2. Tables ---------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS neta_ops.safety_work_types (
  key              text PRIMARY KEY CHECK (key ~ '^[a-z0-9_]{2,60}$'),
  name             text NOT NULL CHECK (btrim(name) <> ''),
  -- [{key, hazard, controls}]. Approved copy; null until the first approval.
  hazards          jsonb CHECK (hazards IS NULL OR jsonb_typeof(hazards) = 'array'),
  -- Edits waiting for approval; null when there are none.
  draft_hazards    jsonb CHECK (draft_hazards IS NULL OR jsonb_typeof(draft_hazards) = 'array'),
  sort_order       integer NOT NULL DEFAULT 1000,
  approved_by      uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_by_name text,
  approved_at      timestamptz,
  archived_at      timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS neta_ops.job_jhas (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id             uuid NOT NULL REFERENCES neta_ops.jobs(id) ON DELETE CASCADE,
  version            integer NOT NULL CHECK (version > 0),
  status             text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'final')),
  work_summary       text NOT NULL DEFAULT '',
  -- [{key, name, approved_at}] as they were when picked. approved_at null = list wasn't approved yet.
  work_types         jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(work_types) = 'array'),
  -- [{key, hazard, controls, from}]. from = work type key, or null when typed by hand.
  hazards            jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(hazards) = 'array'),
  energized_expected boolean,
  energized_notes    text NOT NULL DEFAULT '',
  -- {address, ems_meet, hospital, aed, caller, rescue, notes}
  emergency_plan     jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(emergency_plan) = 'object'),
  prepared_by        uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  prepared_by_name   text,
  finalized_by       uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  finalized_by_name  text,
  finalized_at       timestamptz,
  sent_to_customer_at timestamptz,
  -- The screen's id for its last save, so a retried save isn't mistaken for someone else's.
  last_save_id       uuid,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  UNIQUE (job_id, version)
);
CREATE UNIQUE INDEX IF NOT EXISTS job_jhas_one_draft ON neta_ops.job_jhas (job_id) WHERE status = 'draft';

COMMENT ON TABLE neta_ops.job_jhas IS
  'The job''s JHA (written safety plan), one row per version. Final versions are frozen; the highest final is current.';

CREATE TABLE IF NOT EXISTS neta_ops.safety_hazard_suggestions (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hazard_key        text NOT NULL UNIQUE,
  hazard            text NOT NULL,
  controls          text NOT NULL,
  job_id            uuid NOT NULL REFERENCES neta_ops.jobs(id) ON DELETE CASCADE,
  work_types        jsonb NOT NULL DEFAULT '[]'::jsonb,   -- what that JHA covered
  suggested_by_name text,
  status            text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'added', 'dismissed')),
  resolved_by_name  text,
  resolved_at       timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now()
);

-- The site's emergency plan, so it only gets typed once. Jobs without a site keep it on the JHA.
ALTER TABLE common.sites
  ADD COLUMN IF NOT EXISTS emergency_plan jsonb,
  ADD COLUMN IF NOT EXISTS emergency_plan_updated_at timestamptz,
  ADD COLUMN IF NOT EXISTS emergency_plan_updated_by_name text;

-- Not report data: no backup_reports snapshots.
DROP TRIGGER IF EXISTS trg_snapshot_safety_work_types_ins ON neta_ops.safety_work_types;
DROP TRIGGER IF EXISTS trg_snapshot_safety_work_types_upd ON neta_ops.safety_work_types;
DROP TRIGGER IF EXISTS trg_snapshot_job_jhas_ins ON neta_ops.job_jhas;
DROP TRIGGER IF EXISTS trg_snapshot_job_jhas_upd ON neta_ops.job_jhas;
DROP TRIGGER IF EXISTS trg_snapshot_safety_hazard_suggestions_ins ON neta_ops.safety_hazard_suggestions;
DROP TRIGGER IF EXISTS trg_snapshot_safety_hazard_suggestions_upd ON neta_ops.safety_hazard_suggestions;

-- 3. Guards ---------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION neta_ops.safety_touch_updated_at() RETURNS trigger
LANGUAGE plpgsql SET search_path TO '' AS $$
BEGIN
  NEW.updated_at := clock_timestamp();
  RETURN NEW;
END $$;

CREATE OR REPLACE TRIGGER safety_work_types_touch
  BEFORE UPDATE ON neta_ops.safety_work_types
  FOR EACH ROW EXECUTE FUNCTION neta_ops.safety_touch_updated_at();

-- A finished JHA only ever changes in one way: being marked as sent to the customer.
CREATE OR REPLACE FUNCTION neta_ops.job_jhas_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path TO '' AS $$
BEGIN
  IF OLD.status = 'final' AND (
       NEW.status IS DISTINCT FROM OLD.status
    OR NEW.job_id IS DISTINCT FROM OLD.job_id
    OR NEW.version IS DISTINCT FROM OLD.version
    OR NEW.work_summary IS DISTINCT FROM OLD.work_summary
    OR NEW.work_types IS DISTINCT FROM OLD.work_types
    OR NEW.hazards IS DISTINCT FROM OLD.hazards
    OR NEW.energized_expected IS DISTINCT FROM OLD.energized_expected
    OR NEW.energized_notes IS DISTINCT FROM OLD.energized_notes
    OR NEW.emergency_plan IS DISTINCT FROM OLD.emergency_plan
    OR NEW.finalized_at IS DISTINCT FROM OLD.finalized_at
    OR NEW.finalized_by_name IS DISTINCT FROM OLD.finalized_by_name
  ) THEN
    RAISE EXCEPTION 'A finished JHA can''t be changed. Start a new version.';
  END IF;
  NEW.updated_at := clock_timestamp();
  RETURN NEW;
END $$;

CREATE OR REPLACE TRIGGER job_jhas_guard
  BEFORE UPDATE ON neta_ops.job_jhas
  FOR EACH ROW EXECUTE FUNCTION neta_ops.job_jhas_guard();

-- Fix to safety_01: deleting the account of someone who approved questions was blocked.
CREATE OR REPLACE FUNCTION neta_ops.safety_question_sets_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path TO '' AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status <> 'draft' THEN
      RAISE EXCEPTION 'Approved safety questions can''t be deleted. Tailgates point at them.';
    END IF;
    RETURN OLD;
  END IF;

  IF OLD.status <> 'draft' AND (
       NEW.steps IS DISTINCT FROM OLD.steps
    OR NEW.edition IS DISTINCT FROM OLD.edition
    OR NEW.version IS DISTINCT FROM OLD.version
    OR NEW.notes IS DISTINCT FROM OLD.notes
    -- Going to null is fine: that's the approver's account being deleted (their name stays)
    OR (NEW.approved_by IS DISTINCT FROM OLD.approved_by AND NEW.approved_by IS NOT NULL)
    OR NEW.approved_at IS DISTINCT FROM OLD.approved_at
    OR NOT (NEW.status = OLD.status OR (OLD.status = 'in_use' AND NEW.status = 'retired'))
  ) THEN
    RAISE EXCEPTION 'Approved safety questions can''t be changed. Start a new version.';
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END $$;
REVOKE INSERT ON neta_ops.safety_question_sets FROM authenticated;

-- 4. Who can do what ------------------------------------------------------------------------
-- Staff read everything. Edits go to drafts only, and only to the columns granted below;
-- approving, finishing and starting versions go through the functions.

ALTER TABLE neta_ops.safety_work_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE neta_ops.job_jhas ENABLE ROW LEVEL SECURITY;
ALTER TABLE neta_ops.safety_hazard_suggestions ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON neta_ops.safety_work_types, neta_ops.job_jhas, neta_ops.safety_hazard_suggestions FROM anon, authenticated;
GRANT ALL ON neta_ops.safety_work_types, neta_ops.job_jhas, neta_ops.safety_hazard_suggestions TO service_role;

GRANT SELECT ON neta_ops.safety_work_types, neta_ops.job_jhas, neta_ops.safety_hazard_suggestions TO authenticated;
GRANT INSERT (key, name, draft_hazards, sort_order) ON neta_ops.safety_work_types TO authenticated;
GRANT UPDATE (name, draft_hazards, sort_order, archived_at) ON neta_ops.safety_work_types TO authenticated;
GRANT UPDATE (work_summary, work_types, hazards, energized_expected, energized_notes, emergency_plan, last_save_id)
  ON neta_ops.job_jhas TO authenticated;
GRANT DELETE ON neta_ops.job_jhas TO authenticated;

DROP POLICY IF EXISTS work_types_read ON neta_ops.safety_work_types;
CREATE POLICY work_types_read ON neta_ops.safety_work_types FOR SELECT TO authenticated
  USING ((SELECT common.is_employee_user()));
DROP POLICY IF EXISTS work_types_add ON neta_ops.safety_work_types;
CREATE POLICY work_types_add ON neta_ops.safety_work_types FOR INSERT TO authenticated
  WITH CHECK ((SELECT common.can('safety.manage_hazards')));
DROP POLICY IF EXISTS work_types_edit ON neta_ops.safety_work_types;
CREATE POLICY work_types_edit ON neta_ops.safety_work_types FOR UPDATE TO authenticated
  USING ((SELECT common.can('safety.manage_hazards')))
  WITH CHECK ((SELECT common.can('safety.manage_hazards')));

DROP POLICY IF EXISTS job_jhas_read ON neta_ops.job_jhas;
CREATE POLICY job_jhas_read ON neta_ops.job_jhas FOR SELECT TO authenticated
  USING ((SELECT common.is_employee_user()));
DROP POLICY IF EXISTS job_jhas_edit_draft ON neta_ops.job_jhas;
CREATE POLICY job_jhas_edit_draft ON neta_ops.job_jhas FOR UPDATE TO authenticated
  USING (status = 'draft' AND (SELECT common.can('safety.edit_jha')))
  WITH CHECK (status = 'draft' AND (SELECT common.can('safety.edit_jha')));
DROP POLICY IF EXISTS job_jhas_delete_draft ON neta_ops.job_jhas;
CREATE POLICY job_jhas_delete_draft ON neta_ops.job_jhas FOR DELETE TO authenticated
  USING (status = 'draft' AND (SELECT common.can('safety.edit_jha')));

DROP POLICY IF EXISTS hazard_suggestions_read ON neta_ops.safety_hazard_suggestions;
CREATE POLICY hazard_suggestions_read ON neta_ops.safety_hazard_suggestions FOR SELECT TO authenticated
  USING ((SELECT common.can('safety.manage_hazards')) OR (SELECT common.can('safety.approve_questions')));

-- 5. Functions ------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION neta_ops.safety_my_name() RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO '' AS $$
  SELECT coalesce(nullif(p.full_name, ''), nullif(u.raw_user_meta_data->>'name', ''),
                  split_part(u.email::text, '@', 1))
    FROM auth.users u LEFT JOIN common.profiles p ON p.id = u.id
   WHERE u.id = auth.uid()
$$;

-- Start the job's JHA, or its next version (a copy of the last finished one).
-- Hands back the draft if one is already open.
CREATE OR REPLACE FUNCTION neta_ops.start_job_jha(p_job_id uuid) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $$
DECLARE
  v_id   uuid;
  v_last neta_ops.job_jhas;
  v_plan jsonb;
  v_addr text;
BEGIN
  IF NOT common.can('safety.edit_jha') THEN
    RAISE EXCEPTION 'You don''t have permission to write JHAs.';
  END IF;

  -- Two people pressing Start at once get the same draft
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('job_jha:' || p_job_id::text, 0));

  SELECT id INTO v_id FROM neta_ops.job_jhas WHERE job_id = p_job_id AND status = 'draft';
  IF v_id IS NOT NULL THEN
    RETURN v_id;
  END IF;

  SELECT s.emergency_plan, nullif(btrim(j.site_address), '')
    INTO v_plan, v_addr
    FROM neta_ops.jobs j LEFT JOIN common.sites s ON s.id = j.site_id
   WHERE j.id = p_job_id AND j.deleted_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'That job doesn''t exist.';
  END IF;

  SELECT * INTO v_last FROM neta_ops.job_jhas
   WHERE job_id = p_job_id AND status = 'final' ORDER BY version DESC LIMIT 1;

  IF v_last.id IS NOT NULL THEN
    INSERT INTO neta_ops.job_jhas (job_id, version, work_summary, work_types, hazards, energized_expected,
                                   energized_notes, emergency_plan, prepared_by, prepared_by_name)
    VALUES (p_job_id, v_last.version + 1, v_last.work_summary, v_last.work_types, v_last.hazards,
            v_last.energized_expected, v_last.energized_notes, v_last.emergency_plan,
            auth.uid(), neta_ops.safety_my_name())
    RETURNING id INTO v_id;
  ELSE
    INSERT INTO neta_ops.job_jhas (job_id, version, emergency_plan, prepared_by, prepared_by_name)
    VALUES (p_job_id, 1,
            jsonb_strip_nulls(jsonb_build_object('address', v_addr)) || coalesce(v_plan, '{}'::jsonb),
            auth.uid(), neta_ops.safety_my_name())
    RETURNING id INTO v_id;
  END IF;

  RETURN v_id;
END $$;

-- Finish: check it's complete, lock it, save the emergency plan on the site,
-- and turn hand-typed hazards into suggestions.
CREATE OR REPLACE FUNCTION neta_ops.finish_job_jha(p_id uuid, p_updated_at timestamptz) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $$
DECLARE
  v_row  neta_ops.job_jhas;
  v_name text := neta_ops.safety_my_name();
  v_bad  text;
BEGIN
  IF NOT common.can('safety.edit_jha') THEN
    RAISE EXCEPTION 'You don''t have permission to finish JHAs.';
  END IF;

  SELECT * INTO v_row FROM neta_ops.job_jhas WHERE id = p_id FOR UPDATE;
  IF v_row.id IS NULL OR v_row.status <> 'draft' THEN
    RAISE EXCEPTION 'This JHA is already finished or was deleted.';
  END IF;
  IF v_row.updated_at IS DISTINCT FROM p_updated_at THEN
    RAISE EXCEPTION 'Someone else changed this JHA. Reload, check it, then finish.';
  END IF;

  IF btrim(v_row.work_summary) = '' THEN
    RAISE EXCEPTION 'Describe the work first.';
  END IF;
  IF jsonb_array_length(v_row.hazards) = 0 THEN
    RAISE EXCEPTION 'Add at least one hazard.';
  END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(v_row.hazards) h
              WHERE btrim(coalesce(h->>'hazard', '')) = '' OR btrim(coalesce(h->>'controls', '')) = '') THEN
    RAISE EXCEPTION 'Every hazard needs a name and how it''s controlled.';
  END IF;
  IF v_row.energized_expected IS NULL THEN
    RAISE EXCEPTION 'Say whether energized work is expected.';
  END IF;
  IF v_row.energized_expected AND btrim(v_row.energized_notes) = '' THEN
    RAISE EXCEPTION 'Say what will be energized and why.';
  END IF;
  IF EXISTS (SELECT 1 FROM unnest(ARRAY['address', 'ems_meet', 'hospital', 'aed']) k
              WHERE btrim(coalesce(v_row.emergency_plan->>k, '')) = '') THEN
    RAISE EXCEPTION 'Finish the emergency plan.';
  END IF;

  -- Every hazard list on this JHA was approved when its hazards were copied in
  SELECT string_agg(DISTINCT coalesce(t.x->>'name', k.key), ', ') INTO v_bad
    FROM (
      SELECT x->>'key' AS key FROM jsonb_array_elements(v_row.work_types) x
      UNION
      SELECT h->>'from' FROM jsonb_array_elements(v_row.hazards) h WHERE h->>'from' IS NOT NULL
    ) k
    LEFT JOIN LATERAL (
      SELECT x FROM jsonb_array_elements(v_row.work_types) x WHERE x->>'key' = k.key LIMIT 1
    ) t ON true
    LEFT JOIN neta_ops.safety_work_types w ON w.key = k.key
   WHERE w.approved_at IS NULL OR t.x IS NULL OR t.x->>'approved_at' IS NULL;
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'The safety lead hasn''t approved these hazard lists: %', v_bad;
  END IF;

  UPDATE neta_ops.job_jhas
     SET status = 'final', finalized_by = auth.uid(), finalized_by_name = v_name, finalized_at = now()
   WHERE id = p_id;

  -- Who calls and who rescues change by crew, so they stay off the site's copy
  UPDATE common.sites s
     SET emergency_plan = v_row.emergency_plan - 'caller' - 'rescue',
         emergency_plan_updated_at = now(),
         emergency_plan_updated_by_name = v_name
    FROM neta_ops.jobs j
   WHERE j.id = v_row.job_id AND s.id = j.site_id;

  INSERT INTO neta_ops.safety_hazard_suggestions (hazard_key, hazard, controls, job_id, work_types, suggested_by_name)
  SELECT h->>'key', btrim(h->>'hazard'), btrim(h->>'controls'), v_row.job_id, v_row.work_types, v_name
    FROM jsonb_array_elements(v_row.hazards) h
   WHERE h->>'from' IS NULL AND h->>'key' IS NOT NULL
  ON CONFLICT (hazard_key) DO NOTHING;
END $$;

-- The safety lead approves a hazard list. Refuses if it changed since they opened it.
CREATE OR REPLACE FUNCTION neta_ops.approve_safety_work_type(p_key text, p_updated_at timestamptz) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $$
DECLARE
  v_row neta_ops.safety_work_types;
BEGIN
  IF NOT common.can('safety.approve_questions') THEN
    RAISE EXCEPTION 'Only the safety lead can approve hazard lists.';
  END IF;
  SELECT * INTO v_row FROM neta_ops.safety_work_types WHERE key = p_key FOR UPDATE;
  IF v_row.key IS NULL OR v_row.draft_hazards IS NULL THEN
    RAISE EXCEPTION 'There''s nothing waiting for approval.';
  END IF;
  IF v_row.updated_at IS DISTINCT FROM p_updated_at THEN
    RAISE EXCEPTION 'This list changed since you opened it. Reload and check it again.';
  END IF;
  IF jsonb_array_length(v_row.draft_hazards) = 0
     OR EXISTS (SELECT 1 FROM jsonb_array_elements(v_row.draft_hazards) h
                 WHERE btrim(coalesce(h->>'hazard', '')) = '' OR btrim(coalesce(h->>'controls', '')) = '') THEN
    RAISE EXCEPTION 'Every hazard needs a name and how it''s controlled.';
  END IF;

  UPDATE neta_ops.safety_work_types
     SET hazards = draft_hazards, draft_hazards = NULL,
         approved_by = auth.uid(), approved_by_name = neta_ops.safety_my_name(), approved_at = now()
   WHERE key = p_key;
END $$;

-- Sort a suggestion: add it to a list's draft, or dismiss it (p_work_type null).
CREATE OR REPLACE FUNCTION neta_ops.resolve_hazard_suggestion(p_id uuid, p_work_type text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $$
DECLARE
  v_row neta_ops.safety_hazard_suggestions;
BEGIN
  IF NOT common.can('safety.manage_hazards') THEN
    RAISE EXCEPTION 'You don''t have permission to edit hazard lists.';
  END IF;
  SELECT * INTO v_row FROM neta_ops.safety_hazard_suggestions WHERE id = p_id FOR UPDATE;
  IF v_row.id IS NULL OR v_row.status <> 'open' THEN
    RAISE EXCEPTION 'Someone already sorted this suggestion.';
  END IF;

  IF p_work_type IS NOT NULL THEN
    UPDATE neta_ops.safety_work_types
       SET draft_hazards = coalesce(draft_hazards, hazards, '[]'::jsonb)
                           || jsonb_build_array(jsonb_build_object(
                                'key', v_row.hazard_key, 'hazard', v_row.hazard, 'controls', v_row.controls))
     WHERE key = p_work_type;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'That hazard list doesn''t exist.';
    END IF;
  END IF;

  UPDATE neta_ops.safety_hazard_suggestions
     SET status = CASE WHEN p_work_type IS NULL THEN 'dismissed' ELSE 'added' END,
         resolved_by_name = neta_ops.safety_my_name(), resolved_at = now()
   WHERE id = p_id;
END $$;

REVOKE ALL ON FUNCTION neta_ops.safety_my_name() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION neta_ops.start_job_jha(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION neta_ops.finish_job_jha(uuid, timestamptz) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION neta_ops.approve_safety_work_type(text, timestamptz) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION neta_ops.resolve_hazard_suggestion(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION neta_ops.start_job_jha(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION neta_ops.finish_job_jha(uuid, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION neta_ops.approve_safety_work_type(text, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION neta_ops.resolve_hazard_suggestion(uuid, text) TO authenticated;

-- 6. Starter lists, all waiting for approval (copy lives in database/bootstrap/05_default_data.sql) --

INSERT INTO neta_ops.safety_work_types (key, name, sort_order, draft_hazards)
VALUES
  ('switchgear_acceptance', 'Switchgear acceptance', 10, $json$[
    {"key": "backfeed", "hazard": "Gear energized, or backfed from a second source", "controls": "Check the one-line for every source. Lock and tag each one. Test dead before touching."},
    {"key": "our_test_voltage", "hazard": "Test voltage from our own gear", "controls": "Barricade the test area, far ends included. One person watches. Discharge and ground after each test."},
    {"key": "stored_energy", "hazard": "Charged springs and moving mechanisms", "controls": "Discharge springs and remove control power before reaching in. Keep hands clear."},
    {"key": "racking", "hazard": "Racking and lifting breakers", "controls": "Use the lift cart and two people. Keep the door closed while racking where the gear allows."},
    {"key": "control_circuits", "hazard": "Live control power, and CT or VT circuits", "controls": "Treat as live until tested. Short CT secondaries before opening them. Open VT secondaries."},
    {"key": "covers", "hazard": "Heavy covers, sharp edges and pinch points", "controls": "Two people on large covers. Wear cut-resistant gloves. Set covers where nobody trips on them."},
    {"key": "other_trades", "hazard": "Other trades in the area", "controls": "Barricade and post signs. Agree with the site lead who may enter and when."}
  ]$json$::jsonb),
  ('breaker_testing', 'Breaker testing', 20, $json$[
    {"key": "backfeed", "hazard": "Line or load side still energized", "controls": "Check the one-line for every source. Lock and tag. Test dead on both sides before touching."},
    {"key": "unexpected_operation", "hazard": "Breaker trips or closes by itself", "controls": "Remove control power and discharge springs before reaching in. Call out before each operation."},
    {"key": "high_current", "hazard": "High current and hot leads from primary injection", "controls": "Size and tighten leads for the current. Hands off during injection. Let leads cool."},
    {"key": "our_test_voltage", "hazard": "Insulation and withstand test voltage", "controls": "Barricade the test area. One person watches. Discharge and ground after each test."},
    {"key": "vacuum_xray", "hazard": "X-rays from vacuum bottles during a high voltage withstand test", "controls": "Stay at or below the maker's test voltage. Keep panels on and people at the maker's distance."},
    {"key": "racking", "hazard": "Racking and lifting", "controls": "Use the lift cart and two people. Check the path and the floor first."}
  ]$json$::jsonb),
  ('transformer_testing', 'Transformer testing', 30, $json$[
    {"key": "backfeed", "hazard": "Energized or backfed windings", "controls": "Lock and tag both the high and low sides. Test dead and ground before connecting."},
    {"key": "induced_voltage", "hazard": "High voltage on windings we aren't testing", "controls": "Treat every winding as live during ratio tests. Clear everyone from all the bushings. Connect the way the test set's manual shows."},
    {"key": "stored_winding", "hazard": "Energy stored in the winding after a resistance test", "controls": "Wait for the test set to show it's discharged before lifting a lead."},
    {"key": "stored_charge", "hazard": "Charge left after insulation tests", "controls": "Discharge and ground. Wait the full time before touching."},
    {"key": "heights", "hazard": "Working on top of the tank", "controls": "Use fall protection or a lift. Keep three points of contact on ladders."},
    {"key": "oil", "hazard": "Oil on skin and floors, hot oil, and fire", "controls": "Wear oil-resistant gloves and eye protection. Keep absorbent close. No ignition sources near oil."},
    {"key": "tank_entry", "hazard": "Nitrogen or low oxygen in the tank", "controls": "Never put your head or body inside without a confined space plan and an air check."}
  ]$json$::jsonb),
  ('mv_cable_vlf', 'MV cable VLF testing', 40, $json$[
    {"key": "far_end", "hazard": "Test voltage at the far end", "controls": "Barricade both ends and post a person at the far end. Radio check first."},
    {"key": "stored_charge", "hazard": "Charge left in the cable after the test", "controls": "Discharge and ground. Wait the full time before touching."},
    {"key": "induced_voltage", "hazard": "Voltage induced from nearby cables", "controls": "Ground before touching. Keep grounds on when not testing."},
    {"key": "wrong_cable", "hazard": "Working on the wrong cable", "controls": "Prove which cable it is at both ends. Test dead at the work spot."},
    {"key": "backfeed", "hazard": "Cable energized from the other end", "controls": "Lock and tag both ends. Test dead and ground at both ends."},
    {"key": "vaults", "hazard": "Manholes and vaults", "controls": "Check the air. Follow the site's confined space plan. Keep an attendant up top."}
  ]$json$::jsonb),
  ('relay_testing', 'Relay testing', 50, $json$[
    {"key": "unexpected_trip", "hazard": "Tripping or closing in-service equipment", "controls": "Isolate trip and close outputs first. Two people check the isolation. Tell the control room."},
    {"key": "vt_backfeed", "hazard": "Injected voltage stepping up through a VT to the high side", "controls": "Open the VT secondary test switch or pull its fuses before injecting voltage."},
    {"key": "open_ct", "hazard": "High voltage from an open CT secondary", "controls": "Short the CT at the test switch before opening the circuit. Check the short."},
    {"key": "control_power", "hazard": "Live control and trip circuits", "controls": "Treat as live. Use insulated tools. Know where to open control power."},
    {"key": "nearby_live", "hazard": "Live gear in the next cubicle", "controls": "Read the labels. Mark or barricade the panels we aren't working in."},
    {"key": "restore", "hazard": "Leaving it isolated or wired wrong", "controls": "Log every switch, wire and fuse moved. A second person checks they're back."}
  ]$json$::jsonb),
  ('infrared', 'Infrared', 60, $json$[
    {"key": "live_covers", "hazard": "Open covers on live gear", "controls": "Use IR windows where they exist. Otherwise read the label first. Covers come off only under the site's energized work rules."},
    {"key": "arc_flash", "hazard": "Arc flash while moving covers", "controls": "Only a qualified person dressed for the label moves covers. Everyone else stays outside the arc flash boundary."},
    {"key": "dropped_parts", "hazard": "Screws, tools or covers falling into live gear", "controls": "Empty pockets and take off jewelry. Two people on large covers. Account for every screw."},
    {"key": "camera_focus", "hazard": "Tripping or leaning in while looking at the camera", "controls": "Stop walking before looking at the screen. A second person watches your distance."},
    {"key": "alone", "hazard": "Working alone near live gear", "controls": "Bring a second person who knows the emergency plan."}
  ]$json$::jsonb)
ON CONFLICT (key) DO NOTHING;

COMMIT;

RESET lock_timeout;
