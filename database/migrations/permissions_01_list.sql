-- ampOS Roles & Permissions, item 1: one list of permissions.
-- Adds the permission list, the roles, and the check common.can('key').
-- Nothing calls it yet, so nothing changes for anyone.
-- Role ticks (common.role_permissions) are seeded in item 2, after Jack checks them.
--
-- Keys are permanent: never rename one. They mirror src/lib/permissions.ts.
-- Named common.can, not has_permission: an old always-true stub
-- common.has_permission(resource, action) already exists and must not be confused with this.
--
-- All or nothing. If a CREATE fails because a table already exists, stop and check.

BEGIN;

-- 1. Tables -----------------------------------------------------------------

CREATE TABLE common.permissions (
  key         text PRIMARY KEY CHECK (key ~ '^[a-z_]+\.[a-z_]+$'),
  area        text NOT NULL,
  label       text NOT NULL,
  description text NOT NULL,
  sort_order  int  NOT NULL
);
COMMENT ON TABLE common.permissions IS
  'The one list of permissions. Keys are permanent; mirror src/lib/permissions.ts.';

CREATE TABLE common.roles (
  key          text PRIMARY KEY CHECK (key ~ '^[a-z_]+$'),
  label        text NOT NULL UNIQUE,
  is_system    boolean NOT NULL DEFAULT false,
  copied_from  text REFERENCES common.roles(key) ON DELETE SET NULL,
  legacy_names text[] NOT NULL DEFAULT '{}',
  sort_order   int NOT NULL DEFAULT 0,
  created_at   timestamptz NOT NULL DEFAULT now()
);
COMMENT ON COLUMN common.roles.legacy_names IS
  'Today''s user_metadata.role values that map to this role. Used until user_roles is backfilled (item 2).';

CREATE TABLE common.role_permissions (
  role_key       text NOT NULL REFERENCES common.roles(key) ON DELETE CASCADE,
  permission_key text NOT NULL REFERENCES common.permissions(key) ON DELETE CASCADE,
  PRIMARY KEY (role_key, permission_key)
);

-- One role per person, plus per-person extras below.
CREATE TABLE common.user_roles (
  user_id    uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role_key   text NOT NULL REFERENCES common.roles(key),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);
CREATE INDEX user_roles_role_key_idx ON common.user_roles (role_key);

-- granted = true adds a permission for this person; false takes one away.
CREATE TABLE common.user_permission_overrides (
  user_id        uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  permission_key text NOT NULL REFERENCES common.permissions(key) ON DELETE CASCADE,
  granted        boolean NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  created_by     uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  PRIMARY KEY (user_id, permission_key)
);

-- 2. The list (47 permissions, 9 areas) -------------------------------------

