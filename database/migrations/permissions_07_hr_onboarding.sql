-- ampOS Roles & Permissions, item 6 (part 2): lock down offers and onboarding.
--
-- LIVE CHANGE. Before this, 19 of these tables had no row security and were open to
-- anyone on the internet (read, edit, delete, even wipe), and offers (with salaries)
-- plus everyone's signed documents were open to every employee.
--
-- Who can see what after this:
--   Offers, offer approvals, offer templates, offer signatures, application answers
--     -> people with the Talent Pool (hr.talent_pool, today Admin + HR) or a Talent Pool
--        member, plus Super Admins. A new hire can read their own offer.
--   Onboarding (tracking, packets, checklists, IT / HR / office tasks, welcome emails,
--   documents to sign and who signed)
--     -> people with "Send documents to sign" (hr.send_documents: Admin, HR, Office Admin)
--        or hr.view_all, plus Super Admins.
--   Everyone signed in still:
--     -> reads the documents they are asked to sign, and signs them
--     -> sees only their OWN signatures (not everyone's)
--   A new hire still sees their own onboarding page, checklist, packet and tasks.
--
-- The public offer-signing link and the public careers page are not affected
-- (they go through their own locked functions).
--
-- All or nothing.

BEGIN;
SET LOCAL lock_timeout = '5s';

-- 1. Helpers ------------------------------------------------------------------

-- Can make and see offers (and recruiting answers).
CREATE FUNCTION common.hr_recruiting_staff() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT common.can('hr.talent_pool')
      OR common.can('hr.view_all')
      OR common.talent_pool_can_access();
$$;

-- Runs onboarding and sends documents to sign.
CREATE FUNCTION common.hr_onboarding_staff() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT common.can('hr.send_documents') OR common.can('hr.view_all');
$$;

-- The signed-in person's own onboarding records (as the new hire).
CREATE FUNCTION common.my_onboarding_ids() RETURNS SETOF uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT t.id
    FROM common.onboarding_tracking t
   WHERE auth.uid() IS NOT NULL
     AND (
       t.user_id = auth.uid()
       OR t.candidate_id IN (
         SELECT c.id FROM common.candidates c
          WHERE c.linked_user_id = auth.uid()
             OR lower(c.email::text) = common.my_confirmed_email()
       )
     );
$$;

-- The signed-in person's own offers (as the new hire).
CREATE FUNCTION common.my_offer_ids() RETURNS SETOF uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT o.id
    FROM common.offers o
   WHERE auth.uid() IS NOT NULL
     AND (
       o.candidate_id IN (
         SELECT c.id FROM common.candidates c
          WHERE c.linked_user_id = auth.uid()
             OR lower(c.email::text) = common.my_confirmed_email()
       )
       OR o.id IN (
         SELECT t.offer_id FROM common.onboarding_tracking t
          WHERE t.id IN (SELECT common.my_onboarding_ids())
       )
     );
$$;

-- Links from the new hire's onboarding to packets, forms, checklists and tasks.
CREATE FUNCTION common.my_onboarding_links(p_kind text) RETURNS SETOF uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT x.id FROM (
    SELECT 'packet'::text AS kind, packet_id AS id, tracking_id FROM common.onboarding_tracking_packets
    UNION ALL SELECT 'form', form_id, tracking_id FROM common.onboarding_tracking_forms
    UNION ALL SELECT 'checklist', checklist_id, tracking_id FROM common.onboarding_tracking_checklists
    UNION ALL SELECT 'it_task', task_id, tracking_id FROM common.onboarding_tracking_it_tasks
    UNION ALL SELECT 'hr_task', task_id, tracking_id FROM common.onboarding_tracking_hr_tasks
    UNION ALL SELECT 'office_task', task_id, tracking_id FROM common.onboarding_tracking_office_admin_tasks
  ) x
  WHERE x.kind = p_kind
    AND x.tracking_id IN (SELECT common.my_onboarding_ids());
$$;

REVOKE ALL ON FUNCTION common.hr_recruiting_staff()      FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION common.hr_onboarding_staff()      FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION common.my_onboarding_ids()        FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION common.my_offer_ids()             FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION common.my_onboarding_links(text)  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION common.hr_recruiting_staff()     TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION common.hr_onboarding_staff()     TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION common.my_onboarding_ids()       TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION common.my_offer_ids()            TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION common.my_onboarding_links(text) TO authenticated, service_role;

-- 2. Close the doors: no internet access, no wiping, row security on ------------

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'offers', 'offer_attachments', 'offer_approvals', 'offer_approvers', 'offer_templates',
    'e_signatures', 'candidate_question_answers',
    'onboarding_tracking', 'onboarding_tracking_packets', 'onboarding_tracking_forms',
    'onboarding_tracking_checklists', 'onboarding_tracking_it_tasks',
    'onboarding_tracking_hr_tasks', 'onboarding_tracking_office_admin_tasks',
    'onboarding_checklists', 'onboarding_checklist_assignments', 'new_hire_packets',
    'hr_tasks', 'it_equipment_tasks', 'office_admin_tasks',
    'welcome_emails', 'welcome_email_sends',
    'onboarding_e_sign_forms', 'onboarding_e_sign_submissions',
    'onboarding_packet_document_signatures'
  ] LOOP
    EXECUTE format('REVOKE ALL ON common.%I FROM anon', t);
    EXECUTE format('REVOKE TRUNCATE, REFERENCES, TRIGGER ON common.%I FROM authenticated', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON common.%I TO authenticated', t);
    EXECUTE format('GRANT ALL ON common.%I TO service_role', t);
    EXECUTE format('ALTER TABLE common.%I ENABLE ROW LEVEL SECURITY', t);
  END LOOP;
END $$;

-- 3. Old "any employee" rules go ---------------------------------------------

DROP POLICY "Employees can manage records" ON common.offers;
DROP POLICY "Employees can manage records" ON common.offer_attachments;
DROP POLICY "Employees can manage records" ON common.e_signatures;
DROP POLICY "Employees can manage records" ON common.onboarding_e_sign_forms;
DROP POLICY "Employees can manage records" ON common.onboarding_e_sign_submissions;
DROP POLICY "Employees read application answers" ON common.candidate_question_answers;

-- 4. Offers and recruiting: recruiting staff -----------------------------------

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'offers', 'offer_attachments', 'offer_approvals', 'offer_approvers', 'offer_templates',
    'e_signatures', 'candidate_question_answers'
  ] LOOP
    EXECUTE format(
      'CREATE POLICY %I ON common.%I FOR ALL TO authenticated
         USING ((SELECT common.hr_recruiting_staff()))
         WITH CHECK ((SELECT common.hr_recruiting_staff()))',
      t || '_recruiting_staff', t);
  END LOOP;
