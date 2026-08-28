-- Custom application questions per job posting.
--
-- HR adds their own questions to a requisition; applicants answer them on the
-- public careers form (ampOS /careers). The EEO block and FR sizes stay
-- hardcoded in the form — they are compliance fields, not custom questions.
--
-- Two tables:
--   job_application_questions   - what HR asks, per requisition
--   candidate_question_answers  - what an applicant answered
--
-- Answers snapshot the question label. HR will edit and delete questions later;
-- old applications must still read correctly, so the label is copied onto the
-- answer at submit time rather than joined at read time.

-- ── Questions ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS common.job_application_questions (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  requisition_id UUID NOT NULL REFERENCES common.job_requisitions(id) ON DELETE CASCADE,
  label          TEXT NOT NULL,
  question_type  TEXT NOT NULL DEFAULT 'short_text'
                 CHECK (question_type IN ('short_text','long_text','yes_no','single_select','multi_select')),
  options        JSONB NOT NULL DEFAULT '[]'::jsonb,
  help_text      TEXT,
  display_order  INTEGER NOT NULL DEFAULT 0,
  required       BOOLEAN NOT NULL DEFAULT false,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_job_application_questions_requisition
  ON common.job_application_questions(requisition_id, display_order);

COMMENT ON TABLE common.job_application_questions IS
  'Custom questions HR attaches to a job requisition; rendered on the public application form.';
COMMENT ON COLUMN common.job_application_questions.options IS
  'Choice list for single_select/multi_select. JSON array of strings. Empty for other types.';

-- ── Answers ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS common.candidate_question_answers (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id   UUID NOT NULL REFERENCES common.candidates(id) ON DELETE CASCADE,
  question_id    UUID REFERENCES common.job_application_questions(id) ON DELETE SET NULL,
  question_label TEXT NOT NULL,
  question_type  TEXT NOT NULL,
  answer_text    TEXT,
  answer_bool    BOOLEAN,
  answer_json    JSONB,
  display_order  INTEGER NOT NULL DEFAULT 0,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_candidate_question_answers_candidate
  ON common.candidate_question_answers(candidate_id, display_order);

COMMENT ON TABLE common.candidate_question_answers IS
  'Applicant answers to custom application questions. question_label/question_type are snapshots taken at submit time so history survives question edits.';

-- ── RLS ────────────────────────────────────────────────────────────────────────
ALTER TABLE common.job_application_questions   ENABLE ROW LEVEL SECURITY;
ALTER TABLE common.candidate_question_answers  ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Employees manage application questions" ON common.job_application_questions;
DROP POLICY IF EXISTS "Employees read application answers"     ON common.candidate_question_answers;

CREATE POLICY "Employees manage application questions"
ON common.job_application_questions
FOR ALL
USING (common.is_employee_user())
WITH CHECK (common.is_employee_user());

-- Answers are written by the public form through submit_application_answers()
-- (SECURITY DEFINER), so no INSERT policy is granted to anyone here.
CREATE POLICY "Employees read application answers"
ON common.candidate_question_answers
FOR SELECT
USING (common.is_employee_user());

GRANT SELECT, INSERT, UPDATE, DELETE ON common.job_application_questions  TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON common.job_application_questions  TO service_role;
GRANT SELECT                         ON common.candidate_question_answers TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON common.candidate_question_answers TO service_role;

-- ── Public read ────────────────────────────────────────────────────────────────
-- Applicants are not signed in. Rather than granting anon on the base table,
-- expose only the questions belonging to a live posting, mirroring the
-- v_posted_job_requisitions pattern. The status filter matches what the ampOS
-- careers page lists (approved or posted), which is broader than the ampqes.com
-- view (posted only).
CREATE OR REPLACE VIEW common.v_public_application_questions AS
  SELECT q.id,
         q.requisition_id,
         q.label,
         q.question_type,
         q.options,
         q.help_text,
         q.display_order,
         q.required
    FROM common.job_application_questions q
    JOIN common.job_requisitions r ON r.id = q.requisition_id
   WHERE r.deleted_at IS NULL
     AND r.is_template IS NOT TRUE
     AND r.status::text IN ('approved','posted')
     AND (r.posting_end_date IS NULL OR r.posting_end_date >= CURRENT_DATE)
   ORDER BY q.display_order;

COMMENT ON VIEW common.v_public_application_questions IS
  'Questions visible to an applicant on the public careers form. Read by the anon role.';

GRANT SELECT ON common.v_public_application_questions TO anon;
GRANT SELECT ON common.v_public_application_questions TO authenticated;

-- ── Submit answers ─────────────────────────────────────────────────────────────
-- The public form creates the candidate row first, then calls this with the
-- answers. SECURITY DEFINER so anon never holds a direct INSERT on the answers
-- table. Ignores a candidate that already has answers, so the grant cannot be
-- used to append to someone else's application and a retried submit is safe.
CREATE OR REPLACE FUNCTION common.submit_application_answers(
  p_candidate_id uuid,
  p_answers      jsonb
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = common, public
AS $$
DECLARE
  v_inserted integer;
BEGIN
  IF p_answers IS NULL OR jsonb_typeof(p_answers) <> 'array' THEN
    RAISE EXCEPTION 'p_answers must be a JSON array';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM common.candidates c WHERE c.id = p_candidate_id) THEN
    RAISE EXCEPTION 'Unknown candidate';
  END IF;

  -- Idempotent on purpose: a retried submit returns 0 instead of erroring, and
  -- the grant cannot be used to append to someone else's application.
  IF EXISTS (SELECT 1 FROM common.candidate_question_answers a WHERE a.candidate_id = p_candidate_id) THEN
    RETURN 0;
  END IF;

  INSERT INTO common.candidate_question_answers (
    candidate_id, question_id, question_label, question_type,
    answer_text, answer_bool, answer_json, display_order
  )
  SELECT p_candidate_id,
         q.id,
         COALESCE(NULLIF(e->>'question_label',''), q.label, 'Question'),
         COALESCE(NULLIF(e->>'question_type',''),  q.question_type, 'short_text'),
         NULLIF(e->>'answer_text',''),
         CASE WHEN e->>'answer_bool' IS NULL THEN NULL ELSE (e->>'answer_bool')::boolean END,
         CASE WHEN jsonb_typeof(e->'answer_json') = 'array' THEN e->'answer_json' ELSE NULL END,
         COALESCE((e->>'display_order')::int, 0)
    FROM jsonb_array_elements(p_answers) AS e
    -- Only questions that really belong to a live posting are accepted.
    JOIN common.v_public_application_questions q
      ON q.id = NULLIF(e->>'question_id','')::uuid;

  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  RETURN v_inserted;
END;
$$;

REVOKE ALL ON FUNCTION common.submit_application_answers(uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION common.submit_application_answers(uuid, jsonb) TO anon;
GRANT EXECUTE ON FUNCTION common.submit_application_answers(uuid, jsonb) TO authenticated;
