-- Daily JSA / JHA, item 1: the tailgate questions (scope: documentation/Scopes/scope-job-hazard-analysis.html).
--
-- One row per version. A version starts as a draft, gets approved by the safety lead,
-- and then is frozen forever. Changing anything means a new version.
-- Only one version is "in_use" at a time. Until one is approved, no Daily JSA can start.
--
-- Our own words only. Never paste NFPA 70E text or tables (copyright). Section numbers only.
-- Version 1's section numbers came from OSHA and training sites, not the book:
-- the safety lead checks every one before approving.
--
-- Safe to re-run.

-- 1. Permissions ----------------------------------------------------------------------------

INSERT INTO common.permissions (key, area, label, description, sort_order) VALUES
  ('safety.manage_questions', 'Safety', 'Edit safety questions',
   'Draft new versions of the Daily JSA questions. Drafts stay locked until approved.', 1000),
  ('safety.approve_questions', 'Safety', 'Approve safety questions',
   'The safety lead: approve a version of the Daily JSA questions and put it in use for every crew.', 1010)
ON CONFLICT (key) DO NOTHING;

-- Admins can draft. Nobody is ticked to approve until Jack names the safety lead
-- (Super Admins pass every check).
INSERT INTO common.role_permissions (role_key, permission_key)
VALUES ('admin', 'safety.manage_questions')
ON CONFLICT DO NOTHING;

-- 2. The table ------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS neta_ops.safety_question_sets (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version          integer NOT NULL UNIQUE CHECK (version > 0),
  edition          text NOT NULL,                       -- NFPA 70E edition, e.g. '2027'
  status           text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'in_use', 'retired')),
  -- [{key, title, prompt, help, refs: [section], checks: [{key, text, when: always|off|on}]}]
  steps            jsonb NOT NULL CHECK (jsonb_typeof(steps) = 'array'),
  notes            text,                                -- what changed in this version
  created_by       uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_by_name  text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  approved_by      uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_by_name text,                                -- kept even if the account goes away
  approved_at      timestamptz,
  retired_at       timestamptz
);

COMMENT ON TABLE neta_ops.safety_question_sets IS
  'Daily JSA questions, one row per version. Approved versions are frozen; one in_use at a time.';

CREATE UNIQUE INDEX IF NOT EXISTS safety_question_sets_one_in_use
  ON neta_ops.safety_question_sets ((true)) WHERE status = 'in_use';
CREATE UNIQUE INDEX IF NOT EXISTS safety_question_sets_one_draft
  ON neta_ops.safety_question_sets ((true)) WHERE status = 'draft';

-- Not report data: no backup_reports snapshots.
DROP TRIGGER IF EXISTS trg_snapshot_safety_question_sets_ins ON neta_ops.safety_question_sets;
DROP TRIGGER IF EXISTS trg_snapshot_safety_question_sets_upd ON neta_ops.safety_question_sets;

-- 3. Approved versions never change -----------------------------------------------------

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
    OR NEW.approved_by IS DISTINCT FROM OLD.approved_by
    OR NEW.approved_at IS DISTINCT FROM OLD.approved_at
    OR NOT (NEW.status = OLD.status OR (OLD.status = 'in_use' AND NEW.status = 'retired'))
  ) THEN
    RAISE EXCEPTION 'Approved safety questions can''t be changed. Start a new version.';
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS safety_question_sets_guard ON neta_ops.safety_question_sets;
CREATE TRIGGER safety_question_sets_guard
  BEFORE UPDATE OR DELETE ON neta_ops.safety_question_sets
  FOR EACH ROW EXECUTE FUNCTION neta_ops.safety_question_sets_guard();

-- 4. Who can do what --------------------------------------------------------------------
-- Staff read every version (crews need the one in use; old tailgates need old ones).
-- Editors change drafts only, and can't approve through a plain update.

ALTER TABLE neta_ops.safety_question_sets ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE neta_ops.safety_question_sets FROM anon;
GRANT SELECT, UPDATE, DELETE ON TABLE neta_ops.safety_question_sets TO authenticated;
GRANT ALL ON TABLE neta_ops.safety_question_sets TO service_role;

DROP POLICY IF EXISTS safety_questions_read ON neta_ops.safety_question_sets;
CREATE POLICY safety_questions_read ON neta_ops.safety_question_sets FOR SELECT TO authenticated
  USING ((SELECT common.is_employee_user()));

DROP POLICY IF EXISTS safety_questions_edit_draft ON neta_ops.safety_question_sets;
CREATE POLICY safety_questions_edit_draft ON neta_ops.safety_question_sets FOR UPDATE TO authenticated
  USING (status = 'draft' AND (SELECT common.can('safety.manage_questions')))
  WITH CHECK (status = 'draft' AND approved_by IS NULL AND approved_at IS NULL
              AND (SELECT common.can('safety.manage_questions')));

DROP POLICY IF EXISTS safety_questions_delete_draft ON neta_ops.safety_question_sets;
CREATE POLICY safety_questions_delete_draft ON neta_ops.safety_question_sets FOR DELETE TO authenticated
  USING (status = 'draft' AND (SELECT common.can('safety.manage_questions')));

