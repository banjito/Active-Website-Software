-- Lock the 36 neta_ops tables that anyone with the public key could read and change.
-- Written 2026-11-13. Checked against the live database the same day (read only).
--
-- What was wrong:
--   36 neta_ops tables had row security off and were granted to anon. anon is the
--   role behind the public key that ships in the website, so anyone could read,
--   change or delete job assets, contracts, deliverables, breaker reports, etc.
--   Many of these tables also carry old "allow everyone" rules (USING true). They
--   do nothing while security is off, but would wake up and keep the table open
--   the moment security is turned on. So this file deletes them first.
--
-- What this file does (all or nothing, safe to run more than once):
--   1. Staff check (common.is_employee_user) stops trusting the account_type /
--      user_type tags in user_metadata. Any user can set those on their own
--      account. Nobody uses them today (checked live). Staff still pass by email
--      domain (@ampqes.com, @cedsi.com) or by role. Roles are protected by the
--      protect_user_role trigger, so users cannot give themselves one.
--   2. Removes the role from the one @linewerxinc.com account, so it no longer
--      counts as staff. Last login Sep 2025.
--   3. On 34 tables: deletes every old rule, adds one rule "staff only" (same as
--      the breaker and panelboard report tables). Staff see exactly what they see
--      today.
--   4. On meeting_todos and meeting_private_todos: keeps their existing "your own
--      rows only" rules. Both are empty.
--   5. All 36: security on, public key access removed, staff and server access granted.
--
-- If it fails with "canceling statement due to lock timeout": job_assets was busy.
-- Nothing was changed. Just run it again.
--
-- If staff lose access to anything: run lock_neta_ops_open_tables_UNDO.sql.

SET lock_timeout = '5s';

-- 1. Staff check without the self-set tags ---------------------------------
CREATE OR REPLACE FUNCTION common.is_employee_user()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'common', 'public'
AS $function$
  SELECT
    auth.role() = 'authenticated'
    AND (
      -- Employee email domains for this instance.
      lower(coalesce(auth.jwt() ->> 'email', '')) LIKE ANY (
        ARRAY['%@ampqes.com', '%@cedsi.com']
      )
      -- app_metadata can only be set by the server, so it is safe to trust.
      OR lower(coalesce(auth.jwt() -> 'app_metadata'  ->> 'account_type', '')) = 'employee'
      OR lower(coalesce(auth.jwt() -> 'app_metadata'  ->> 'user_type', ''))    = 'employee'
      OR lower(coalesce(auth.jwt() -> 'app_metadata'  ->> 'role', '')) IN (
        -- canonical roles (src/lib/roles.ts)
        'admin',
        'super admin',
        'neta technician',
        'lab technician',
        'office admin',
        'sales representative',
        'engineer',
        'operations manager',
        'hr rep',
        'scav',
        -- legacy / alternate spellings kept for existing accounts
        'manager',
        'supervisor',
        'technician',
        'sales',
        'estimator',
        'engineering',
        'hr_manager',
        'hr_personnel'
      )
      -- user_metadata role is guarded by the protect_user_role trigger.
      OR lower(coalesce(auth.jwt() -> 'user_metadata' ->> 'role', '')) IN (
        'admin',
        'super admin',
        'neta technician',
        'lab technician',
        'office admin',
        'sales representative',
        'engineer',
        'operations manager',
        'hr rep',
        'scav',
        'manager',
        'supervisor',
        'technician',
        'sales',
        'estimator',
        'engineering',
        'hr_manager',
        'hr_personnel'
      )
    );
$function$;

-- 2. linewerxinc.com account is no longer staff ------------------------------
UPDATE auth.users
SET raw_user_meta_data = raw_user_meta_data - 'role'
WHERE lower(email) LIKE '%@linewerxinc.com'
  AND raw_user_meta_data ? 'role';

