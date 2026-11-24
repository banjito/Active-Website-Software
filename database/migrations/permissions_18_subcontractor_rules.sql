-- ampOS Roles & Permissions, item 8 part 2a: what an invited subcontractor can see and do.
--
-- LIVE CHANGE, but nobody is a subcontractor yet, so nothing changes for anyone today.
-- Staff rules are untouched. These rules only ever match a person listed in
-- common.external_users (not removed) on a job in common.external_job_access.
--
-- An invited subcontractor (Jack, Nov 23):
--   - sees the jobs they're invited to, that job's customer name and site;
--   - sees every report on those jobs (all 68 report types, plus custom forms);
--   - can start reports and edit their own, and add photos ("Fill in test reports");
--   - can't delete anything, and sees no documents, drawings, money, contacts or HR.
--
-- Also closes 6 "any login" rules part 1 missed: job photos, quote notes,
-- Features & Fixes notes, and three HR lists.
--
-- All or nothing.

BEGIN;
SET LOCAL lock_timeout = '5s';

-- 0. Shared checks -----------------------------------------------------------------

-- A subcontractor who may fill in reports
CREATE OR REPLACE FUNCTION common.subcontractor_can_fill() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO ''
AS $$ SELECT common.is_subcontractor() AND common.can('reports.fill'); $$;

-- A job photo or report photo in a job the subcontractor is invited to.
-- Folders: job-pictures/<job>/..., report-photos/<job>/..., report-photos-inline/<job>/...
CREATE OR REPLACE FUNCTION common.subcontractor_job_file(p_bucket text, p_name text) RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO ''
AS $$
DECLARE
  v_top text := split_part(p_name, '/', 1);
  v_job text := split_part(p_name, '/', 2);
BEGIN
  IF p_bucket IS DISTINCT FROM 'job-documents'
     OR v_top NOT IN ('job-pictures', 'report-photos', 'report-photos-inline')
     OR v_job !~ '^[0-9a-fA-F-]{36}$'
  THEN
    RETURN false;
  END IF;
  RETURN common.is_invited_to_job(v_job::uuid);
END;
$$;

