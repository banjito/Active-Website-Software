-- Customer Portal security setup
-- Run in Supabase SQL Editor before enabling customer.ampos.io.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS common.customer_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL REFERENCES common.customers(id) ON DELETE CASCADE,
  invited_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_customer_users_customer_id
  ON common.customer_users(customer_id);

CREATE TABLE IF NOT EXISTS common.customer_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  customer_id uuid NOT NULL REFERENCES common.customers(id) ON DELETE CASCADE,
  token text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  accepted_at timestamptz,
  accepted_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  revoked_at timestamptz,
  invited_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_customer_invites_customer_id
  ON common.customer_invites(customer_id);

CREATE INDEX IF NOT EXISTS idx_customer_invites_email
  ON common.customer_invites(lower(email));

CREATE INDEX IF NOT EXISTS idx_customer_invites_token
  ON common.customer_invites(token);

CREATE OR REPLACE FUNCTION common.is_employee_user()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = common, public
AS $$
  SELECT
    auth.role() = 'authenticated'
    AND (
      lower(coalesce(auth.jwt() ->> 'email', '')) LIKE '%@ampqes.com'
      OR lower(coalesce(auth.jwt() -> 'app_metadata' ->> 'account_type', '')) = 'employee'
      OR lower(coalesce(auth.jwt() -> 'user_metadata' ->> 'account_type', '')) = 'employee'
      OR lower(coalesce(auth.jwt() -> 'app_metadata' ->> 'user_type', '')) = 'employee'
      OR lower(coalesce(auth.jwt() -> 'user_metadata' ->> 'user_type', '')) = 'employee'
      OR lower(coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '')) IN (
        'admin',
        'manager',
        'supervisor',
        'neta technician',
        'technician',
        'sales',
        'estimator',
        'engineering',
        'office admin',
        'hr_manager',
        'hr_personnel'
      )
      OR lower(coalesce(auth.jwt() -> 'user_metadata' ->> 'role', '')) IN (
        'admin',
        'manager',
        'supervisor',
        'neta technician',
        'technician',
        'sales',
        'estimator',
        'engineering',
        'office admin',
        'hr_manager',
        'hr_personnel'
      )
    );
$$;

CREATE OR REPLACE FUNCTION common.current_customer_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = common, public
AS $$
  SELECT cu.customer_id
  FROM common.customer_users cu
  WHERE cu.auth_user_id = auth.uid()
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION common.customer_can_select_job(p_job_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = common, neta_ops, public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM neta_ops.jobs j
    WHERE j.id = p_job_id
      AND j.customer_id = common.current_customer_id()
      AND j.deleted_at IS NULL
  );
$$;

CREATE OR REPLACE FUNCTION common.customer_can_select_asset(p_asset_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = common, neta_ops, public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM neta_ops.assets a
    JOIN neta_ops.asset_reports ar ON ar.asset_id = a.id
    JOIN neta_ops.technical_reports tr ON tr.id = ar.report_id
    WHERE a.id = p_asset_id
      AND lower(coalesce(a.status, '')) IN ('approved', 'sent')
      AND lower(coalesce(tr.status, '')) IN ('approved', 'sent')
      AND common.customer_can_select_job(tr.job_id)
  );
$$;

CREATE OR REPLACE FUNCTION common.customer_can_select_technical_report(p_report_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = common, neta_ops, public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM neta_ops.technical_reports tr
    WHERE tr.id = p_report_id
      AND lower(coalesce(tr.status, '')) IN ('approved', 'sent')
      AND common.customer_can_select_job(tr.job_id)
  );
$$;

ALTER TABLE common.customer_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE common.customer_invites ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Employees can manage customer users" ON common.customer_users;
DROP POLICY IF EXISTS "Customers can view own customer user link" ON common.customer_users;
DROP POLICY IF EXISTS "Employees can manage customer invites" ON common.customer_invites;

CREATE POLICY "Employees can manage customer users"
ON common.customer_users
FOR ALL
USING (common.is_employee_user())
WITH CHECK (common.is_employee_user());

CREATE POLICY "Customers can view own customer user link"
ON common.customer_users
FOR SELECT
USING (auth.uid() = auth_user_id);

CREATE POLICY "Employees can manage customer invites"
ON common.customer_invites
FOR ALL
USING (common.is_employee_user())
WITH CHECK (common.is_employee_user());

GRANT USAGE ON SCHEMA common TO authenticated;
GRANT USAGE ON SCHEMA neta_ops TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON common.customer_users TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON common.customer_invites TO authenticated;