-- 5. Start a new draft (copies another version) -----------------------------------------
-- Only one draft at a time: if one exists, hand it back instead.

CREATE OR REPLACE FUNCTION neta_ops.start_safety_question_draft(p_from uuid)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $$
DECLARE
  v_id   uuid;
  v_src  neta_ops.safety_question_sets;
  v_name text;
BEGIN
  IF NOT common.can('safety.manage_questions') THEN
    RAISE EXCEPTION 'You don''t have permission to edit safety questions.';
  END IF;

  SELECT id INTO v_id FROM neta_ops.safety_question_sets WHERE status = 'draft';
  IF v_id IS NOT NULL THEN
    RETURN v_id;
  END IF;

  SELECT * INTO v_src FROM neta_ops.safety_question_sets WHERE id = p_from;
  IF v_src.id IS NULL THEN
    RAISE EXCEPTION 'That version doesn''t exist.';
  END IF;

  SELECT coalesce(nullif(p.full_name, ''), nullif(u.raw_user_meta_data->>'name', ''),
                  split_part(u.email::text, '@', 1))
    INTO v_name
    FROM auth.users u LEFT JOIN common.profiles p ON p.id = u.id
   WHERE u.id = auth.uid();

  INSERT INTO neta_ops.safety_question_sets (version, edition, status, steps, notes, created_by, created_by_name)
  SELECT coalesce(max(version), 0) + 1, v_src.edition, 'draft', v_src.steps, NULL, auth.uid(), v_name
    FROM neta_ops.safety_question_sets
  RETURNING id INTO v_id;

  RETURN v_id;
END $$;

-- 6. Approve: the safety lead puts a draft in use ---------------------------------------

CREATE OR REPLACE FUNCTION neta_ops.approve_safety_question_set(p_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $$
DECLARE
  v_row     neta_ops.safety_question_sets;
  v_missing text;
  v_name    text;
BEGIN
  IF NOT common.can('safety.approve_questions') THEN
    RAISE EXCEPTION 'Only the safety lead can approve safety questions.';
  END IF;

  SELECT * INTO v_row FROM neta_ops.safety_question_sets WHERE id = p_id FOR UPDATE;
  IF v_row.id IS NULL OR v_row.status <> 'draft' THEN
    RAISE EXCEPTION 'Only a draft can be approved.';
  END IF;

  -- The Daily JSA screen is built around these eight steps.
  SELECT string_agg(k, ', ') INTO v_missing
    FROM unnest(ARRAY['crew','work','hazards','power','shock_arc','ppe','emergency','sign']) k
   WHERE NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v_row.steps) s WHERE s->>'key' = k);
  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION 'This version is missing steps: %', v_missing;
  END IF;

  SELECT coalesce(nullif(p.full_name, ''), nullif(u.raw_user_meta_data->>'name', ''),
                  split_part(u.email::text, '@', 1))
    INTO v_name
    FROM auth.users u LEFT JOIN common.profiles p ON p.id = u.id
   WHERE u.id = auth.uid();

  UPDATE neta_ops.safety_question_sets
     SET status = 'retired', retired_at = now()
   WHERE status = 'in_use';

  UPDATE neta_ops.safety_question_sets
     SET status = 'in_use', approved_by = auth.uid(), approved_by_name = v_name, approved_at = now()
   WHERE id = p_id;
END $$;