INSERT INTO common.permissions (key, area, label, description, sort_order) VALUES
  ('sales.view_pipeline',       'Sales', 'See opportunities and the pipeline', 'Open the opportunity list, pipeline totals and opportunity pages.', 100),
  ('sales.edit_opportunities',  'Sales', 'Create and edit opportunities', 'Add opportunities, change their details and status, and mark them lost.', 110),
  ('sales.log_interactions',    'Sales', 'Log customer interactions', 'Record calls, emails and visits with customers.', 120),
  ('sales.manage_customers',    'Sales', 'Add and edit customers and contacts', 'Create customers, edit their details, and manage their contacts.', 130),

  ('estimates.view_prices',     'Estimates', 'See bids, estimates and prices', 'See estimate sheets, bid amounts and proposal prices.', 200),
  ('estimates.edit',            'Estimates', 'Build and edit estimates', 'Create estimate versions and change their rows, hours and pricing.', 210),
  ('estimates.manage_library',  'Estimates', 'Edit the scope library', 'Add and change scope library items and assemblies used by every estimate.', 220),
  ('estimates.send_proposal',   'Estimates', 'Send proposals', 'Send letter proposals and estimates to customers.', 230),
  ('estimates.rfis',            'Estimates', 'Manage RFIs', 'Add, answer and export RFIs on opportunities.', 240),

  ('jobs.view_assigned',        'Jobs', 'See the jobs I''m on', 'Open jobs you are scheduled on or assigned to.', 300),
  ('jobs.view_all',             'Jobs', 'See every job', 'Open any job, not just your own.', 310),
  ('jobs.create',               'Jobs', 'Create jobs', 'Make new jobs, including from an opportunity.', 320),
  ('jobs.edit_locked_info',     'Jobs', 'Edit locked job info on reports', 'Change customer, site and job details on a report after they lock.', 330),
  ('jobs.view_money',           'Jobs', 'See job money', 'See a job''s contract value, amount billed and backlog.', 340),
  ('jobs.documents',            'Jobs', 'Manage job documents', 'Upload, tag and delete files on a job.', 350),
  ('jobs.change_orders',        'Jobs', 'Create and approve Change Orders', 'Price Change Orders, send them for signature, and approve them.', 360),

  ('reports.fill',              'Reports', 'Fill in test reports', 'Create and edit test reports on jobs you can open.', 400),
  ('reports.review',            'Reports', 'Review reports', 'Approve, reject and flag fields on submitted reports.', 410),
  ('reports.export',            'Reports', 'Export and print reports', 'Download, print and export reports.', 420),
  ('reports.publish',           'Reports', 'Publish reports to customers', 'Publish and unpublish reports and packets in ACCESS.', 430),
  ('reports.custom_forms',      'Reports', 'Build custom report forms', 'Create and change custom form templates.', 440),
  ('reports.delete',            'Reports', 'Delete reports', 'Delete reports permanently.', 450),

  ('billing.view_sov',          'Billing', 'See the SOV and hours', 'See schedule of values lines, weekly progress and hours worked.', 500),
  ('billing.edit_sov',          'Billing', 'Edit the SOV', 'Build the SOV from the estimate and enter weekly progress.', 510),
  ('billing.approve_month',     'Billing', 'Approve a month''s billing', 'Approve the month''s SOV progress so it can be billed.', 520),
  ('billing.send_invoice',      'Billing', 'Send invoices', 'Create invoices in QuickBooks and send them to the customer.', 530),
  ('billing.lien_waivers',      'Billing', 'Make lien waivers', 'Create conditional and unconditional lien waivers.', 540),
  ('billing.company_money',     'Billing', 'See company-wide money', 'See the accounting numbers on the Office page: profit, A/R and bank balances.', 550),

  ('schedule.view',             'Scheduling', 'See the schedule', 'Open the crew schedule.', 600),
  ('schedule.edit',             'Scheduling', 'Edit the schedule', 'Add, move and remove people and jobs on the schedule.', 610),
  ('schedule.equipment',        'Scheduling', 'Manage field equipment', 'Add field equipment and check it in and out.', 620),
  ('schedule.approve_time',     'Scheduling', 'Approve timesheets', 'Review and approve people''s hours.', 630),

  ('hr.view_own',               'HR', 'See my own HR things', 'Your documents to sign, time off and the handbook.', 700),
  ('hr.view_all',               'HR', 'See everyone''s HR files', 'Open other people''s HR files, reviews and personal details.', 710),
  ('hr.payroll',                'HR', 'Payroll', 'See pay rates and run payroll.', 720),
  ('hr.send_documents',         'HR', 'Send documents to sign', 'Send HR documents to people and track who signed.', 730),
  ('hr.talent_pool',            'HR', 'See the Talent Pool', 'Open candidates in the Talent Pool.', 740),

  ('admin.manage_users',        'Admin', 'Invite and remove people', 'Add people to ampOS, switch accounts off, and edit their profiles.', 800),
  ('admin.manage_roles',        'Admin', 'Change roles and permissions', 'Change someone''s role, edit role ticks, and add per-person extras.', 810),
  ('admin.make_super_admin',    'Admin', 'Make someone a Super Admin', 'Give or take away Super Admin.', 820),
  ('admin.integrations',        'Admin', 'Connect outside services', 'Connect QuickBooks and other services for the company.', 830),
  ('admin.company_settings',    'Admin', 'Company settings', 'Change company settings and divisions.', 840),
  ('admin.view_logs',           'Admin', 'See audit logs', 'See who changed what, and when.', 850),

  ('portal.engineering',        'Other portals', 'Open the Engineering portal', 'The Engineering portal.', 910),
  ('portal.meetings',           'Other portals', 'Open the Meetings portal', 'The Meetings portal.', 920),
  ('portal.scav',               'Other portals', 'Open the Scav portal', 'The Scav portal.', 930);

-- 3. Roles (no ticks yet; item 2) -------------------------------------------

INSERT INTO common.roles (key, label, is_system, legacy_names, sort_order) VALUES
  ('super_admin',     'Super Admin',     true, '{"Super Admin"}', 10),
  ('admin',           'Admin',           true, '{"Admin"}', 20),
  ('hr',              'HR',              true, '{"HR Rep","HR","HR Representative"}', 30),
  ('project_manager', 'Project Manager', true, '{"Project Manager"}', 40),
  ('lead_tech',       'Lead Tech',       true, '{}', 50),
  ('neta_tech',       'NETA Tech',       true, '{"NETA Technician"}', 60),
  ('subcontractor',   'Subcontractor',   true, '{}', 70),
  ('office_admin',    'Office Admin',    true, '{"Office Admin"}', 80),
  ('sales',           'Sales',           true, '{"Sales Representative"}', 90),
  ('engineer',        'Engineer',        true, '{"Engineer"}', 100),
  ('scav',            'Scav',            true, '{"Scav"}', 120),
  ('ops_manager',     'Ops Manager',     true, '{"Operations Manager"}', 130);