-- Edge functions (customer-portal-invite / accept-invite / report-download) run as
-- service_role. It bypasses RLS but still needs table privileges in these schemas.
GRANT USAGE ON SCHEMA common TO service_role;
GRANT USAGE ON SCHEMA neta_ops TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON common.customer_users TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON common.customer_invites TO service_role;
GRANT SELECT ON neta_ops.technical_reports TO service_role;
GRANT EXECUTE ON FUNCTION common.is_employee_user() TO authenticated;
GRANT EXECUTE ON FUNCTION common.current_customer_id() TO authenticated;
GRANT EXECUTE ON FUNCTION common.customer_can_select_job(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION common.customer_can_select_asset(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION common.customer_can_select_technical_report(uuid) TO authenticated;

ALTER TABLE neta_ops.jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE neta_ops.assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE neta_ops.technical_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE neta_ops.asset_reports ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  pol record;
BEGIN
  FOR pol IN
    SELECT schemaname, tablename, policyname
    FROM pg_policies
    WHERE schemaname = 'neta_ops'
      AND tablename IN ('jobs', 'assets', 'technical_reports', 'asset_reports')
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I', pol.policyname, pol.schemaname, pol.tablename);
  END LOOP;
END $$;

CREATE POLICY "Employees can manage jobs"
ON neta_ops.jobs
FOR ALL
USING (common.is_employee_user())
WITH CHECK (common.is_employee_user());

CREATE POLICY "Customers can view own company jobs"
ON neta_ops.jobs
FOR SELECT
USING (
  auth.role() = 'authenticated'
  AND customer_id = common.current_customer_id()
  AND deleted_at IS NULL
);

CREATE POLICY "Employees can manage assets"
ON neta_ops.assets
FOR ALL
USING (common.is_employee_user())
WITH CHECK (common.is_employee_user());

CREATE POLICY "Customers can view approved assets"
ON neta_ops.assets
FOR SELECT
USING (
  auth.role() = 'authenticated'
  AND lower(coalesce(status, '')) IN ('approved', 'sent')
  AND common.customer_can_select_asset(id)
);

CREATE POLICY "Employees can manage technical reports"
ON neta_ops.technical_reports
FOR ALL
USING (common.is_employee_user())
WITH CHECK (common.is_employee_user());

CREATE POLICY "Customers can view approved technical reports"
ON neta_ops.technical_reports
FOR SELECT
USING (
  auth.role() = 'authenticated'
  AND lower(coalesce(status, '')) IN ('approved', 'sent')
  AND common.customer_can_select_job(job_id)
);

CREATE POLICY "Employees can manage asset reports"
ON neta_ops.asset_reports
FOR ALL
USING (common.is_employee_user())
WITH CHECK (common.is_employee_user());

CREATE POLICY "Customers can view approved asset report links"
ON neta_ops.asset_reports
FOR SELECT
USING (
  auth.role() = 'authenticated'
  AND (
    common.customer_can_select_asset(asset_id)
    OR common.customer_can_select_technical_report(report_id)
  )
);

GRANT SELECT, INSERT, UPDATE, DELETE ON neta_ops.jobs TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON neta_ops.assets TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON neta_ops.technical_reports TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON neta_ops.asset_reports TO authenticated;

-- Older report-specific tables often have no approved/sent status.
-- Employees keep access. Customers do not get direct access here until each table has a safe approved/sent link.
DO $$
DECLARE
  report_table record;
  pol record;
BEGIN
  FOR report_table IN
    SELECT c.table_schema, c.table_name
    FROM information_schema.columns c
    JOIN information_schema.tables t
      ON t.table_schema = c.table_schema
      AND t.table_name = c.table_name
    WHERE c.table_schema = 'neta_ops'
      AND c.column_name = 'job_id'
      AND t.table_type = 'BASE TABLE'
      AND c.table_name NOT IN ('jobs', 'assets', 'technical_reports', 'asset_reports')
      AND (
        c.table_name LIKE '%report%'
        OR c.table_name LIKE '%test%'
      )
  LOOP
    EXECUTE format('ALTER TABLE %I.%I ENABLE ROW LEVEL SECURITY', report_table.table_schema, report_table.table_name);

    FOR pol IN
      SELECT policyname
      FROM pg_policies
      WHERE schemaname = report_table.table_schema
        AND tablename = report_table.table_name
    LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I', pol.policyname, report_table.table_schema, report_table.table_name);
    END LOOP;

    EXECUTE format(
      'CREATE POLICY %I ON %I.%I FOR ALL USING (common.is_employee_user()) WITH CHECK (common.is_employee_user())',
      'Employees can manage records',
      report_table.table_schema,
      report_table.table_name
    );
  END LOOP;
END $$;