REVOKE ALL ON FUNCTION common.subcontractor_can_fill(), common.subcontractor_job_file(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION common.subcontractor_can_fill(), common.subcontractor_job_file(text, text) TO authenticated, service_role;

-- 1. Reports: read every report on the job; start and edit your own ------------------

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'neta_ops.applied_voltage_test_ats_reports',
    'neta_ops.automatic_transfer_switch_ats_reports',
    'neta_ops.contactor_vt_test_reports',
    'neta_ops.current_transformer_test_ats_reports',
    'neta_ops.current_transformer_test_mts_reports',
    'neta_ops.custom_form_instances',
    'neta_ops.emergency_systems_engine_generator_ats25',
    'neta_ops.energized_work_permit_reports',
    'neta_ops.gfi_trip_test_reports',
    'neta_ops.grounding_fall_of_potential_slope_method_test_reports',
    'neta_ops.grounding_system_master_reports',
    'neta_ops.job_hazard_analysis_reports',
    'neta_ops.large_dry_type_transformer_mts_reports',
    'neta_ops.large_dry_type_xfmr_mts23_reports',
    'neta_ops.large_dry_type_xfmr_mts_reports',
    'neta_ops.large_transformer_reports',
    'neta_ops.liquid_filled_transformer_reports',
    'neta_ops.liquid_filled_xfmr_ats25_reports',
    'neta_ops.liquid_xfmr_visual_mts_reports',
    'neta_ops.low_voltage_air_switch_mts23_reports',
    'neta_ops.low_voltage_cable_mts23_reports',
    'neta_ops.low_voltage_cable_test_12sets',
    'neta_ops.low_voltage_cable_test_12sets_mts',
    'neta_ops.low_voltage_cable_test_20sets',
    'neta_ops.low_voltage_cable_test_3sets',
    'neta_ops.low_voltage_circuit_breaker_electronic_trip_ats',
    'neta_ops.low_voltage_circuit_breaker_electronic_trip_mts',
    'neta_ops.low_voltage_circuit_breaker_thermal_magnetic_ats',
    'neta_ops.low_voltage_circuit_breaker_thermal_magnetic_mts_reports',
    'neta_ops.low_voltage_panelboard_small_breaker_reports',
    'neta_ops.low_voltage_switch_maint_mts_reports',
    'neta_ops.low_voltage_switch_multi_device_reports',
    'neta_ops.low_voltage_switch_multi_device_test_reports',
    'neta_ops.low_voltage_switch_reports',
    'neta_ops.lv_circuit_breaker_mts23_reports',
    'neta_ops.lv_circuit_breaker_mts25',
    'neta_ops.lv_molded_case_circuit_breaker_ats25',
    'neta_ops.medium_voltage_cable_vlf_tan_delta_mts23_reports',
    'neta_ops.medium_voltage_cable_vlf_test',
    'neta_ops.medium_voltage_cable_vlf_test_reports',
    'neta_ops.medium_voltage_circuit_breaker_mts_reports',
    'neta_ops.medium_voltage_circuit_breaker_reports',
    'neta_ops.medium_voltage_motor_starter_mts_reports',
    'neta_ops.medium_voltage_switch_mts_reports',
    'neta_ops.medium_voltage_switch_oil_reports',
    'neta_ops.medium_voltage_switch_sf6_reports',
    'neta_ops.medium_voltage_vacuum_breaker_mts23_reports',
    'neta_ops.medium_voltage_vlf_mts_reports',
    'neta_ops.medium_voltage_vlf_reports',
    'neta_ops.metal_enclosed_busway_mts23_reports',
    'neta_ops.metal_enclosed_busway_reports',
    'neta_ops.oil_inspection_reports',
    'neta_ops.panelboard_assemblies_ats25_reports',
    'neta_ops.panelboard_reports',
    'neta_ops.potential_transformer_ats_reports',
    'neta_ops.small_dry_type_xfmr_mts23_reports',
    'neta_ops.small_lv_dry_type_transformer_ats25_reports',
    'neta_ops.switchgear_panelboard_mts_reports',
    'neta_ops.switchgear_reports',
    'neta_ops.switchgear_switchboard_ats25_reports',
    'neta_ops.switchgear_switchboard_mts23_reports',
    'neta_ops.tan_delta_test_mts',
    'neta_ops.tandelta_mts_reports',
    'neta_ops.tandelta_reports',
    'neta_ops.transformer_reports',
    'neta_ops.two_small_dry_type_xfmr_ats_reports',
    'neta_ops.two_small_dry_type_xfmr_mts_reports',
    'neta_ops.voltage_potential_transformer_mts_reports'
  ] LOOP
    EXECUTE format('DROP POLICY IF EXISTS subs_read ON %s', t);
    EXECUTE format('DROP POLICY IF EXISTS subs_add ON %s', t);
    EXECUTE format('DROP POLICY IF EXISTS subs_edit ON %s', t);
    EXECUTE format(
      'CREATE POLICY subs_read ON %s FOR SELECT TO authenticated '
      'USING ((SELECT common.is_subcontractor()) AND common.is_invited_to_job(job_id))', t);
    EXECUTE format(
      'CREATE POLICY subs_add ON %s FOR INSERT TO authenticated '
      'WITH CHECK ((SELECT common.subcontractor_can_fill()) AND user_id = auth.uid() AND common.is_invited_to_job(job_id))', t);
    EXECUTE format(
      'CREATE POLICY subs_edit ON %s FOR UPDATE TO authenticated '
      'USING ((SELECT common.subcontractor_can_fill()) AND user_id = auth.uid() AND common.is_invited_to_job(job_id)) '
      'WITH CHECK ((SELECT common.subcontractor_can_fill()) AND user_id = auth.uid() AND common.is_invited_to_job(job_id))', t);
  END LOOP;

  -- These 11 also carry part 1's staff-only rule: let invited subcontractors through it.
  FOREACH t IN ARRAY ARRAY[
    'neta_ops.energized_work_permit_reports',
    'neta_ops.large_dry_type_xfmr_mts23_reports',
    'neta_ops.low_voltage_air_switch_mts23_reports',
    'neta_ops.low_voltage_cable_mts23_reports',
    'neta_ops.lv_circuit_breaker_mts23_reports',
    'neta_ops.lv_circuit_breaker_mts25',
    'neta_ops.medium_voltage_cable_vlf_tan_delta_mts23_reports',
    'neta_ops.medium_voltage_vacuum_breaker_mts23_reports',
    'neta_ops.metal_enclosed_busway_mts23_reports',
    'neta_ops.small_dry_type_xfmr_mts23_reports',
    'neta_ops.switchgear_switchboard_mts23_reports'
  ] LOOP
    EXECUTE format(
      'ALTER POLICY logins_staff_only ON %s '
      'USING ((SELECT common.is_employee_user()) OR common.is_invited_to_job(job_id)) '
      'WITH CHECK ((SELECT common.is_employee_user()) OR common.is_invited_to_job(job_id))', t);
  END LOOP;