-- 3-5. Lock the tables --------------------------------------------------------
DO $$
DECLARE
  t text;
  p record;
  staff_tables text[] := ARRAY[
    'job_assets',
    'low_voltage_circuit_breaker_electronic_trip_ats',
    'low_voltage_circuit_breaker_electronic_trip_mts',
    'low_voltage_circuit_breaker_thermal_magnetic_ats',
    'emergency_systems_engine_generator_ats25',
    'generated_documents',
    'custom_form_instances',
    'custom_form_templates',
    'deliverables',
    'job_contracts',
    'job_notes',
    'job_comments',
    'job_costs',
    'job_revenue',
    'job_notifications',
    'signature_profiles',
    'one_line_drawings',
    'equipment_categories',
    'global_equipment_selections',
    'equipment_assignments',
    'calibrations',
    'certificates',
    'maintenance_records',
    'procedures',
    'quality_metrics',
    'vehicles',
    'resources',
    'resource_allocations',
    'technician_assignments',
    'technician_availability',
    'technician_exceptions',
    'asset_reviewers',
    'report_notifications',
    'user_roles'
  ];
  own_row_tables text[] := ARRAY['meeting_todos', 'meeting_private_todos'];
BEGIN
  FOREACH t IN ARRAY staff_tables LOOP
    FOR p IN
      SELECT policyname FROM pg_policies
      WHERE schemaname = 'neta_ops' AND tablename = t
    LOOP
      EXECUTE format('DROP POLICY %I ON neta_ops.%I', p.policyname, t);
    END LOOP;

    EXECUTE format(
      'CREATE POLICY "Employees can manage records" ON neta_ops.%I '
      'USING (common.is_employee_user()) WITH CHECK (common.is_employee_user())',
      t
    );
  END LOOP;

  FOREACH t IN ARRAY staff_tables || own_row_tables LOOP
    EXECUTE format('ALTER TABLE neta_ops.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL ON TABLE neta_ops.%I FROM anon', t);
    EXECUTE format(
      'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE neta_ops.%I TO authenticated, service_role',
      t
    );
  END LOOP;
END $$;

-- Verify. Expect: 36 | 0 | true | false | 0
SELECT
  count(*) FILTER (WHERE c.relrowsecurity)                              AS tables_locked,
  count(*) FILTER (WHERE has_table_privilege('anon', c.oid, 'SELECT'))  AS open_to_public_key,
  (pg_get_functiondef('common.is_employee_user'::regproc) LIKE '%@cedsi.com%') AS cedsi_is_staff,
  (pg_get_functiondef('common.is_employee_user'::regproc)
     ~ $re$'user_metadata'\s*->>\s*'(account_type|user_type)'$re$)    AS self_set_tags_trusted,
  (SELECT count(*) FROM auth.users
    WHERE lower(email) LIKE '%@linewerxinc.com' AND raw_user_meta_data ? 'role') AS linewerx_with_role
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'neta_ops'
  AND c.relname = ANY (ARRAY[
    'job_assets', 'low_voltage_circuit_breaker_electronic_trip_ats',
    'low_voltage_circuit_breaker_electronic_trip_mts',
    'low_voltage_circuit_breaker_thermal_magnetic_ats',
    'emergency_systems_engine_generator_ats25', 'generated_documents',
    'custom_form_instances', 'custom_form_templates', 'deliverables',
    'job_contracts', 'job_notes', 'job_comments', 'job_costs', 'job_revenue',
    'job_notifications', 'signature_profiles', 'one_line_drawings',
    'equipment_categories', 'global_equipment_selections',
    'equipment_assignments', 'calibrations', 'certificates',
    'maintenance_records', 'procedures', 'quality_metrics', 'vehicles',
    'resources', 'resource_allocations', 'technician_assignments',
    'technician_availability', 'technician_exceptions', 'asset_reviewers',
    'report_notifications', 'user_roles', 'meeting_todos',
    'meeting_private_todos'
  ]);
