-- Daily JSA / JHA, item 3: the Daily JSA walkthrough
-- (scope: documentation/Scopes/scope-job-hazard-analysis.html).
--
-- One row per crew, per job, per day (job_tailgates). The lead walks the crew through the
-- eight steps of the approved questions. It starts from the job's JHA plus the last JSA,
-- and the lead has to say what's different today. Finishing locks it for good.
-- Stop Work is saved on the row. Signatures come in item 5.
--
-- Practice runs: people who edit or approve the questions can try a JSA on the draft
-- questions before they're approved. Practice JSAs are tagged and can be deleted.
--
-- Our own words only. ampOS never picks PPE or works out boundaries: people copy the label.
-- Needs safety_01 and safety_02 first. Safe to re-run. If it stops with "lock timeout", run it again.

SET lock_timeout = '5s';

BEGIN;

-- 1. Permission -----------------------------------------------------------------------------

INSERT INTO common.permissions (key, area, label, description, sort_order) VALUES
  ('safety.lead_jsa', 'Safety', 'Lead a Daily JSA',
   'Start the Daily JSA (tailgate) on a job and walk the crew through it.', 995)
ON CONFLICT (key) DO NOTHING;

INSERT INTO common.role_permissions (role_key, permission_key) VALUES
  ('admin',           'safety.lead_jsa'),
  ('project_manager', 'safety.lead_jsa'),
  ('lead_tech',       'safety.lead_jsa'),
  ('neta_tech',       'safety.lead_jsa')
ON CONFLICT DO NOTHING;

-- 2. Table ----------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS neta_ops.job_tailgates (
  -- Set by the phone, so a resent Start can't make a second one
  id                   uuid PRIMARY KEY,
  job_id               uuid NOT NULL REFERENCES neta_ops.jobs(id) ON DELETE CASCADE,
  -- The crew's own calendar day, from the phone
  work_date            date NOT NULL,
  status               text NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress', 'done')),
  practice             boolean NOT NULL DEFAULT false,
  question_set_id      uuid REFERENCES neta_ops.safety_question_sets(id) ON DELETE SET NULL,
  question_set_version integer NOT NULL,
  -- The steps and their wording as they were, so old JSAs read right after edits
  questions            jsonb NOT NULL CHECK (jsonb_typeof(questions) = 'array'),
  jha_id               uuid REFERENCES neta_ops.job_jhas(id) ON DELETE SET NULL,
  jha_version          integer,
  -- The JSA this one carried over from
  previous_id          uuid REFERENCES neta_ops.job_tailgates(id) ON DELETE SET NULL,
  -- [{key, name, user_id, company, lead}]. Exactly one lead (the person in charge).
  crew                 jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(crew) = 'array'),
  work_summary         text NOT NULL DEFAULT '',
  changes_today        text NOT NULL DEFAULT '',
  -- [{key, hazard, controls, from}], same shape as the JHA's
  hazards              jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(hazards) = 'array'),
  power                text CHECK (power IN ('off', 'on')),
  power_reason         text NOT NULL DEFAULT '',
  -- Typed from the equipment labels: [{key, equipment, voltage, limited, restricted,
  -- arc_boundary, energy, ppe_category, label_date}]. Never calculated.
  labels               jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(labels) = 'array'),
  no_label             boolean NOT NULL DEFAULT false,
  no_label_note        text NOT NULL DEFAULT '',
  emergency_plan       jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(emergency_plan) = 'object'),
  -- {step key: {checked: [check keys], note}}
  answers              jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(answers) = 'object'),
  -- [{key, at, by_name, step, reason, resumed_at, resumed_by_name, resolution}]
  stops                jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(stops) = 'array'),
  current_step         text,
  -- {step key: seconds spent on it}
  step_seconds         jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(step_seconds) = 'object'),
  started_by           uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  started_by_name      text,
  started_at           timestamptz NOT NULL DEFAULT now(),
  finished_by          uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  finished_by_name     text,
  finished_at          timestamptz,
  last_save_id         uuid,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS job_tailgates_job_day ON neta_ops.job_tailgates (job_id, work_date DESC);
CREATE INDEX IF NOT EXISTS job_tailgates_day ON neta_ops.job_tailgates (work_date);

