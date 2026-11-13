-- UNDO for lock_neta_ops_open_tables.sql (2026-11-13).
-- Only run this if staff lose access to something after the fix.
-- It reopens all 36 tables exactly as they were: security off, public key access back.
-- It leaves the staff check change and the linewerxinc.com change alone. Neither
-- can lock out staff.
--
-- To reopen just ONE table instead, run these two lines with its name:
--   ALTER TABLE neta_ops.job_assets DISABLE ROW LEVEL SECURITY;
--   GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE neta_ops.job_assets TO anon;

SET lock_timeout = '5s';

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
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
  ] LOOP
    EXECUTE format('ALTER TABLE neta_ops.%I DISABLE ROW LEVEL SECURITY', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE neta_ops.%I TO anon', t);
  END LOOP;
END $$;

-- Verify. Expect: 0 tables still locked.
SELECT count(*) AS tables_still_locked
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'neta_ops' AND c.relrowsecurity
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
