-- Step 1 of 2: safe doors for the public career page.
--
-- Problem: common.candidates and the other recruiting tables have no row-level
-- security and are granted to anon (the public key in the website's
-- JavaScript). Anyone with that key can read every applicant (name, email,
-- phone, resume link, expected pay) and every job requisition, and change or
-- delete them.
--
-- The public career page (/careers) reads job_requisitions and writes
-- candidates straight from the browser as anon, so the tables can't be locked
-- until that page stops. These functions give it a narrow way in:
--
--   list_public_job_postings()   -> live postings only, public fields only
--   submit_job_application(...)  -> creates the applicant, saves question
--                                   answers and EEO data; returns only the
--                                   new applicant's id
--   my_confirmed_email()         -> used by step 2 so a new hire can still
--                                   read their own applicant record
--
-- Also fixes two existing bugs on the career page:
--   - Deleted and template requisitions could show as job listings, and
--     postings past their end date stayed up. Now the same "live posting" rule
--     as v_public_application_questions applies.
--   - EEO answers from applicants were never saved: eeo_submissions only lets
--     logged-in users insert, and applicants aren't logged in. The error was
--     swallowed. Now saved inside submit_job_application.
--
-- Safe to run anytime, and more than once. Nothing changes for logged-in
-- users. Step 2 is enable_rls_recruiting.sql: run it only after the app
-- update that uses these functions is live.

-- Same rule as common.v_public_application_questions.
CREATE OR REPLACE FUNCTION common.list_public_job_postings()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'id', r.id,
           'title', r.title,
           'department', r.department,
           'location', r.location,
           'employment_type', r.employment_type,
           'pay_type', r.pay_type,
           'salary_range_min', r.salary_range_min,
           'salary_range_max', r.salary_range_max,
           'salary_currency', r.salary_currency,
           'description', r.description,
           'requirements', r.requirements,
           'preferred_qualifications', r.preferred_qualifications,
           'responsibilities', r.responsibilities,
           'benefits', r.benefits,
           'work_schedule', r.work_schedule,
           'remote_work_allowed', r.remote_work_allowed,
           'application_deadline', r.application_deadline,
           'status', r.status,
           'created_at', r.created_at)
           ORDER BY r.created_at DESC), '[]'::jsonb)
    FROM common.job_requisitions r
   WHERE r.deleted_at IS NULL
     AND r.is_template IS NOT TRUE
     AND r.status IN ('approved', 'posted')
     AND (r.posting_end_date IS NULL OR r.posting_end_date >= current_date);
$$;

CREATE OR REPLACE FUNCTION common.submit_job_application(
  p_requisition_id uuid,
  p_first_name text,
  p_last_name text,
  p_email text,
  p_phone text DEFAULT NULL,
  p_location text DEFAULT NULL,
  p_cover_letter text DEFAULT NULL,
  p_expected_compensation text DEFAULT NULL,
  p_resume_url text DEFAULT NULL,
  p_answers jsonb DEFAULT NULL,
  p_eeo jsonb DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_req common.job_requisitions%ROWTYPE;
  v_id uuid;
  v_email text := lower(btrim(coalesce(p_email, '')));
BEGIN
  SELECT * INTO v_req
    FROM common.job_requisitions r
   WHERE r.id = p_requisition_id
     AND r.deleted_at IS NULL
     AND r.is_template IS NOT TRUE
     AND r.status IN ('approved', 'posted')
     AND (r.posting_end_date IS NULL OR r.posting_end_date >= current_date);
  IF NOT FOUND THEN
    RAISE EXCEPTION 'This job posting is no longer open.';
  END IF;

  IF coalesce(btrim(p_first_name), '') = '' OR coalesce(btrim(p_last_name), '') = '' THEN
    RAISE EXCEPTION 'First and last name are required.';
  END IF;
  IF v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' THEN
    RAISE EXCEPTION 'Please enter a valid email address.';
  END IF;
  IF length(coalesce(p_cover_letter, '')) > 20000 THEN
    RAISE EXCEPTION 'Cover letter is too long.';
  END IF;
  -- Only accept resume links to this project's own resumes folder, so the
  -- form can't be used to plant outside links in front of HR.
  IF nullif(btrim(p_resume_url), '') IS NOT NULL
     AND p_resume_url !~ '^https://[^/]+/storage/v1/object/public/resumes/' THEN
    RAISE EXCEPTION 'Resume upload is not valid.';
  END IF;

  INSERT INTO common.candidates (
    first_name, last_name, email, phone, location,
    position_applied, requisition_id, status, source,
    resume_url, cover_letter, expected_compensation, applied_date)
  VALUES (
    left(btrim(p_first_name), 100),
    left(btrim(p_last_name), 100),
    left(btrim(p_email), 255),
    left(nullif(btrim(p_phone), ''), 20),
    left(nullif(btrim(p_location), ''), 255),
    left(v_req.title, 255),
    v_req.id,
    'new',
    'Career Page',
    nullif(btrim(p_resume_url), ''),
    nullif(btrim(p_cover_letter), ''),
    left(nullif(btrim(p_expected_compensation), ''), 200),
    now())
  RETURNING id INTO v_id;

  -- Answers and EEO never block the application itself (same as before).
  IF p_answers IS NOT NULL AND jsonb_typeof(p_answers) = 'array'
     AND jsonb_array_length(p_answers) > 0 THEN
    BEGIN
      PERFORM common.submit_application_answers(v_id, p_answers);
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'submit_job_application: answers not saved: %', SQLERRM;
    END;
  END IF;

  -- EEO is stored with no link to the applicant, on purpose.
  IF p_eeo IS NOT NULL AND jsonb_typeof(p_eeo) = 'object' THEN
    BEGIN
      INSERT INTO common.eeo_submissions (
        requisition_id, position_title, department,
        gender, race, veteran, disability, candidate_status)
      VALUES (
        v_req.id, v_req.title, v_req.department,
        left(nullif(btrim(p_eeo ->> 'gender'), ''), 100),
        left(nullif(btrim(p_eeo ->> 'race'), ''), 100),
        coalesce((p_eeo ->> 'veteran')::boolean, false),
        coalesce((p_eeo ->> 'disability')::boolean, false),
        'new');
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'submit_job_application: EEO not saved: %', SQLERRM;
    END;
  END IF;

  RETURN v_id;
END;
$$;

-- The signed-in user's email, only once they've confirmed it. Lets a new hire
-- read their own applicant record without being able to claim someone else's
-- by signing up with that person's email.
CREATE OR REPLACE FUNCTION common.my_confirmed_email()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT lower(u.email)
    FROM auth.users u
   WHERE u.id = auth.uid()
     AND u.email_confirmed_at IS NOT NULL;
$$;

REVOKE ALL ON FUNCTION common.list_public_job_postings() FROM PUBLIC;
REVOKE ALL ON FUNCTION common.submit_job_application(uuid, text, text, text, text, text, text, text, text, jsonb, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION common.my_confirmed_email() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION common.list_public_job_postings() TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION common.submit_job_application(uuid, text, text, text, text, text, text, text, text, jsonb, jsonb) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION common.my_confirmed_email() TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
