-- Step 2 of 2: lock the HR offer and e-sign tables.
--
-- RUN ONLY AFTER the app update that uses offer_signing_token_functions.sql is
-- live. Before that, the public /sign-offer/:token page still reads these
-- tables directly as anon and would show "Offer not found" to candidates.
--
-- What this does:
--   1. Turns row-level security on for the five tables, with the same
--      staff-only rule ~66 other tables use (common.is_employee_user()).
--   2. Removes every table permission from anon (the public key).
--   3. Removes TRUNCATE from authenticated. Row security does not apply to
--      TRUNCATE, so any logged-in user could otherwise wipe a table.
--   4. Grants service_role so server-side code with the service key works.
--
-- Safe to run more than once.
--
-- Check before running: common.is_employee_user() must return true for every
-- account that uses these in the app: HR staff, offer approvers, and new hires
-- signing onboarding forms (/hr/onboarding/sign-form/...). A new hire on a
-- personal email with no staff role would lose access to their forms. See
-- fix_is_employee_user_roles_and_domains.sql for the rule.
--
-- Undo (if staff get locked out): run, per table,
--   ALTER TABLE common.<table> DISABLE ROW LEVEL SECURITY;

SET lock_timeout = '5s';

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'offers',
    'e_signatures',
    'offer_attachments',
    'onboarding_e_sign_forms',
    'onboarding_e_sign_submissions'
  ] LOOP
    EXECUTE format('ALTER TABLE common.%I ENABLE ROW LEVEL SECURITY', t);

    EXECUTE format('DROP POLICY IF EXISTS "Employees can manage records" ON common.%I', t);
    EXECUTE format(
      'CREATE POLICY "Employees can manage records" ON common.%I
         TO authenticated
         USING (common.is_employee_user())
         WITH CHECK (common.is_employee_user())', t);

    EXECUTE format('REVOKE ALL ON TABLE common.%I FROM anon', t);
    EXECUTE format('REVOKE TRUNCATE, REFERENCES, TRIGGER ON TABLE common.%I FROM authenticated', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE common.%I TO authenticated', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE common.%I TO service_role', t);
  END LOOP;
END;
$$;

-- Afterward, this should list all five with rls = true and anon_select = false:
--   SELECT c.relname, c.relrowsecurity AS rls,
--          has_table_privilege('anon', c.oid, 'select') AS anon_select
--     FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
--    WHERE n.nspname = 'common'
--      AND c.relname IN ('offers','e_signatures','offer_attachments',
--                        'onboarding_e_sign_forms','onboarding_e_sign_submissions');
