-- Customer Portal RLS verification
-- Run after customer_portal_security.sql.
-- It simulates the first linked customer user it finds.

BEGIN;

DO $$
DECLARE
  v_user_id uuid;
  v_email text;
BEGIN
  SELECT cu.auth_user_id, coalesce(u.email, 'customer-test@example.com')
  INTO v_user_id, v_email
  FROM common.customer_users cu
  LEFT JOIN auth.users u ON u.id = cu.auth_user_id
  LIMIT 1;

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'No common.customer_users row found. Accept one invite first, then rerun this.';
  END IF;

  PERFORM set_config('request.jwt.claim.sub', v_user_id::text, true);
  PERFORM set_config('request.jwt.claim.email', v_email, true);
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object(
      'sub', v_user_id::text,
      'email', v_email,
      'role', 'authenticated',
      'app_metadata', json_build_object('account_type', 'customer'),
      'user_metadata', json_build_object('account_type', 'customer')
    )::text,
    true
  );
END $$;

SET LOCAL ROLE authenticated;

SELECT
  'customer_id_for_test' AS check_name,
  common.current_customer_id()::text AS value;

SELECT
  'foreign_jobs_visible_should_be_0' AS check_name,
  count(*) AS visible_rows
FROM neta_ops.jobs
WHERE customer_id <> common.current_customer_id();

SELECT
  'unapproved_assets_visible_should_be_0' AS check_name,
  count(*) AS visible_rows
FROM neta_ops.assets
WHERE lower(coalesce(status, '')) NOT IN ('approved', 'sent');

SELECT
  'approved_assets_visible_for_customer' AS check_name,
  count(*) AS visible_rows
FROM neta_ops.assets;

SELECT
  'foreign_technical_reports_visible_should_be_0' AS check_name,
  count(*) AS visible_rows
FROM neta_ops.technical_reports tr
WHERE NOT common.customer_can_select_job(tr.job_id);

SELECT
  'unapproved_technical_reports_visible_should_be_0' AS check_name,
  count(*) AS visible_rows
FROM neta_ops.technical_reports
WHERE lower(coalesce(status, '')) NOT IN ('approved', 'sent');

SELECT
  'approved_technical_reports_visible_for_customer' AS check_name,
  count(*) AS visible_rows
FROM neta_ops.technical_reports;

RESET ROLE;

ROLLBACK;