-- New neta_ops tables get report backup triggers automatically. This isn't a report.
DROP TRIGGER IF EXISTS trg_snapshot_job_tailgates_ins ON neta_ops.job_tailgates;
DROP TRIGGER IF EXISTS trg_snapshot_job_tailgates_upd ON neta_ops.job_tailgates;

-- 3. Guard ----------------------------------------------------------------------------------

-- A finished JSA never changes. The one exception: a link going blank because what it
-- pointed at was deleted (someone's account, a practice draft), so those deletes still work.
CREATE OR REPLACE FUNCTION neta_ops.job_tailgates_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path TO '' AS $$
DECLARE
  v_links text[] := ARRAY['started_by', 'finished_by', 'jha_id', 'previous_id', 'question_set_id', 'updated_at'];
BEGIN
  IF OLD.status = 'done' THEN
    IF (to_jsonb(NEW) - v_links) IS DISTINCT FROM (to_jsonb(OLD) - v_links)
       OR (NEW.started_by IS NOT NULL AND NEW.started_by IS DISTINCT FROM OLD.started_by)
       OR (NEW.finished_by IS NOT NULL AND NEW.finished_by IS DISTINCT FROM OLD.finished_by)
       OR (NEW.jha_id IS NOT NULL AND NEW.jha_id IS DISTINCT FROM OLD.jha_id)
       OR (NEW.previous_id IS NOT NULL AND NEW.previous_id IS DISTINCT FROM OLD.previous_id)
       OR (NEW.question_set_id IS NOT NULL AND NEW.question_set_id IS DISTINCT FROM OLD.question_set_id) THEN
      RAISE EXCEPTION 'A finished JSA can''t be changed.';
    END IF;
    RETURN NEW;
  END IF;
  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.job_id IS DISTINCT FROM OLD.job_id
     OR NEW.work_date IS DISTINCT FROM OLD.work_date
     OR NEW.practice IS DISTINCT FROM OLD.practice
     OR NEW.questions IS DISTINCT FROM OLD.questions
     OR NEW.question_set_version IS DISTINCT FROM OLD.question_set_version
     OR NEW.started_at IS DISTINCT FROM OLD.started_at THEN
    RAISE EXCEPTION 'That part of a JSA can''t be changed.';
  END IF;
  NEW.updated_at := clock_timestamp();
  RETURN NEW;
END $$;

CREATE OR REPLACE TRIGGER job_tailgates_guard
  BEFORE UPDATE ON neta_ops.job_tailgates
  FOR EACH ROW EXECUTE FUNCTION neta_ops.job_tailgates_guard();

-- 4. Who can do what ------------------------------------------------------------------------
-- Staff read. Leads edit while it's in progress. Starting and finishing go through functions.
-- Subcontractors and customers see nothing yet (item 5 adds joining by code).

ALTER TABLE neta_ops.job_tailgates ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON neta_ops.job_tailgates FROM anon, authenticated;
GRANT ALL ON neta_ops.job_tailgates TO service_role;

GRANT SELECT, DELETE ON neta_ops.job_tailgates TO authenticated;
GRANT UPDATE (crew, work_summary, changes_today, hazards, power, power_reason, labels, no_label, no_label_note,
              emergency_plan, answers, stops, current_step, step_seconds, last_save_id)
  ON neta_ops.job_tailgates TO authenticated;

DROP POLICY IF EXISTS job_tailgates_read ON neta_ops.job_tailgates;
CREATE POLICY job_tailgates_read ON neta_ops.job_tailgates FOR SELECT TO authenticated
  USING ((SELECT common.is_employee_user()));

DROP POLICY IF EXISTS job_tailgates_edit ON neta_ops.job_tailgates;
CREATE POLICY job_tailgates_edit ON neta_ops.job_tailgates FOR UPDATE TO authenticated
  USING (status = 'in_progress' AND (SELECT common.can('safety.lead_jsa')))
  WITH CHECK (status = 'in_progress' AND (SELECT common.can('safety.lead_jsa')));

-- Discard one that was started by mistake. Finished ones stay, except practice runs.
DROP POLICY IF EXISTS job_tailgates_delete ON neta_ops.job_tailgates;
CREATE POLICY job_tailgates_delete ON neta_ops.job_tailgates FOR DELETE TO authenticated
  USING (
    (status = 'in_progress' AND (SELECT common.can('safety.lead_jsa')))
    OR (practice AND ((SELECT common.can('safety.manage_questions')) OR (SELECT common.can('safety.approve_questions'))))
  );

-- 5. Functions ------------------------------------------------------------------------------

-- Staff names for the crew list. Names only.
CREATE OR REPLACE FUNCTION neta_ops.jsa_crew_choices() RETURNS TABLE (id uuid, name text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO '' AS $$
  SELECT u.id,
         coalesce(nullif(p.full_name, ''), nullif(u.raw_user_meta_data->>'name', ''),
                  split_part(u.email::text, '@', 1))
    FROM auth.users u
    JOIN common.user_roles ur ON ur.user_id = u.id
    LEFT JOIN common.profiles p ON p.id = u.id
   WHERE common.is_employee_user()
     AND ur.role_key <> 'subcontractor'
     AND coalesce(p.is_active, true)
     AND (u.banned_until IS NULL OR u.banned_until < now())
     AND NOT EXISTS (SELECT 1 FROM common.service_accounts sa WHERE sa.user_id = u.id)
   ORDER BY 2
$$;

-- Start a Daily JSA. Copies today's starting point from the JHA and the last JSA.
-- Sending the same id twice hands back the first one.
CREATE OR REPLACE FUNCTION neta_ops.start_job_tailgate(p_id uuid, p_job_id uuid, p_work_date date,
                                                       p_practice boolean DEFAULT false) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $$
DECLARE
  v_set      neta_ops.safety_question_sets;
  v_jha      neta_ops.job_jhas;
  v_prev     neta_ops.job_tailgates;
  v_site     jsonb;
  v_addr     text;
  v_jha_keys text[];
  v_hazards  jsonb;
  v_plan     jsonb;
  v_work     text;
  v_name     text := neta_ops.safety_my_name();
BEGIN
  IF NOT common.can('safety.lead_jsa') THEN
    RAISE EXCEPTION 'You don''t have permission to lead a Daily JSA.';
  END IF;

  IF EXISTS (SELECT 1 FROM neta_ops.job_tailgates WHERE id = p_id) THEN
    RETURN p_id;
  END IF;

  IF p_work_date IS NULL OR p_work_date NOT BETWEEN current_date - 1 AND current_date + 1 THEN
    RAISE EXCEPTION 'Check the date on this phone. A Daily JSA is for today.';
  END IF;

  SELECT s.emergency_plan, nullif(btrim(j.site_address), '')
    INTO v_site, v_addr
    FROM neta_ops.jobs j LEFT JOIN common.sites s ON s.id = j.site_id
   WHERE j.id = p_job_id AND j.deleted_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'That job doesn''t exist.';
  END IF;

  IF p_practice THEN
    IF NOT (common.can('safety.manage_questions') OR common.can('safety.approve_questions')) THEN
      RAISE EXCEPTION 'Only people who edit or approve the safety questions can run a practice JSA.';
    END IF;
    SELECT * INTO v_set FROM neta_ops.safety_question_sets
     WHERE status IN ('draft', 'in_use') ORDER BY (status = 'draft') DESC, version DESC LIMIT 1;
  ELSE
    SELECT * INTO v_set FROM neta_ops.safety_question_sets WHERE status = 'in_use';
  END IF;
  IF v_set.id IS NULL THEN
    RAISE EXCEPTION 'The safety lead hasn''t approved the Daily JSA questions yet.';
  END IF;

  SELECT * INTO v_jha FROM neta_ops.job_jhas
   WHERE job_id = p_job_id AND status = 'final' ORDER BY version DESC LIMIT 1;

  -- Practice runs never count as "the last JSA" for a real one
  SELECT * INTO v_prev FROM neta_ops.job_tailgates
   WHERE job_id = p_job_id AND status = 'done' AND (p_practice OR NOT practice)
   ORDER BY work_date DESC, finished_at DESC LIMIT 1;

  -- Every hazard key any JHA version of this job ever had
  SELECT coalesce(array_agg(DISTINCT h->>'key'), '{}') INTO v_jha_keys
    FROM neta_ops.job_jhas x, jsonb_array_elements(x.hazards) h
   WHERE x.job_id = p_job_id;

  IF v_prev.id IS NOT NULL AND v_prev.jha_version IS NOT DISTINCT FROM v_jha.version THEN
    -- Same JHA as last time: carry the last JSA forward
    v_work    := v_prev.work_summary;
    v_hazards := v_prev.hazards;
    v_plan    := v_prev.emergency_plan;
  ELSIF v_jha.id IS NOT NULL THEN
    -- New or changed JHA: start from it, keep hazards the crew added on site
    v_work    := CASE WHEN v_prev.id IS NOT NULL AND btrim(v_prev.work_summary) <> '' THEN v_prev.work_summary
                      ELSE v_jha.work_summary END;
    v_hazards := v_jha.hazards || coalesce((
                   SELECT jsonb_agg(h) FROM jsonb_array_elements(v_prev.hazards) h
                    WHERE NOT (h->>'key' = ANY (v_jha_keys))), '[]'::jsonb);
    v_plan    := v_jha.emergency_plan;
  ELSE
    -- No finished JHA yet
    v_work    := coalesce(v_prev.work_summary, '');
    v_hazards := coalesce(v_prev.hazards, '[]'::jsonb);
    v_plan    := coalesce(v_prev.emergency_plan,
                          jsonb_strip_nulls(jsonb_build_object('address', v_addr)) || coalesce(v_site, '{}'::jsonb));
  END IF;

  INSERT INTO neta_ops.job_tailgates (
    id, job_id, work_date, practice, question_set_id, question_set_version, questions,
    jha_id, jha_version, previous_id, crew, work_summary, hazards, emergency_plan, current_step,
    started_by, started_by_name)
  VALUES (
    p_id, p_job_id, p_work_date, p_practice, v_set.id, v_set.version, v_set.steps,
    v_jha.id, v_jha.version, v_prev.id,
    jsonb_build_array(jsonb_build_object('key', 'p_' || replace(gen_random_uuid()::text, '-', ''),
                                         'name', v_name, 'user_id', auth.uid(), 'company', NULL, 'lead', true)),
    coalesce(v_work, ''), coalesce(v_hazards, '[]'::jsonb), coalesce(v_plan, '{}'::jsonb),
    v_set.steps->0->>'key',
    auth.uid(), v_name);

  RETURN p_id;
END $$;

-- Finish: check it's complete, then lock it. Same checks as the screen.
CREATE OR REPLACE FUNCTION neta_ops.finish_job_tailgate(p_id uuid, p_updated_at timestamptz) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $$
DECLARE
  v_row  neta_ops.job_tailgates;
  v_name text := neta_ops.safety_my_name();
  v_bad  text;
BEGIN
  IF NOT common.can('safety.lead_jsa') THEN
    RAISE EXCEPTION 'You don''t have permission to lead a Daily JSA.';
  END IF;

  SELECT * INTO v_row FROM neta_ops.job_tailgates WHERE id = p_id FOR UPDATE;
  IF v_row.id IS NULL OR v_row.status <> 'in_progress' THEN
    RAISE EXCEPTION 'This JSA is already finished or was deleted.';
  END IF;
  IF v_row.updated_at IS DISTINCT FROM p_updated_at THEN
    RAISE EXCEPTION 'Someone else changed this JSA. Reload, check it, then finish.';
  END IF;

  IF EXISTS (SELECT 1 FROM jsonb_array_elements(v_row.stops) s WHERE s->>'resumed_at' IS NULL) THEN
    RAISE EXCEPTION 'The work is stopped. Say what was done about it before finishing.';
  END IF;
  IF jsonb_array_length(v_row.crew) = 0
     OR EXISTS (SELECT 1 FROM jsonb_array_elements(v_row.crew) c WHERE btrim(coalesce(c->>'name', '')) = '')
     OR (SELECT count(*) FROM jsonb_array_elements(v_row.crew) c WHERE (c->>'lead')::boolean IS TRUE) <> 1 THEN
    RAISE EXCEPTION 'List the crew and name one person in charge.';
  END IF;
  IF btrim(v_row.work_summary) = '' THEN
    RAISE EXCEPTION 'Say what today''s work is.';
  END IF;
  IF btrim(v_row.changes_today) = '' THEN
    RAISE EXCEPTION 'Say what''s different today.';
  END IF;
  IF jsonb_array_length(v_row.hazards) = 0
     OR EXISTS (SELECT 1 FROM jsonb_array_elements(v_row.hazards) h
                 WHERE btrim(coalesce(h->>'hazard', '')) = '' OR btrim(coalesce(h->>'controls', '')) = '') THEN
    RAISE EXCEPTION 'Every hazard needs a name and how it''s controlled.';
  END IF;
  IF v_row.power IS NULL THEN
    RAISE EXCEPTION 'Say whether the power is off or on.';
  END IF;
  IF v_row.power = 'on' AND btrim(v_row.power_reason) = '' THEN
    RAISE EXCEPTION 'Say why the power can''t be off.';
  END IF;
  IF v_row.no_label THEN
    IF btrim(v_row.no_label_note) = '' THEN
      RAISE EXCEPTION 'Say what the plan is for the missing or old label.';
    END IF;
  ELSIF jsonb_array_length(v_row.labels) = 0
     OR EXISTS (SELECT 1 FROM jsonb_array_elements(v_row.labels) l
                 WHERE btrim(coalesce(l->>'equipment', '')) = ''
                    OR btrim(coalesce(l->>'arc_boundary', '')) = ''
                    OR (btrim(coalesce(l->>'energy', '')) = '' AND btrim(coalesce(l->>'ppe_category', '')) = '')) THEN
    RAISE EXCEPTION 'Copy each label: equipment, arc flash boundary, and incident energy or PPE category.';
  END IF;
  IF EXISTS (SELECT 1 FROM unnest(ARRAY['address', 'ems_meet', 'hospital', 'aed']) k
              WHERE btrim(coalesce(v_row.emergency_plan->>k, '')) = '') THEN
    RAISE EXCEPTION 'Finish the emergency plan.';
  END IF;

  -- Every check that applies is ticked, or the step has a note saying why not
  SELECT string_agg(DISTINCT s->>'title', ', ') INTO v_bad
    FROM jsonb_array_elements(v_row.questions) s, jsonb_array_elements(s->'checks') c
   WHERE c->>'when' IN ('always', v_row.power)
     AND NOT coalesce(v_row.answers->(s->>'key')->'checked' ? (c->>'key'), false)
     AND btrim(coalesce(v_row.answers->(s->>'key')->>'note', '')) = '';
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'Tick every item, or add a note saying why not: %', v_bad;
  END IF;

  UPDATE neta_ops.job_tailgates
     SET status = 'done', finished_by = auth.uid(), finished_by_name = v_name, finished_at = now()
   WHERE id = p_id;

  IF NOT v_row.practice THEN
    -- Who calls and who rescues change by crew, so they stay off the site's copy
    UPDATE common.sites s
       SET emergency_plan = v_row.emergency_plan - 'caller' - 'rescue',
           emergency_plan_updated_at = now(),
           emergency_plan_updated_by_name = v_name
      FROM neta_ops.jobs j
     WHERE j.id = v_row.job_id AND s.id = j.site_id
       AND s.emergency_plan IS DISTINCT FROM v_row.emergency_plan - 'caller' - 'rescue';

    -- Hazards found on site feed the hazard lists, like the JHA's
    INSERT INTO neta_ops.safety_hazard_suggestions (hazard_key, hazard, controls, job_id, work_types, suggested_by_name)
    SELECT h->>'key', btrim(h->>'hazard'), btrim(h->>'controls'), v_row.job_id,
           coalesce((SELECT x.work_types FROM neta_ops.job_jhas x WHERE x.id = v_row.jha_id), '[]'::jsonb), v_name
      FROM jsonb_array_elements(v_row.hazards) h
     WHERE h->>'from' IS NULL AND h->>'key' IS NOT NULL
    ON CONFLICT (hazard_key) DO NOTHING;
  END IF;
END $$;

REVOKE ALL ON FUNCTION neta_ops.jsa_crew_choices() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION neta_ops.start_job_tailgate(uuid, uuid, date, boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION neta_ops.finish_job_tailgate(uuid, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION neta_ops.jsa_crew_choices() TO authenticated;
GRANT EXECUTE ON FUNCTION neta_ops.start_job_tailgate(uuid, uuid, date, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION neta_ops.finish_job_tailgate(uuid, timestamptz) TO authenticated;

COMMIT;

RESET lock_timeout;
