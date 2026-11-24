-- Remove the Lab portal and the old Armadillo / Calibration data (2026-11-24).
--
-- lab_ops held Armadillo + Calibration jobs, inventory and calibration reports.
-- Nothing in it changed after 2025-11-05; both businesses run on their own
-- sites now (armadillobase.vercel.app, ampcalos.io) and neither reads this
-- database. The app code that used it is gone.
--
-- Backup taken before this ran:
--   ~/Documents/ampOS-backups/lab_ops_2026-11-24.dump  (all 38 tables + data)
--   Restore: pg_restore -d <db url> lab_ops_2026-11-24.dump
--
-- BEFORE RUNNING: Supabase dashboard -> Project Settings -> Data API ->
-- Exposed schemas: remove lab_ops and save. The API can stop loading if it is
-- told to serve a schema that no longer exists.
--
-- If it fails with "lock timeout", someone was busy on a linked table
-- (auth.users). Just run it again.

SET lock_timeout = '5s';

BEGIN;

-- 1. Views outside lab_ops that read it (probably an old Android app).
DROP VIEW IF EXISTS common.android_lab_customers;
DROP VIEW IF EXISTS common.android_lab_jobs;
DROP VIEW IF EXISTS public.android_lab_customers;
DROP VIEW IF EXISTS public.android_lab_jobs;

-- 2. The schema: every table, its triggers and its own functions.
DROP SCHEMA IF EXISTS lab_ops CASCADE;

-- 3. Lab helper functions that live outside lab_ops. Nothing calls them.
DROP FUNCTION IF EXISTS extensions.create_lab_job_with_customer_check(jsonb);
DROP FUNCTION IF EXISTS extensions.toggle_customer_portal_access(uuid, boolean);
DROP FUNCTION IF EXISTS extensions.send_calibration_ready_to_bill_notification();
DROP FUNCTION IF EXISTS extensions.test_ready_to_bill_data(uuid);
DROP FUNCTION IF EXISTS extensions.is_lab_customer(uuid);
DROP FUNCTION IF EXISTS extensions.assign_lab_customer_role(uuid);
DROP FUNCTION IF EXISTS public.get_asset_id_by_report_id(uuid);
DROP FUNCTION IF EXISTS public.get_common_locations();

-- 4. Lab Tech role (7 people, all already disabled, no other role) and the
--    Lab portal permission. Role ticks and overrides go with them (cascade).
DELETE FROM common.user_roles WHERE role_key = 'lab_tech';
DELETE FROM common.roles WHERE key = 'lab_tech';
DELETE FROM common.permissions WHERE key = 'portal.lab';

-- 5. Division rows. No job, equipment, profile or schedule row uses them.
DELETE FROM common.divisions WHERE id IN ('lab', 'calibration', 'armadillo');

COMMIT;

NOTIFY pgrst, 'reload schema';
