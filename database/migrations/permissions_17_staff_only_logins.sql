-- ampOS Roles & Permissions, item 8 part 1: logins that aren't staff see nothing by default.
--
-- LIVE CHANGE. Staff see no difference. It closes the gap before any outside person
-- (a subcontractor, a customer) logs in to ampOS itself:
--
--   1. 106 tables any login could read now say "staff only" (one extra rule each).
--   2. 17 tables had no row rules at all. They get them: staff keep full access.
--      common.profiles: everyone reads staff profiles; you edit your own; editing
--      someone else's needs "Invite and remove people", "See everyone's HR files" or
--      "Payroll"; deleting needs "Invite and remove people".
--   3. 12 views (read with the owner's rights) now return rows to staff only.
--      The 3 views the public website reads are left alone.
--   4. Groundwork for subcontractors, not switched on: their tables, two checks, and
--      a new tick "Invite subcontractors" (Admin and Project Manager). No screen uses
--      it yet. Item 8 part 2 adds "or invited to this job" to the job and report rules.
--
-- Customer portal (ACCESS) is unaffected: it reads through its own functions and its
-- own rules on customers and jobs. Test with a customer login after running.
--
-- "Staff" = common.is_employee_user(): company email domain or a staff role name.
-- Checked Nov 24: all 51 active people with a role pass it.
--
-- All or nothing.

BEGIN;
SET LOCAL lock_timeout = '5s';

-- 1. Staff-only rule on tables any login could read ------------------------------------

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'business.estimating_presets',
    'business.estimating_scope_library_item_components',
    'business.estimating_scope_library_item_equipment',
    'business.estimating_scope_library_items',
    'business.estimating_test_equipment',
    'business.letter_proposals',
    'business.opportunities',
    'business.opportunity_merge_groups',
    'business.opportunity_merge_members',
    'business.opportunity_rfi_log',
    'business.opportunity_rfis',
    'business.proposal_scope_notes',
    'common.amp_contacts',
    'common.app_settings',
    'common.article_publishers',
    'common.chat_messages',
    'common.chat_rooms',
    'common.contact_notes',
    'common.contacts',
    'common.custom_roles',
    'common.customer_categories',
    'common.customer_interactions',
    'common.customer_surveys',
    'common.divisions',
    'common.documents',
    'common.employee_certifications',
    'common.feature_requests',
    'common.help_center_documents',
    'common.job_skill_requirements',
    'common.job_title_history',
    'common.notification_hidden_jobs',
    'common.org_chart_assignments',
    'common.permissions',
    'common.role_audit_logs',
    'common.role_permissions',
    'common.roles',
    'common.schedule_hidden_people',
    'common.schedule_job_colors',
    'common.survey_questions',
    'common.survey_responses',
    'common.survey_templates',
    'common.system_config',
    'common.technician_assignments',
    'common.technician_availability',
    'common.technician_exceptions',
    'common.technician_skills',
    'common.time_jobs',
    'common.time_settings',
    'common.user_room_status',
    'common.user_xp',
    'common.xp_entries',
    'lab_ops.account_requests',
    'lab_ops.armadillo_inventory',
    'lab_ops.armadillo_inventory_log',
    'lab_ops.blanket_test_history',
    'lab_ops.bucket_truck_test_history',
    'lab_ops.calibrations',
    'lab_ops.customer_asset_counters',
    'lab_ops.digger_test_history',
    'lab_ops.equipment',
    'lab_ops.global_equipment_selections',
    'lab_ops.glove_test_history',
    'lab_ops.ground_cable_test_history',
    'lab_ops.hotstick_test_history',
    'lab_ops.job_comments',
    'lab_ops.job_products',
    'lab_ops.lab_assets',
    'lab_ops.lab_customers',
    'lab_ops.lab_job_technicians',
    'lab_ops.lab_jobs',
    'lab_ops.lab_technicians',
    'lab_ops.line_hose_test_history',
    'lab_ops.service_requests',
    'lab_ops.sleeve_test_history',
    'lab_ops.torque_wrench_test_history',
    'neta_ops.change_order_signatures',
    'neta_ops.custom_form_component_defaults',
    'neta_ops.custom_form_lookup_tables',
    'neta_ops.custom_form_saved_components',
    'neta_ops.custom_form_template_versions',
    'neta_ops.energized_work_permit_reports',
    'neta_ops.equipment_job_sites',
    'neta_ops.equipment_locations',
    'neta_ops.equipment_sub_component_items',
    'neta_ops.equipment_trucks',
    'neta_ops.field_equipment',
    'neta_ops.field_equipment_assignments',
    'neta_ops.job_change_orders',
    'neta_ops.job_checklist_events',
    'neta_ops.job_checklist_items',
    'neta_ops.job_checklist_steps',
    'neta_ops.job_delays',
    'neta_ops.job_sov_lines',
    'neta_ops.large_dry_type_xfmr_mts23_reports',
    'neta_ops.low_voltage_air_switch_mts23_reports',
    'neta_ops.low_voltage_cable_mts23_reports',
    'neta_ops.lv_circuit_breaker_mts23_reports',
    'neta_ops.lv_circuit_breaker_mts25',
    'neta_ops.medium_voltage_cable_vlf_tan_delta_mts23_reports',
    'neta_ops.medium_voltage_vacuum_breaker_mts23_reports',
    'neta_ops.metal_enclosed_busway_mts23_reports',
    'neta_ops.miscellaneous_documents',
    'neta_ops.neta_sections',
    'neta_ops.small_dry_type_xfmr_mts23_reports',
    'neta_ops.switchgear_switchboard_mts23_reports',
    'public.after_action_reports'
  ] LOOP
    EXECUTE format('DROP POLICY IF EXISTS logins_staff_only ON %s', t);
    EXECUTE format(
      'CREATE POLICY logins_staff_only ON %s AS RESTRICTIVE FOR ALL TO authenticated '
      'USING ((SELECT common.is_employee_user())) WITH CHECK ((SELECT common.is_employee_user()))', t);
  END LOOP;