REVOKE ALL ON FUNCTION neta_ops.start_safety_question_draft(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION neta_ops.approve_safety_question_set(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION neta_ops.start_safety_question_draft(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION neta_ops.approve_safety_question_set(uuid) TO authenticated;

-- 7. Version 1, a draft (copy of this block lives in database/bootstrap/05_default_data.sql) --

INSERT INTO neta_ops.safety_question_sets (version, edition, status, steps, notes, created_by_name)
VALUES (1, '2027', 'draft', $json$[
  {"key": "crew", "title": "Who's here",
   "prompt": "Name the person in charge today. Everyone working today joins the list.",
   "help": "The person in charge leads this briefing. Anyone not qualified for a task works under someone who is.",
   "refs": ["110.3(I)(1)"],
   "checks": [
     {"key": "in_charge", "text": "The person in charge is named.", "when": "always"},
     {"key": "everyone", "text": "Everyone working today is on the list, temps and subs included.", "when": "always"},
     {"key": "unqualified", "text": "Anyone not qualified for a task knows who is watching them.", "when": "always"}
   ]},
  {"key": "work", "title": "Today's work",
   "prompt": "Say what we're doing today, where, and on which gear. Say what changed from the plan.",
   "help": "Starts from the job's JHA and yesterday's JSA.",
   "refs": ["110.3(I)(1)"],
   "checks": [
     {"key": "tasks", "text": "Today's tasks and equipment are named.", "when": "always"},
     {"key": "changes", "text": "Changes from the JHA or yesterday are said out loud.", "when": "always"},
     {"key": "site_rules", "text": "Today's customer contact and site rules are known.", "when": "always"}
   ]},
  {"key": "hazards", "title": "Hazards",
   "prompt": "Go over each hazard in today's work and how we control it.",
   "help": "Starts from the work type and yesterday. Add anything new on site.",
   "refs": ["110.3(I)(1)"],
   "checks": [
     {"key": "controls", "text": "Each hazard has a control the crew agrees on.", "when": "always"},
     {"key": "our_gear", "text": "Hazards from our own test gear are covered: test voltage at the far end, stored charge.", "when": "always"},
     {"key": "others", "text": "Other trades and traffic near our work are covered.", "when": "always"}
   ]},
  {"key": "power", "title": "Power off or on",
   "prompt": "Can this be done with the power off? If yes, we make it safe before anyone touches it.",
   "help": "Power off is the goal. Keeping it on needs a reason, and live work needs a permit.",
   "refs": ["120.5", "130.3", "130.2(A)(2)"],
   "checks": [
     {"key": "sources", "text": "Every source found, backfeed included.", "when": "off"},
     {"key": "load_off", "text": "Load off, disconnects open.", "when": "off"},
     {"key": "seen_open", "text": "Blades seen open or breaker racked out.", "when": "off"},
     {"key": "stored", "text": "Stored energy released.", "when": "off"},
     {"key": "locks", "text": "Locks and tags on.", "when": "off"},
     {"key": "tested_dead", "text": "Tested dead at the work spot. Tester checked on a known source before and after.", "when": "off"},
     {"key": "grounds", "text": "Grounds on where needed.", "when": "off"},
     {"key": "why_on", "text": "We said why the power can't be off.", "when": "on"},
     {"key": "permit", "text": "Energized Work Permit signed when one is needed.", "when": "on"},
     {"key": "second_person", "text": "A second person trained in emergency response is named.", "when": "on"},
     {"key": "keep_out", "text": "Barricades or an attendant keep others out.", "when": "on"}
   ]},
  {"key": "shock_arc", "title": "Shock and arc flash",
   "prompt": "Read the label out loud: approach boundaries, arc flash boundary, and incident energy or PPE category.",
   "help": "Copy it from the equipment label. ampOS never works these out. No label or an old label: stop and call the PM. These apply until the gear is tested dead.",
   "refs": ["130.4", "130.5"],
   "checks": [
     {"key": "label", "text": "Label found and read out loud, or the missing label is reported.", "when": "always"},
     {"key": "approach", "text": "Limited and restricted approach boundaries are known.", "when": "always"},
     {"key": "arc_boundary", "text": "Arc flash boundary is marked.", "when": "always"},
     {"key": "qualified_only", "text": "Only qualified people cross the boundaries.", "when": "always"}
   ]},
  {"key": "ppe", "title": "PPE and tools",
   "prompt": "Check each item by eye before we use it.",
   "help": "PPE is the last line of defense, not the plan.",
   "refs": ["130.7"],
   "checks": [
     {"key": "arc_rated", "text": "Arc-rated clothing and face protection meet the label.", "when": "always"},
     {"key": "gloves", "text": "Rubber gloves inside their test date, air-tested today, with leather protectors.", "when": "always"},
     {"key": "meter", "text": "Meter and leads rated for the voltage and checked.", "when": "always"},
     {"key": "tools", "text": "Insulated tools, hot sticks and grounds in good shape.", "when": "always"},
     {"key": "test_set", "text": "Test set grounded and leads routed safely.", "when": "always"}
   ]},
  {"key": "emergency", "title": "Emergency plan",
   "prompt": "Read the plan out loud: who calls 911, where we meet EMS, the nearest hospital, and where the AED and first aid are.",
   "help": "Saved on the site, so it only gets typed once.",
   "refs": ["110.3(I)(1)"],
   "checks": [
     {"key": "caller", "text": "Who calls 911 and the site address are known.", "when": "always"},
     {"key": "meet_ems", "text": "Where to meet EMS is known.", "when": "always"},
     {"key": "hospital", "text": "Nearest hospital and the route are known.", "when": "always"},
     {"key": "aed", "text": "AED, first aid kit and fire extinguisher locations are known.", "when": "always"},
     {"key": "rescue", "text": "Someone trained in CPR and contact release is on site.", "when": "always"}
   ]},
  {"key": "sign", "title": "Sign",
   "prompt": "Each person signs to say they heard this briefing.",
   "help": "Sign on your own phone or on the lead's phone.",
   "refs": [],
   "checks": [
     {"key": "stop_work", "text": "Everyone knows they can stop the work if something changes.", "when": "always"}
   ]}
]$json$::jsonb,
'First draft, written by ampOS in our own words. Section numbers came from OSHA and training sites, not the book. The safety lead checks every one before approving.',
'ampOS')
ON CONFLICT (version) DO NOTHING;

-- 8. Checks (Claude runs these read-only) ----------------------------------------------
--   SELECT version, edition, status, jsonb_array_length(steps) FROM neta_ops.safety_question_sets;
--   SELECT key FROM common.permissions WHERE area = 'Safety';