END $$;

-- 2. Report pointers and their job links ---------------------------------------------

DROP POLICY IF EXISTS subs_read ON neta_ops.job_assets;
CREATE POLICY subs_read ON neta_ops.job_assets FOR SELECT TO authenticated
  USING ((SELECT common.is_subcontractor()) AND common.is_invited_to_job(job_id));
DROP POLICY IF EXISTS subs_add ON neta_ops.job_assets;
CREATE POLICY subs_add ON neta_ops.job_assets FOR INSERT TO authenticated
  WITH CHECK ((SELECT common.subcontractor_can_fill()) AND common.is_invited_to_job(job_id));

DROP POLICY IF EXISTS subs_read ON neta_ops.assets;
CREATE POLICY subs_read ON neta_ops.assets FOR SELECT TO authenticated
  USING ((SELECT common.is_subcontractor()) AND (
    user_id = auth.uid()
    OR EXISTS (SELECT 1 FROM neta_ops.job_assets ja
                WHERE ja.asset_id = assets.id AND common.is_invited_to_job(ja.job_id))));
DROP POLICY IF EXISTS subs_add ON neta_ops.assets;
CREATE POLICY subs_add ON neta_ops.assets FOR INSERT TO authenticated
  WITH CHECK ((SELECT common.subcontractor_can_fill()) AND user_id = auth.uid());
DROP POLICY IF EXISTS subs_edit ON neta_ops.assets;
CREATE POLICY subs_edit ON neta_ops.assets FOR UPDATE TO authenticated
  USING ((SELECT common.subcontractor_can_fill()) AND user_id = auth.uid())
  WITH CHECK ((SELECT common.subcontractor_can_fill()) AND user_id = auth.uid());

DROP POLICY IF EXISTS subs_read ON neta_ops.report_numbers;
CREATE POLICY subs_read ON neta_ops.report_numbers FOR SELECT TO authenticated
  USING ((SELECT common.is_subcontractor()) AND common.is_invited_to_job(job_id));

-- 3. The job, its customer's name and its site ----------------------------------------

DROP POLICY IF EXISTS subs_read ON neta_ops.jobs;
CREATE POLICY subs_read ON neta_ops.jobs FOR SELECT TO authenticated
  USING ((SELECT common.is_subcontractor()) AND common.is_invited_to_job(id));

DROP POLICY IF EXISTS subs_read ON common.customers;
CREATE POLICY subs_read ON common.customers FOR SELECT TO authenticated
  USING ((SELECT common.is_subcontractor()) AND EXISTS (
    SELECT 1 FROM neta_ops.jobs j WHERE j.customer_id = customers.id AND common.is_invited_to_job(j.id)));