END $$;

-- A new hire reads their own offer (job title on their onboarding page).
CREATE POLICY offers_new_hire_read ON common.offers FOR SELECT TO authenticated
  USING (id IN (SELECT common.my_offer_ids()));

-- 5. Onboarding: onboarding staff ----------------------------------------------

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'onboarding_tracking', 'onboarding_tracking_packets', 'onboarding_tracking_forms',
    'onboarding_tracking_checklists', 'onboarding_tracking_it_tasks',
    'onboarding_tracking_hr_tasks', 'onboarding_tracking_office_admin_tasks',
    'onboarding_checklists', 'onboarding_checklist_assignments', 'new_hire_packets',
    'hr_tasks', 'it_equipment_tasks', 'office_admin_tasks',
    'welcome_emails', 'welcome_email_sends',
    'onboarding_e_sign_forms', 'onboarding_e_sign_submissions',
    'onboarding_packet_document_signatures'
  ] LOOP
    EXECUTE format(
      'CREATE POLICY %I ON common.%I FOR ALL TO authenticated
         USING ((SELECT common.hr_onboarding_staff()))
         WITH CHECK ((SELECT common.hr_onboarding_staff()))',
      t || '_onboarding_staff', t);
  END LOOP;
END $$;

-- 6. The new hire's own onboarding ---------------------------------------------

CREATE POLICY onboarding_tracking_own ON common.onboarding_tracking FOR SELECT TO authenticated
  USING (id IN (SELECT common.my_onboarding_ids()));

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'onboarding_tracking_packets', 'onboarding_tracking_forms',
    'onboarding_tracking_checklists', 'onboarding_tracking_it_tasks',
    'onboarding_tracking_hr_tasks', 'onboarding_tracking_office_admin_tasks'
  ] LOOP
    EXECUTE format(
      'CREATE POLICY %I ON common.%I FOR SELECT TO authenticated
         USING (tracking_id IN (SELECT common.my_onboarding_ids()))',
      t || '_own', t);
  END LOOP;
