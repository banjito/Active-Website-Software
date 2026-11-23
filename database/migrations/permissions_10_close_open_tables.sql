-- ampOS Roles & Permissions, item 7 (part 1): close the last tables open to the internet.
--
-- LIVE CHANGE. These 19 tables have no row security and are granted to the public
-- ("anon") key, so anyone with the app's public address could read, change or delete
-- them without logging in: every estimate (with prices), every customer, issue reports,
-- announcements and the old lab calibration reports.
--
-- After this:
--   * Staff (common.is_employee_user(): company email or a staff role) keep full
--     access, exactly like today. Every active staff login passes (checked Nov 23).
--   * A customer login (ampOS ACCESS) reads only its own company row in customers.
--   * No login: no access.
--   * Edge functions (emails, reports, QuickBooks) use the service key: unaffected.
--
-- Old rules already sitting on these tables (never switched on) are removed first:
-- several said "anyone", "any login" or "anyone can add".
--
-- Checked before writing: no no-login page (careers, offer / change order signing,
-- exit survey) reads these tables; lab tables were last written Nov 2025.
--
-- All or nothing.

BEGIN;
SET LOCAL lock_timeout = '5s';

DO $$
DECLARE
  t text;
  s text;
  n text;
  pol record;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'business.estimates',
    'common.customers',
    'common.announcements',
    'common.issue_reports',
    'common.issue_updates',
    'common.issue_attachments',
    'common.issue_interested_parties',
    'lab_ops.calibration_blanket_reports',
    'lab_ops.calibration_bucket_truck_reports',
    'lab_ops.calibration_digger_reports',
    'lab_ops.calibration_gloves_reports',
    'lab_ops.calibration_ground_cable_reports',
    'lab_ops.calibration_hotstick_reports',
    'lab_ops.calibration_line_hose_reports',
    'lab_ops.calibration_sleeve_reports',
    'lab_ops.customer_branding_settings',
    'lab_ops.lab_contacts',
    'lab_ops.meter_template_reports',
    'lab_ops.torque_wrench_reports'
  ] LOOP
    s := split_part(t, '.', 1);
    n := split_part(t, '.', 2);

    -- Old, never-used rules out.
    FOR pol IN SELECT policyname FROM pg_policies WHERE schemaname = s AND tablename = n LOOP
      EXECUTE format('DROP POLICY %I ON %I.%I', pol.policyname, s, n);
    END LOOP;

    -- No-login key: nothing. Logged in: normal reads/writes, never wipe.
    EXECUTE format('REVOKE ALL ON %I.%I FROM anon', s, n);
    EXECUTE format('REVOKE TRUNCATE, REFERENCES, TRIGGER ON %I.%I FROM authenticated', s, n);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %I.%I TO authenticated', s, n);
    EXECUTE format('GRANT ALL ON %I.%I TO service_role', s, n);

    -- Staff, same as today.
    EXECUTE format(
      'CREATE POLICY %I ON %I.%I FOR ALL TO authenticated
         USING ((SELECT common.is_employee_user()))
         WITH CHECK ((SELECT common.is_employee_user()))',
      n || '_staff', s, n);

    EXECUTE format('ALTER TABLE %I.%I ENABLE ROW LEVEL SECURITY', s, n);
  END LOOP;
END $$;

-- A customer login (ACCESS) reads its own company, nothing else.
CREATE POLICY customers_own_company ON common.customers FOR SELECT TO authenticated
  USING (id = (SELECT common.current_customer_id()));

COMMIT;

-- Check (run after): every row should read  true | false
--   select n.nspname || '.' || c.relname, c.relrowsecurity,
--          has_table_privilege('anon', c.oid, 'select')
--     from pg_class c join pg_namespace n on n.oid = c.relnamespace
--    where c.relkind in ('r','p')
--      and (n.nspname, c.relname) in (('business','estimates'), ('common','customers'),
--          ('common','announcements'), ('common','issue_reports'), ('lab_ops','calibration_gloves_reports'))
--    order by 1;
--
-- Check in the app: open an estimate, the customer list, the portal announcements and
-- Features & Fixes. All should look the same as before.
--
-- UNDO for one table if something breaks (example for estimates):
--   ALTER TABLE business.estimates DISABLE ROW LEVEL SECURITY;
