-- ampOS Roles & Permissions: the switch-over (Jack, Nov 23: "let's switch over!").
--
-- LIVE CHANGE. After this, every database rule goes by the new roles and their ticks
-- (Admin > People & roles > Roles), never the old role name.
--
--   1. Everyone with a role gets it saved as a pick, so nobody "follows" the old role.
--   2. The old role name on each account is set to the new role's name (Lead Tech,
--      Office Admin, ...) and kept that way automatically. It's only shown, not checked.
--   3. The old "Role today" dropdown is retired.
--   4. The database's own checks move to permissions (list below).
--   5. Rules that read the old role name, or Jack's and John's emails, move to permissions.
--
-- Run before pushing the app update. All or nothing.
--
--   Old check                              Now
--   PMs and admins (SOV, bills, checklist) "See the SOV and hours" or a division lead
--   Schedulers                             "Edit the schedule"
--   Payroll (TimeStAMP)                    "Approve timesheets"
--   Admin logs, alerts, report time        "See audit logs"
--   Articles, AMPu, Prayer Wall, AMP
--     contacts, divisions, settings, help  "Company settings"
--   Lookup tables, diagram defaults        "Build custom report forms"
--   Talent Pool                            "See the Talent Pool"
--   Org chart                              "Invite and remove people" or "See everyone's HR files"
--   Others' HR documents (edit/delete)     "See everyone's HR files"
--   Equipment calibration dates            "Fill in test reports" or "Manage field equipment"
--   Checklist steps, delete checklist rows "Edit the SOV"
--   Delays (others'), delete delays        "Create jobs"
--   Delete answered RFIs                   "Manage RFIs"
--   Lab technicians, delete lab requests   "Open the Lab portal"
--   Preview someone's Wrapped              "Invite and remove people"

BEGIN;
SET LOCAL lock_timeout = '5s';

-- 0. Any person's permission, for edge functions (service role only) ----------------

CREATE OR REPLACE FUNCTION common.user_can(p_user uuid, p_key text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO ''
AS $$
  SELECT CASE
    WHEN p_user IS NULL THEN false
    WHEN me.role_key = 'super_admin' THEN true
    ELSE coalesce(
      (SELECT o.granted FROM common.user_permission_overrides o
        WHERE o.user_id = p_user AND o.permission_key = p_key),
      EXISTS (SELECT 1 FROM common.role_permissions rp
               WHERE rp.role_key = me.role_key AND rp.permission_key = p_key)
    )
  END
  FROM (SELECT common.role_key_for(p_user) AS role_key) me;
$$;
REVOKE ALL ON FUNCTION common.user_can(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION common.user_can(uuid, text) TO service_role;

-- 1. Everyone with a role gets a saved pick -------------------------------------------

INSERT INTO common.user_roles (user_id, role_key, updated_at, updated_by)
SELECT u.id, common.role_key_for(u.id), now(), NULL
  FROM auth.users u
 WHERE NOT EXISTS (SELECT 1 FROM common.user_roles ur WHERE ur.user_id = u.id)
   AND common.role_key_for(u.id) IS NOT NULL;

-- 2. The account's role name follows the pick -----------------------------------------

CREATE OR REPLACE FUNCTION common.sync_role_name() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $$
DECLARE
  v_label text;
BEGIN
  IF TG_OP = 'DELETE' THEN
    UPDATE auth.users
       SET raw_user_meta_data = raw_user_meta_data - 'role'
     WHERE id = OLD.user_id AND raw_user_meta_data ? 'role';
    RETURN NULL;
  END IF;

  SELECT r.label INTO v_label FROM common.roles r WHERE r.key = NEW.role_key;
  UPDATE auth.users
     SET raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb) || jsonb_build_object('role', v_label)
   WHERE id = NEW.user_id
     AND (raw_user_meta_data ->> 'role') IS DISTINCT FROM v_label;
  RETURN NULL;
END;
$$;

CREATE OR REPLACE TRIGGER user_roles_sync_role_name
  AFTER INSERT OR UPDATE OF role_key OR DELETE ON common.user_roles
  FOR EACH ROW EXECUTE FUNCTION common.sync_role_name();

UPDATE auth.users u
   SET raw_user_meta_data = coalesce(u.raw_user_meta_data, '{}'::jsonb) || jsonb_build_object('role', r.label)
  FROM common.user_roles ur
  JOIN common.roles r ON r.key = ur.role_key
 WHERE ur.user_id = u.id
   AND (u.raw_user_meta_data ->> 'role') IS DISTINCT FROM r.label;

-- Staff check: also know the new role names (for staff outside the company email domains)
CREATE OR REPLACE FUNCTION common.is_employee_user() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'common', 'public'
AS $$
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
        'admin', 'super admin', 'neta technician', 'lab technician', 'office admin',
        'sales representative', 'engineer', 'operations manager', 'hr rep', 'scav',
        'manager', 'supervisor', 'technician', 'sales', 'estimator', 'engineering',
        'hr_manager', 'hr_personnel'
      )
      -- user_metadata role is guarded by the protect_user_role trigger and now
      -- mirrors the role picked on People & roles (permissions_16).
      OR lower(coalesce(auth.jwt() -> 'user_metadata' ->> 'role', '')) IN (
        'admin', 'super admin', 'neta technician', 'lab technician', 'office admin',
        'sales representative', 'engineer', 'operations manager', 'hr rep', 'scav',
        'manager', 'supervisor', 'technician', 'sales', 'estimator', 'engineering',
        'hr_manager', 'hr_personnel',
        -- role names since the switch-over
        'hr', 'project manager', 'lead tech', 'neta tech', 'lab tech'
      )
    );