END $$;

-- Packets and checklists: employees read them (they're company templates), and a new
-- hire reads the ones on their onboarding.
CREATE POLICY new_hire_packets_read ON common.new_hire_packets FOR SELECT TO authenticated
  USING (
    (SELECT common.is_employee_user())
    OR employee_id = (SELECT auth.uid())
    OR id IN (SELECT common.my_onboarding_links('packet'))
  );
CREATE POLICY onboarding_checklists_read ON common.onboarding_checklists FOR SELECT TO authenticated
  USING (
    (SELECT common.is_employee_user())
    OR employee_id = (SELECT auth.uid())
    OR id IN (SELECT common.my_onboarding_links('checklist'))
  );

-- A new hire ticks off their own checklist.
CREATE POLICY onboarding_checklist_assignments_own ON common.onboarding_checklist_assignments
  FOR ALL TO authenticated
  USING (employee_id = (SELECT auth.uid()))
  WITH CHECK (employee_id = (SELECT auth.uid()));

-- Tasks: the person assigned, the new hire it's for, or linked to their onboarding.
CREATE POLICY it_equipment_tasks_own ON common.it_equipment_tasks FOR SELECT TO authenticated
  USING (
    assigned_to_user_id = (SELECT auth.uid())
    OR employee_id = (SELECT auth.uid())
    OR id IN (SELECT common.my_onboarding_links('it_task'))
  );
CREATE POLICY hr_tasks_own ON common.hr_tasks FOR SELECT TO authenticated
  USING (
    assigned_to_user_id = (SELECT auth.uid())
    OR employee_id = (SELECT auth.uid())
    OR id IN (SELECT common.my_onboarding_links('hr_task'))
  );
CREATE POLICY office_admin_tasks_own ON common.office_admin_tasks FOR SELECT TO authenticated
  USING (
    assigned_to_user_id = (SELECT auth.uid())
    OR employee_id = (SELECT auth.uid())
    OR id IN (SELECT common.my_onboarding_links('office_task'))
  );

-- 7. Documents to sign ---------------------------------------------------------

-- Everyone signed in reads the documents (the portal and "Documents to sign" list them).
CREATE POLICY onboarding_e_sign_forms_read ON common.onboarding_e_sign_forms FOR SELECT TO authenticated
  USING (
    (SELECT common.is_employee_user())
    OR employee_id = (SELECT auth.uid())
    OR id IN (SELECT common.my_onboarding_links('form'))
  );

-- Signatures: you see and add only your own.
CREATE POLICY onboarding_e_sign_submissions_own_read ON common.onboarding_e_sign_submissions
  FOR SELECT TO authenticated
  USING (
    employee_id = (SELECT auth.uid())
    OR lower(signer_email) = (SELECT common.my_confirmed_email())
  );
CREATE POLICY onboarding_e_sign_submissions_own_sign ON common.onboarding_e_sign_submissions
  FOR INSERT TO authenticated
  WITH CHECK (lower(signer_email) = (SELECT common.my_confirmed_email()));

CREATE POLICY onboarding_packet_document_signatures_own_read ON common.onboarding_packet_document_signatures
  FOR SELECT TO authenticated
  USING (lower(signer_email) = (SELECT common.my_confirmed_email()));
CREATE POLICY onboarding_packet_document_signatures_own_sign ON common.onboarding_packet_document_signatures
  FOR INSERT TO authenticated
  WITH CHECK (lower(signer_email) = (SELECT common.my_confirmed_email()));

COMMIT;

-- Quick check (run after): every row should say true | 0.
--   select c.relname, c.relrowsecurity, has_table_privilege('anon', c.oid, 'select')::int
--     from pg_class c
--    where c.relnamespace = 'common'::regnamespace
--      and c.relname ~ '^(offer|onboarding|e_signatures|new_hire_packets|hr_tasks|it_equipment_tasks|office_admin_tasks|welcome_email|candidate_question)'
--    order by 1;
--
-- Check in the app:
--   HR / Admin: Offers, Onboarding tracking and Document acknowledgment look the same.
--   A field tech: the portal still asks them to sign documents, and signing works.
--   A field tech: Document acknowledgment shows only their own signatures.