-- 4. The check --------------------------------------------------------------

-- The signed-in person's role. Until item 2 fills user_roles, falls back to
-- today's user_metadata.role (self-edits blocked by the protect_user_role trigger).
CREATE FUNCTION common.my_role_key() RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT coalesce(
    (SELECT ur.role_key FROM common.user_roles ur WHERE ur.user_id = auth.uid()),
    (SELECT r.key
       FROM common.roles r
      WHERE (SELECT u.raw_user_meta_data->>'role' FROM auth.users u WHERE u.id = auth.uid())
            = ANY (r.legacy_names)
      ORDER BY r.sort_order
      LIMIT 1)
  );
$$;

-- common.can('billing.edit_sov'): may the signed-in person do this?
-- Super Admin: always. Otherwise a per-person extra wins, then the role's ticks.
-- In row rules, wrap it as (SELECT common.can('...')) so it runs once per query, not per row.
CREATE FUNCTION common.can(p_key text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT CASE
    WHEN me.uid IS NULL THEN false
    WHEN me.role_key = 'super_admin' THEN true
    ELSE coalesce(
      (SELECT o.granted FROM common.user_permission_overrides o
        WHERE o.user_id = me.uid AND o.permission_key = p_key),
      EXISTS (SELECT 1 FROM common.role_permissions rp
               WHERE rp.role_key = me.role_key AND rp.permission_key = p_key)
    )
  END
  FROM (SELECT auth.uid() AS uid, common.my_role_key() AS role_key) me;
$$;

-- Every key the signed-in person has. The app loads this once per session.
CREATE FUNCTION common.my_permissions() RETURNS text[]
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT coalesce(array_agg(p.key ORDER BY p.sort_order), '{}')
  FROM common.permissions p,
       (SELECT auth.uid() AS uid, common.my_role_key() AS role_key) me
  WHERE me.uid IS NOT NULL
    AND (
      me.role_key = 'super_admin'
      OR coalesce(
        (SELECT o.granted FROM common.user_permission_overrides o
          WHERE o.user_id = me.uid AND o.permission_key = p.key),
        EXISTS (SELECT 1 FROM common.role_permissions rp
                 WHERE rp.role_key = me.role_key AND rp.permission_key = p.key)
      )
    );
$$;

REVOKE ALL ON FUNCTION common.my_role_key()    FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION common.can(text)        FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION common.my_permissions() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION common.my_role_key()    TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION common.can(text)        TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION common.my_permissions() TO authenticated, service_role;

-- 5. Row security: read only from the app. Writes come in item 3, through checked functions.

ALTER TABLE common.permissions               ENABLE ROW LEVEL SECURITY;
ALTER TABLE common.roles                     ENABLE ROW LEVEL SECURITY;
ALTER TABLE common.role_permissions          ENABLE ROW LEVEL SECURITY;
ALTER TABLE common.user_roles                ENABLE ROW LEVEL SECURITY;
ALTER TABLE common.user_permission_overrides ENABLE ROW LEVEL SECURITY;

CREATE POLICY permissions_read      ON common.permissions      FOR SELECT TO authenticated USING (true);
CREATE POLICY roles_read            ON common.roles            FOR SELECT TO authenticated USING (true);
CREATE POLICY role_permissions_read ON common.role_permissions FOR SELECT TO authenticated USING (true);
CREATE POLICY user_roles_read ON common.user_roles FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR (SELECT common.can('admin.manage_roles')));
CREATE POLICY user_permission_overrides_read ON common.user_permission_overrides FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR (SELECT common.can('admin.manage_roles')));

REVOKE ALL ON common.permissions, common.roles, common.role_permissions,
              common.user_roles, common.user_permission_overrides FROM anon, authenticated;
GRANT SELECT ON common.permissions, common.roles, common.role_permissions,
                common.user_roles, common.user_permission_overrides TO authenticated;
GRANT ALL ON common.permissions, common.roles, common.role_permissions,
             common.user_roles, common.user_permission_overrides TO service_role;

COMMIT;

-- Check after running (expect 47, 13, and your own permissions; empty until item 2 unless you're Super Admin):
--   SELECT count(*) FROM common.permissions;
--   SELECT count(*) FROM common.roles;
--   SELECT common.my_role_key(), common.my_permissions();   -- in the SQL editor these return null / {} (no signed-in user)