$$;

-- 3. The old "Role today" dropdown is retired ----------------------------------------

CREATE OR REPLACE FUNCTION common.admin_update_user_role(user_id uuid, new_role text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'common', 'public'
AS $$
BEGIN
  RAISE EXCEPTION 'Roles are set on Admin > People & roles now.';
END;
$$;

-- 4. The database's own checks ----------------------------------------------------------

CREATE OR REPLACE FUNCTION common.is_pm_or_admin() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO ''
AS $$
  SELECT common.can('billing.view_sov')
      OR EXISTS (
           SELECT 1
             FROM common.app_settings s
            CROSS JOIN LATERAL jsonb_each(s.value) AS lead
            WHERE s.key = 'division_leads'
              AND jsonb_typeof(s.value) = 'object'
              AND lead.value ->> 'id' = auth.uid()::text
         );
$$;

CREATE OR REPLACE FUNCTION common.is_admin_or_scheduler() RETURNS boolean
LANGUAGE sql STABLE SET search_path TO ''
AS $$ SELECT common.can('schedule.edit'); $$;

CREATE OR REPLACE FUNCTION common.time_is_payroll_admin() RETURNS boolean
LANGUAGE sql STABLE SET search_path TO ''
AS $$ SELECT common.can('schedule.approve_time'); $$;

CREATE OR REPLACE FUNCTION common.can_view_admin_logs() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO ''
AS $$ SELECT common.can('admin.view_logs'); $$;

CREATE OR REPLACE FUNCTION common.article_is_admin() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM auth.users u
     WHERE u.id = auth.uid()
       AND u.email_confirmed_at IS NOT NULL
  ) AND common.can('admin.company_settings');
$$;

CREATE OR REPLACE FUNCTION common.can_manage_amp_contacts() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO ''
AS $$ SELECT common.can('admin.company_settings'); $$;

CREATE OR REPLACE FUNCTION common.is_ampu_registrar() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO ''
AS $$ SELECT common.can('admin.company_settings'); $$;

CREATE OR REPLACE FUNCTION common.prayer_wall_is_admin() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO ''
AS $$ SELECT common.can('admin.company_settings'); $$;