DROP POLICY IF EXISTS subs_read ON common.sites;
CREATE POLICY subs_read ON common.sites FOR SELECT TO authenticated
  USING ((SELECT common.is_subcontractor()) AND EXISTS (
    SELECT 1 FROM neta_ops.jobs j WHERE j.site_id = sites.id AND common.is_invited_to_job(j.id)));

-- 4. Job photos: staff, or a subcontractor on that job (was: any login) ------------------

DROP POLICY IF EXISTS logins_staff_only ON neta_ops.job_pictures;
CREATE POLICY logins_staff_only ON neta_ops.job_pictures AS RESTRICTIVE FOR ALL TO authenticated
  USING ((SELECT common.is_employee_user()) OR common.is_invited_to_job(job_id))
  WITH CHECK ((SELECT common.is_employee_user()) OR common.is_invited_to_job(job_id));

-- 5. Report forms: subcontractors read the templates and lookups, never change them -----

DROP POLICY IF EXISTS subs_read ON neta_ops.custom_form_templates;
CREATE POLICY subs_read ON neta_ops.custom_form_templates FOR SELECT TO authenticated
  USING ((SELECT common.is_subcontractor()));

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'neta_ops.custom_form_component_defaults', 'neta_ops.custom_form_lookup_tables',
    'neta_ops.custom_form_saved_components', 'neta_ops.custom_form_template_versions',
    'neta_ops.neta_sections'
  ] LOOP
    EXECUTE format(
      'ALTER POLICY logins_staff_only ON %s '
      'USING ((SELECT common.is_employee_user()) OR (SELECT common.is_subcontractor())) '
      'WITH CHECK ((SELECT common.is_employee_user()))', t);
  END LOOP;
END $$;

-- 6. Leftovers part 1 missed: staff only -----------------------------------------------

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'business.opportunity_notes', 'common.issue_notes',
    'hr.candidates', 'hr.holidays', 'hr.leave_types'
  ] LOOP
    EXECUTE format('DROP POLICY IF EXISTS logins_staff_only ON %s', t);
    EXECUTE format(
      'CREATE POLICY logins_staff_only ON %s AS RESTRICTIVE FOR ALL TO authenticated '
      'USING ((SELECT common.is_employee_user())) WITH CHECK ((SELECT common.is_employee_user()))', t);
  END LOOP;
END $$;

-- 7. Files: job photos and report photos for invited jobs ------------------------------

DO $$
DECLARE
  v_qual  text;
  v_check text;
BEGIN
  SELECT qual, coalesce(with_check, qual) INTO v_qual, v_check
    FROM pg_policies
   WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'Files: staff, or your own';
  IF v_qual IS NULL THEN
    RAISE EXCEPTION 'Stopped: the "Files: staff, or your own" rule is missing. Nothing changed.';
  END IF;
  IF position('subcontractor_job_file' in v_qual) = 0 THEN
    EXECUTE format(
      'ALTER POLICY "Files: staff, or your own" ON storage.objects USING ((%s) OR common.subcontractor_job_file(bucket_id, name)) '
      'WITH CHECK ((%s) OR common.subcontractor_job_file(bucket_id, name))', v_qual, v_check);
  END IF;
END $$;

DROP POLICY IF EXISTS "Subcontractors read job photos" ON storage.objects;
CREATE POLICY "Subcontractors read job photos" ON storage.objects FOR SELECT TO authenticated
  USING ((SELECT common.is_subcontractor()) AND common.subcontractor_job_file(bucket_id, name));
DROP POLICY IF EXISTS "Subcontractors add job photos" ON storage.objects;
CREATE POLICY "Subcontractors add job photos" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK ((SELECT common.subcontractor_can_fill()) AND common.subcontractor_job_file(bucket_id, name));

COMMIT;

-- Checks (run after): expect 68 | 0
--   select (select count(*) from pg_policies where policyname = 'subs_read' and schemaname = 'neta_ops'
--             and tablename not in ('job_assets','assets','report_numbers','jobs','custom_form_templates')),
--          (select count(*) from common.external_users);
