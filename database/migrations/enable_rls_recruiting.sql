-- Step 2 of 2: lock applicant and recruiting data.
--
-- RUN ONLY AFTER the app update that uses recruiting_public_functions.sql is
-- live. Before that, the public career page still reads job_requisitions and
-- writes candidates directly as anon: job listings would vanish and
-- applications would fail.
--
-- Who gets in afterward (matches what the app already shows):
--   - Recruiting access = common.talent_pool_can_access(): Admin, Super Admin,
--     superusers, plus anyone added in Talent Pool > members. The app only
--     opens Recruiting / Offers pages for Admin and Super Admin.
--   - A new hire can READ their own applicant row (My Onboarding looks it up
--     by email): matched on their confirmed login email or linked_user_id.
--   - Applicants (logged out) only go through the step 1 functions.
--   - service_role (edge functions such as new-applicant-notification and
--     requisition-approval-notification) keeps full access.
--
-- Also:
--   - Removes TRUNCATE from logged-in users. Row security does not apply to
--     TRUNCATE, so any logged-in user could otherwise wipe these tables.
--   - The resumes storage folder is fixed separately in
--     lock_resumes_storage.sql (Supabase can refuse storage rule changes, and
--     one error would undo this whole file).
--   - Removes anon access to eeo_submissions and to the unused
--     v_posted_job_requisitions / v_active_job_requisitions /
--     v_pending_approval_requisitions views (views skip row security).
--
-- After this, common.talent_pool_promotion_enabled() returns true by itself,
-- which turns Talent Pool promotion on.
--
-- Safe to run more than once.
--
-- Undo (if HR gets locked out): per table,
--   ALTER TABLE common.<table> DISABLE ROW LEVEL SECURITY;

SET lock_timeout = '5s';

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'candidates',
    'job_requisitions',
    'requisition_approvers',
    'interviews',
    'interview_stages',
    'interview_stage_questions',
    'candidate_communication_templates'
  ] LOOP
    EXECUTE format('ALTER TABLE common.%I ENABLE ROW LEVEL SECURITY', t);

    -- (SELECT ...) makes Postgres check once per query, not once per row.
    EXECUTE format('DROP POLICY IF EXISTS "Recruiting access" ON common.%I', t);
    EXECUTE format(
      'CREATE POLICY "Recruiting access" ON common.%I
         TO authenticated
         USING ((SELECT common.talent_pool_can_access()))
         WITH CHECK ((SELECT common.talent_pool_can_access()))', t);

    EXECUTE format('REVOKE ALL ON TABLE common.%I FROM anon', t);
    EXECUTE format('REVOKE TRUNCATE, REFERENCES, TRIGGER ON TABLE common.%I FROM authenticated', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE common.%I TO authenticated', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE common.%I TO service_role', t);
  END LOOP;
END;
$$;

-- New hires: read-only view of their own applicant record.
DROP POLICY IF EXISTS "New hires read own record" ON common.candidates;
CREATE POLICY "New hires read own record" ON common.candidates
  FOR SELECT
  TO authenticated
  USING (
    linked_user_id = (SELECT auth.uid())
    OR lower(email) = (SELECT common.my_confirmed_email())
  );

-- Applicant-adjacent tables that already have row security: just drop anon.
REVOKE ALL ON TABLE common.eeo_submissions FROM anon;
REVOKE TRUNCATE, REFERENCES, TRIGGER ON TABLE common.eeo_submissions FROM authenticated;
REVOKE TRUNCATE, REFERENCES, TRIGGER ON TABLE common.candidate_question_answers FROM authenticated;
REVOKE TRUNCATE, REFERENCES, TRIGGER ON TABLE common.job_application_questions FROM authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE common.eeo_submissions TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE common.candidate_question_answers TO service_role;

-- Unused views over requisitions; views skip row security, so close them to
-- the public key. (v_public_application_questions stays: the career page
-- needs it and it only shows questions for live postings.)
DO $$
DECLARE
  v text;
BEGIN
  FOREACH v IN ARRAY ARRAY[
    'v_posted_job_requisitions',
    'v_active_job_requisitions',
    'v_pending_approval_requisitions'
  ] LOOP
    IF to_regclass('common.' || v) IS NOT NULL THEN
      EXECUTE format('REVOKE ALL ON TABLE common.%I FROM anon', v);
    END IF;
  END LOOP;
END;
$$;

-- Verify afterward. Every row should show rls = true and anon_select = false,
-- and the last line should say promotion_enabled = true:
--
--   SELECT c.relname,
--          c.relrowsecurity AS rls,
--          has_table_privilege('anon', c.oid, 'SELECT') AS anon_select
--     FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
--    WHERE n.nspname = 'common'
--      AND c.relname IN ('candidates','job_requisitions','requisition_approvers',
--                        'interviews','interview_stages','interview_stage_questions',
--                        'candidate_communication_templates','eeo_submissions',
--                        'candidate_question_answers','job_application_questions')
--    ORDER BY 1;
--
--   SELECT common.talent_pool_promotion_enabled() AS promotion_enabled;