CREATE OR REPLACE FUNCTION common.talent_pool_is_manager() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM auth.users u
     WHERE u.id = auth.uid()
       AND u.email_confirmed_at IS NOT NULL
  ) AND common.can('hr.talent_pool');
$$;

CREATE OR REPLACE FUNCTION common.talent_pool_user_has_access(p_user_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM auth.users u
    WHERE u.id = p_user_id
      AND u.deleted_at IS NULL
      AND (u.banned_until IS NULL OR u.banned_until <= now())
      AND (
        EXISTS (SELECT 1 FROM common.talent_pool_members m WHERE m.user_id = u.id)
        OR (u.email_confirmed_at IS NOT NULL AND common.user_can(u.id, 'hr.talent_pool'))
      )
  );
$$;

CREATE OR REPLACE FUNCTION neta_ops.can_edit_custom_form_lookup_tables() RETURNS boolean
LANGUAGE sql STABLE SET search_path TO ''
AS $$ SELECT common.can('reports.custom_forms'); $$;

CREATE OR REPLACE FUNCTION neta_ops.can_edit_diagram_defaults() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO ''
AS $$ SELECT common.can('reports.custom_forms'); $$;

CREATE OR REPLACE FUNCTION common.is_user_admin() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO ''
AS $$ SELECT common.can('admin.manage_users'); $$;

