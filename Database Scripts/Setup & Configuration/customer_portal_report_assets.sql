-- Customer Portal: report-assets visibility
-- Run in the Supabase SQL Editor after customer_portal_security.sql.
--
-- In ampOS the customer-facing "report" is a row in neta_ops.assets (file_url,
-- status, substation) linked to a job via neta_ops.job_assets. The original RLS
-- only exposed assets that had an approved/sent technical_reports link, which
-- most report-assets don't have. This SECURITY DEFINER function returns the
-- customer's approved/sent report-assets (joined to their job) scoped strictly
-- to common.current_customer_id(), so the portal can list them without needing
-- direct RLS access to job_assets.

-- DROP first: CREATE OR REPLACE can't change a function's return type, so adding
-- columns to the RETURNS TABLE requires dropping the old definition.
DROP FUNCTION IF EXISTS common.customer_report_assets();

CREATE FUNCTION common.customer_report_assets()
RETURNS TABLE (
  asset_id uuid,
  asset_name text,
  file_url text,
  substation text,
  status text,
  submitted_at timestamptz,
  approved_at timestamptz,
  sent_at timestamptz,
  created_at timestamptz,
  published_pdf_path text,
  job_id uuid,
  job_number text,
  job_title text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = common, neta_ops, public
AS $$
  SELECT
    a.id,
    a.name,
    a.file_url,
    a.substation,
    a.status,
    a.submitted_at,
    a.approved_at,
    a.sent_at,
    a.created_at,
    a.published_pdf_path,
    j.id,
    j.job_number,
    j.title
  FROM neta_ops.jobs j
  JOIN neta_ops.job_assets ja ON ja.job_id = j.id
  JOIN neta_ops.assets a ON a.id = ja.asset_id
  WHERE j.customer_id = common.current_customer_id()
    AND lower(coalesce(a.status, '')) IN ('approved', 'sent')
  ORDER BY coalesce(a.sent_at, a.approved_at, a.created_at) DESC;
$$;

GRANT EXECUTE ON FUNCTION common.customer_report_assets() TO authenticated;
