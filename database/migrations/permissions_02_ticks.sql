-- ampOS Roles & Permissions, item 2: starting ticks for each role.
-- Same ticks as the permission tree on the scope page, confirmed by Jack Nov 20
-- (Admins don't see everyone's HR files; Lead Techs review reports).
-- Super Admin isn't listed: common.can() always says yes for it.
--
-- Still changes nothing for users: no screen or database rule calls common.can() yet.
-- Not done here on purpose: filling common.user_roles. Until the new roles screen
-- (item 3) replaces the old one, role changes still land in user_metadata, and a
-- user_roles row would go stale and win. The legacy_names fallback covers it meanwhile.
--
-- Safe to run twice.

BEGIN;

INSERT INTO common.role_permissions (role_key, permission_key)
SELECT r, v.k
FROM (VALUES
  ('sales.view_pipeline',      '{admin,project_manager,sales,scav,ops_manager}'::text[]),
  ('sales.edit_opportunities', '{admin,sales,ops_manager}'::text[]),
  ('sales.log_interactions',   '{admin,sales,scav,ops_manager}'::text[]),
  ('sales.manage_customers',   '{admin,project_manager,office_admin,sales,ops_manager}'::text[]),

  ('estimates.view_prices',    '{admin,project_manager,office_admin,sales,ops_manager}'::text[]),
  ('estimates.edit',           '{admin,sales,ops_manager}'::text[]),
  ('estimates.manage_library', '{admin,ops_manager}'::text[]),
  ('estimates.send_proposal',  '{admin,sales,ops_manager}'::text[]),
  ('estimates.rfis',           '{admin,project_manager,sales,ops_manager}'::text[]),

  ('jobs.view_assigned',       '{admin,project_manager,lead_tech,neta_tech,subcontractor,office_admin,engineer,lab_tech,ops_manager}'::text[]),
  ('jobs.view_all',            '{admin,project_manager,office_admin,sales,engineer,ops_manager}'::text[]),
  ('jobs.create',              '{admin,project_manager,office_admin,ops_manager}'::text[]),
  ('jobs.edit_locked_info',    '{admin,project_manager,ops_manager}'::text[]),
  ('jobs.view_money',          '{admin,project_manager,office_admin,ops_manager}'::text[]),
  ('jobs.documents',           '{admin,project_manager,lead_tech,office_admin,ops_manager}'::text[]),
  ('jobs.change_orders',       '{admin,project_manager,ops_manager}'::text[]),

  ('reports.fill',             '{admin,project_manager,lead_tech,neta_tech,subcontractor,engineer,lab_tech,ops_manager}'::text[]),
  ('reports.review',           '{admin,project_manager,lead_tech,engineer,ops_manager}'::text[]),
  ('reports.export',           '{admin,project_manager,lead_tech,office_admin,engineer,ops_manager}'::text[]),
  ('reports.publish',          '{admin,project_manager,ops_manager}'::text[]),
  ('reports.custom_forms',     '{admin,engineer}'::text[]),
  ('reports.delete',           '{admin,ops_manager}'::text[]),

  ('billing.view_sov',         '{admin,project_manager,office_admin,ops_manager}'::text[]),
  ('billing.edit_sov',         '{admin,project_manager,ops_manager}'::text[]),
  ('billing.approve_month',    '{admin,project_manager,ops_manager}'::text[]),
  ('billing.send_invoice',     '{admin,office_admin}'::text[]),
  ('billing.lien_waivers',     '{admin,project_manager,office_admin}'::text[]),
  ('billing.company_money',    '{admin}'::text[]),

  ('schedule.view',            '{admin,hr,project_manager,lead_tech,neta_tech,office_admin,sales,engineer,lab_tech,scav,ops_manager}'::text[]),
  ('schedule.edit',            '{admin,project_manager,ops_manager}'::text[]),
  ('schedule.equipment',       '{admin,project_manager,lead_tech,ops_manager}'::text[]),
  ('schedule.approve_time',    '{admin,hr}'::text[]),

  ('hr.view_own',              '{admin,hr,project_manager,lead_tech,neta_tech,office_admin,sales,engineer,lab_tech,scav,ops_manager}'::text[]),
  ('hr.view_all',              '{hr}'::text[]),
  ('hr.payroll',               '{hr}'::text[]),
  ('hr.send_documents',        '{admin,hr}'::text[]),
  ('hr.talent_pool',           '{admin,hr}'::text[]),

  ('admin.manage_users',       '{admin}'::text[]),
  ('admin.manage_roles',       '{admin}'::text[]),
  -- admin.make_super_admin: Super Admin only, so no rows.
  ('admin.integrations',       '{admin}'::text[]),
  ('admin.company_settings',   '{admin}'::text[]),
  ('admin.view_logs',          '{admin}'::text[]),

  ('portal.lab',               '{admin,lab_tech}'::text[]),
  ('portal.engineering',       '{admin,engineer}'::text[]),
  ('portal.meetings',          '{admin,ops_manager}'::text[]),
  ('portal.scav',              '{admin,scav}'::text[])
) AS v(k, roles)
CROSS JOIN LATERAL unnest(v.roles) AS r
ON CONFLICT DO NOTHING;

COMMIT;

-- Check: ticks per role. Expect Admin 44, Ops Manager 29, Project Manager 23, Office Admin 13,
-- Sales 11, Engineer 9, Lead Tech 8, HR 7, Lab Tech 5, Scav 5, NETA Tech 4, Subcontractor 2, Super Admin 0.
SELECT r.label, count(rp.permission_key) AS ticks
FROM common.roles r
LEFT JOIN common.role_permissions rp ON rp.role_key = r.key
GROUP BY r.label, r.sort_order
ORDER BY r.sort_order;

-- Report: who maps to which new role today. Rows with no new role get nothing
-- from common.can() until they're given one. Paste this result back to Claude.
SELECT coalesce(u.raw_user_meta_data->>'role', '(none)') AS current_role,
       r.label AS new_role,
       count(*) AS people
FROM auth.users u
LEFT JOIN common.roles r ON (u.raw_user_meta_data->>'role') = ANY (r.legacy_names)
GROUP BY 1, 2
ORDER BY (r.label IS NOT NULL), people DESC;