-- Reading someone else's account details: same people as editing them
CREATE OR REPLACE FUNCTION common.admin_get_user_metadata(target_user_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'common', 'public'
AS $$
DECLARE
  caller_id       uuid := auth.uid();
  target_metadata jsonb;
BEGIN
  IF caller_id IS NULL THEN
    RAISE EXCEPTION 'Access denied - not authenticated';
  END IF;

  IF caller_id IS DISTINCT FROM target_user_id
     AND NOT common.can('admin.manage_users')
     AND NOT common.can('hr.view_all')
  THEN
    RAISE EXCEPTION 'Access denied - you need "Invite and remove people" to read other users';
  END IF;

  SELECT u.raw_user_meta_data INTO target_metadata
    FROM auth.users u WHERE u.id = target_user_id;

  IF target_metadata IS NULL THEN
    RAISE EXCEPTION 'No user found with id %', target_user_id;
  END IF;

  RETURN target_metadata;
END;
$$;

-- Lab alerts go to people on the Admin and Super Admin roles (not the robot account)
CREATE OR REPLACE FUNCTION lab_ops.notify_admins(notification_type text, notification_title text, notification_message text, notification_data jsonb DEFAULT NULL::jsonb) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $$
BEGIN
  INSERT INTO lab_ops.notifications (user_id, type, title, message, data)
  SELECT ur.user_id, notification_type, notification_title, notification_message, notification_data
    FROM common.user_roles ur
   WHERE ur.role_key IN ('admin', 'super_admin')
     AND NOT EXISTS (SELECT 1 FROM common.service_accounts s WHERE s.user_id = ur.user_id);
END;
$$;

CREATE OR REPLACE FUNCTION lab_ops.notify_admins_service_request(request_id uuid, customer_name text, request_title text, equipment_type text DEFAULT NULL::text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $$
BEGIN
  INSERT INTO lab_ops.notifications (user_id, type, title, message, data, read, created_at)
  SELECT ur.user_id,
         'service_request',
         'New Service Request Submitted',
         customer_name || ' has submitted a new service request: ' || request_title,
         jsonb_build_object(
           'service_request_id', request_id,
           'customer_name', customer_name,
           'request_title', request_title,
           'equipment_type', coalesce(equipment_type, 'Not specified'),
           'type', 'service_request',
           'action_url', '/resources/service-requests'
         ),
         false,
         now()
    FROM common.user_roles ur
   WHERE ur.role_key IN ('admin', 'super_admin')
     AND NOT EXISTS (SELECT 1 FROM common.service_accounts s WHERE s.user_id = ur.user_id);
END;
$$;

-- Wrapped preview: swap only the role check inside the existing function
DO $$
DECLARE
  v_def text := pg_get_functiondef('common.get_my_wrapped'::regproc);
  v_old text := E'coalesce(u.raw_user_meta_data ->> ''role'', '''') IN (''Admin'', ''Super Admin'')\n          OR common.is_superuser_email(u.email)';
BEGIN
  IF (length(v_def) - length(replace(v_def, v_old, ''))) / length(v_old) <> 1 THEN
    RAISE EXCEPTION 'Stopped: get_my_wrapped changed since this was written. Nothing changed.';
  END IF;
  EXECUTE replace(v_def, v_old, 'common.user_can(u.id, ''admin.manage_users'')');
END $$;

-- 5. Rules that read the old role name or named emails -------------------------------

ALTER POLICY opportunity_rfis_delete ON business.opportunity_rfis
  USING (coalesce(btrim(response), '') = '' OR (SELECT common.can('estimates.rfis')));

ALTER POLICY app_settings_write_admin ON common.app_settings
  USING ((SELECT common.can('admin.company_settings')))
  WITH CHECK ((SELECT common.can('admin.company_settings')));

ALTER POLICY divisions_write_admin ON common.divisions
  USING ((SELECT common.can('admin.company_settings')))
  WITH CHECK ((SELECT common.can('admin.company_settings')));

ALTER POLICY "Users can delete employee documents" ON common.employee_documents
  USING (auth.uid() = uploaded_by OR (SELECT common.can('hr.view_all')));
ALTER POLICY "Users can update employee documents" ON common.employee_documents
  USING (auth.uid() = uploaded_by OR (SELECT common.can('hr.view_all')));

ALTER POLICY "Users can delete own documents" ON common.help_center_documents
  USING (auth.uid() = created_by OR (SELECT common.can('admin.company_settings')));
ALTER POLICY "Users can update own documents" ON common.help_center_documents
  USING (auth.uid() = created_by OR (SELECT common.can('admin.company_settings')));
ALTER POLICY "Users can delete own guides" ON common.help_guides
  USING (auth.uid() = created_by OR (SELECT common.can('admin.company_settings')));
ALTER POLICY "Users can update own guides" ON common.help_guides
  USING (auth.uid() = created_by OR (SELECT common.can('admin.company_settings')));

ALTER POLICY org_chart_assignments_delete_admin_hr ON common.org_chart_assignments
  USING ((SELECT common.can('admin.manage_users')) OR (SELECT common.can('hr.view_all')));
ALTER POLICY org_chart_assignments_insert_admin_hr ON common.org_chart_assignments
  WITH CHECK ((SELECT common.can('admin.manage_users')) OR (SELECT common.can('hr.view_all')));
ALTER POLICY org_chart_assignments_update_admin_hr ON common.org_chart_assignments
  USING ((SELECT common.can('admin.manage_users')) OR (SELECT common.can('hr.view_all')))
  WITH CHECK ((SELECT common.can('admin.manage_users')) OR (SELECT common.can('hr.view_all')));

ALTER POLICY permission_access_logs_select_admins ON common.permission_access_logs
  USING ((SELECT common.can('admin.view_logs')));
ALTER POLICY permission_change_logs_select_admins ON common.permission_change_logs
  USING ((SELECT common.can('admin.view_logs')));

ALTER POLICY user_permissions_delete_admins ON common.user_permissions
  USING ((SELECT common.can('admin.manage_roles')));
ALTER POLICY user_permissions_insert_admins ON common.user_permissions
  WITH CHECK ((SELECT common.can('admin.manage_roles')));
ALTER POLICY user_permissions_select_admins_or_own ON common.user_permissions
  USING (user_id = auth.uid() OR (SELECT common.can('admin.manage_roles')));
ALTER POLICY user_permissions_update_admins ON common.user_permissions
  USING ((SELECT common.can('admin.manage_roles')))
  WITH CHECK ((SELECT common.can('admin.manage_roles')));

ALTER POLICY user_xp_admin_insert ON common.user_xp
  WITH CHECK ((SELECT common.can('admin.company_settings')));
ALTER POLICY user_xp_admin_update ON common.user_xp
  USING ((SELECT common.can('admin.company_settings')))
  WITH CHECK ((SELECT common.can('admin.company_settings')));

ALTER POLICY labtech_insert_admin ON lab_ops.lab_technicians
  WITH CHECK ((SELECT common.can('portal.lab')));
ALTER POLICY labtech_update_admin ON lab_ops.lab_technicians
  USING ((SELECT common.can('portal.lab')))
  WITH CHECK ((SELECT common.can('portal.lab')));
ALTER POLICY allow_admin_delete ON lab_ops.service_requests
  USING ((SELECT common.can('portal.lab')));

ALTER POLICY "Technicians can update equipment calibration dates" ON neta_ops.equipment
  USING (auth.uid() IS NOT NULL AND ((SELECT common.can('reports.fill')) OR (SELECT common.can('schedule.equipment'))))
  WITH CHECK (auth.uid() IS NOT NULL AND ((SELECT common.can('reports.fill')) OR (SELECT common.can('schedule.equipment'))));
ALTER POLICY "Technicians can update field equipment calibration dates" ON neta_ops.field_equipment
  USING (auth.uid() IS NOT NULL AND ((SELECT common.can('reports.fill')) OR (SELECT common.can('schedule.equipment'))))
  WITH CHECK (auth.uid() IS NOT NULL AND ((SELECT common.can('reports.fill')) OR (SELECT common.can('schedule.equipment'))));

ALTER POLICY job_checklist_items_delete_admin ON neta_ops.job_checklist_items
  USING ((SELECT common.can('billing.edit_sov')));
ALTER POLICY job_checklist_steps_insert_admin ON neta_ops.job_checklist_steps
  WITH CHECK ((SELECT common.can('billing.edit_sov')));
ALTER POLICY job_checklist_steps_update_admin ON neta_ops.job_checklist_steps
  USING ((SELECT common.can('billing.edit_sov')))
  WITH CHECK ((SELECT common.can('billing.edit_sov')));

ALTER POLICY job_delays_delete_admin ON neta_ops.job_delays
  USING ((SELECT common.can('jobs.create')));
ALTER POLICY job_delays_update_own_or_admin ON neta_ops.job_delays
  USING (user_id = auth.uid() OR (SELECT common.can('jobs.create')))
  WITH CHECK (user_id = auth.uid() OR (SELECT common.can('jobs.create')));

ALTER POLICY admin_notifications_delete_admins ON public.admin_notifications
  USING ((SELECT common.can('admin.view_logs')));
ALTER POLICY admin_notifications_select_admins ON public.admin_notifications
  USING ((SELECT common.can('admin.view_logs')));
ALTER POLICY admin_notifications_update_admins ON public.admin_notifications
  USING ((SELECT common.can('admin.view_logs')))
  WITH CHECK ((SELECT common.can('admin.view_logs')));

ALTER POLICY report_time_sessions_admin_read ON common.report_time_sessions
  USING ((SELECT common.can('admin.view_logs')));

COMMIT;

-- Checks (run after):
--   1. Nobody with a role is left without a pick. Expect 0.
--      select count(*) from auth.users u
--       where common.role_key_for(u.id) is not null
--         and not exists (select 1 from common.user_roles r where r.user_id = u.id);
--   2. Account role names match picks. Expect 0.
--      select count(*) from common.user_roles ur join common.roles r on r.key = ur.role_key
--        join auth.users u on u.id = ur.user_id
--       where (u.raw_user_meta_data->>'role') is distinct from r.label;
--   3. Rules outside the HR schema that still read the old role name. Expect 0.
--      select count(*) from pg_policies
--       where schemaname <> 'hr'
--         and (coalesce(qual,'') || coalesce(with_check,'')) ~ '(user_metadata|profiles\.role)';