END $$;

-- 2. Tables with no row rules ----------------------------------------------------------

-- Old quote documents (the app reads business.opportunity_documents now). Its five
-- "any login" rules start counting once row rules are on, so it gets the staff rule too.
ALTER TABLE business.subcontractor_agreements ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS logins_staff_only ON business.subcontractor_agreements;
CREATE POLICY logins_staff_only ON business.subcontractor_agreements AS RESTRICTIVE FOR ALL TO authenticated
  USING ((SELECT common.is_employee_user())) WITH CHECK ((SELECT common.is_employee_user()));

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'common.chat_room_members', 'common.notification_logs', 'common.org_chart_levels',
    'common.org_chart_manager_group_members', 'common.org_chart_manager_groups',
    'common.org_chart_roles', 'common.system_logs', 'common.vendor_contacts',
    'common.vendor_contracts', 'common.vendor_po_items', 'common.vendor_pos',
    'common.vendors', 'public.vendor_contacts', 'public.vendor_contracts', 'public.vendors'
  ] LOOP
    EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS staff_all ON %s', t);
    EXECUTE format(
      'CREATE POLICY staff_all ON %s FOR ALL TO authenticated '
      'USING ((SELECT common.is_employee_user())) WITH CHECK ((SELECT common.is_employee_user()))', t);
  END LOOP;
END $$;

-- Staff profiles
ALTER TABLE common.profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all authenticated users to access profiles" ON common.profiles;
DROP POLICY IF EXISTS allow_all_authenticated_select_profiles ON common.profiles;
DROP POLICY IF EXISTS allow_authenticated_update_profiles ON common.profiles;

CREATE POLICY profiles_read ON common.profiles FOR SELECT TO authenticated
  USING (id = auth.uid() OR (SELECT common.is_employee_user()));
CREATE POLICY profiles_insert ON common.profiles FOR INSERT TO authenticated
  WITH CHECK (id = auth.uid()
              OR (SELECT common.can('admin.manage_users'))
              OR (SELECT common.can('hr.view_all')));
CREATE POLICY profiles_update ON common.profiles FOR UPDATE TO authenticated
  USING (id = auth.uid()
         OR (SELECT common.can('admin.manage_users'))
         OR (SELECT common.can('hr.view_all'))
         OR (SELECT common.can('hr.payroll')))
  WITH CHECK (id = auth.uid()
              OR (SELECT common.can('admin.manage_users'))
              OR (SELECT common.can('hr.view_all'))
              OR (SELECT common.can('hr.payroll')));
CREATE POLICY profiles_delete ON common.profiles FOR DELETE TO authenticated
  USING ((SELECT common.can('admin.manage_users')));

-- 3. Views read with the owner's rights: staff rows only --------------------------------

DO $$
DECLARE
  v text;
  def text;
BEGIN
  FOREACH v IN ARRAY ARRAY[
    'common.android_lab_customers', 'common.android_lab_jobs', 'common.available_technicians',
    'common.chat_message_stats', 'common.encryption_status', 'common.message_retention_stats',
    'common.prayer_wall_feed', 'common.technicians', 'neta_ops.available_technicians',
    'neta_ops.deleted_reports_view', 'public.android_lab_customers', 'public.android_lab_jobs'
  ] LOOP
    def := rtrim(btrim(pg_get_viewdef(v::regclass)), ';');
    EXECUTE format(
      'CREATE OR REPLACE VIEW %s AS SELECT v.* FROM (%s) v WHERE (SELECT common.is_employee_user())', v, def);
  END LOOP;
END $$;
ALTER VIEW common.prayer_wall_feed SET (security_barrier = true);

-- 4. Subcontractor groundwork (not switched on) ------------------------------------------

INSERT INTO common.permissions (key, area, label, description, sort_order)
VALUES ('jobs.invite_subcontractors', 'Jobs', 'Invite subcontractors',
        'Invite an outside subcontractor to a job, and remove them', 365)
ON CONFLICT (key) DO NOTHING;
INSERT INTO common.role_permissions (role_key, permission_key)
VALUES ('admin', 'jobs.invite_subcontractors'), ('project_manager', 'jobs.invite_subcontractors')
ON CONFLICT DO NOTHING;

-- Who is an outside subcontractor. Access lasts until removed (Jack, Nov 23).
CREATE TABLE IF NOT EXISTS common.external_users (
  user_id    uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  company    text NOT NULL,
  invited_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  invited_at timestamptz NOT NULL DEFAULT now(),
  removed_at timestamptz,
  removed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

-- Which jobs each subcontractor is invited to. They see every report on these jobs.
CREATE TABLE IF NOT EXISTS common.external_job_access (
  job_id   uuid NOT NULL REFERENCES neta_ops.jobs(id) ON DELETE CASCADE,
  user_id  uuid NOT NULL REFERENCES common.external_users(user_id) ON DELETE CASCADE,
  added_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  added_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (job_id, user_id)
);
CREATE INDEX IF NOT EXISTS external_job_access_user_idx ON common.external_job_access (user_id);

ALTER TABLE common.external_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE common.external_job_access ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON common.external_users, common.external_job_access FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON common.external_users, common.external_job_access TO authenticated;
GRANT ALL ON common.external_users, common.external_job_access TO service_role;

DROP POLICY IF EXISTS external_users_read ON common.external_users;
CREATE POLICY external_users_read ON common.external_users FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR (SELECT common.is_employee_user()));
DROP POLICY IF EXISTS external_users_manage ON common.external_users;
CREATE POLICY external_users_manage ON common.external_users FOR ALL TO authenticated
  USING ((SELECT common.can('jobs.invite_subcontractors')))
  WITH CHECK ((SELECT common.can('jobs.invite_subcontractors')));

DROP POLICY IF EXISTS external_job_access_read ON common.external_job_access;
CREATE POLICY external_job_access_read ON common.external_job_access FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR (SELECT common.is_employee_user()));
DROP POLICY IF EXISTS external_job_access_manage ON common.external_job_access;
CREATE POLICY external_job_access_manage ON common.external_job_access FOR ALL TO authenticated
  USING ((SELECT common.can('jobs.invite_subcontractors')))
  WITH CHECK ((SELECT common.can('jobs.invite_subcontractors')));

-- The two checks part 2 will add to the job and report rules
CREATE OR REPLACE FUNCTION common.is_subcontractor() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO ''
AS $$
  SELECT EXISTS (SELECT 1 FROM common.external_users e
                  WHERE e.user_id = auth.uid() AND e.removed_at IS NULL);
$$;

CREATE OR REPLACE FUNCTION common.is_invited_to_job(p_job uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO ''
AS $$
  SELECT EXISTS (SELECT 1 FROM common.external_job_access a
                   JOIN common.external_users e ON e.user_id = a.user_id
                  WHERE a.job_id = p_job AND a.user_id = auth.uid() AND e.removed_at IS NULL);
$$;
REVOKE ALL ON FUNCTION common.is_subcontractor(), common.is_invited_to_job(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION common.is_subcontractor(), common.is_invited_to_job(uuid) TO authenticated, service_role;

COMMIT;

-- Checks (run after):
--   1. Tables a non-staff login can still read (outside HR, the public website views,
--      and the customer portal's own rules). Expect 0.
--      select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
--       where c.relkind = 'r' and n.nspname in ('neta_ops','common','business','lab_ops','public')
--         and has_table_privilege('authenticated', c.oid, 'SELECT') and not c.relrowsecurity;
--   2. The new tick. Expect 2.
--      select count(*) from common.role_permissions where permission_key = 'jobs.invite_subcontractors';
--
-- Then: open ampOS as yourself (staff) and as your Gmail customer login in ACCESS.
