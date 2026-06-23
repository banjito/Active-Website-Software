-- Customer Portal: hide soft-deleted jobs (and their reports/deliverables).
-- Run in the Supabase SQL Editor. Takes effect immediately — no redeploy.
--
-- Jobs are soft-deleted in the staff app by stamping neta_ops.jobs.deleted_at.
-- Staff queries filter `deleted_at IS NULL`, but the customer-portal RLS policy
-- and the SECURITY DEFINER helpers did not — so deleted jobs (and any reports /
-- deliverables under them) were still visible to customers. This adds the
-- `deleted_at IS NULL` guard everywhere the portal reads jobs.

-- 1) Shared gate used by asset/report policies + downloads.
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

-- 2) Direct SELECT policy on the jobs table (Jobs list + Job detail).
DROP POLICY IF EXISTS "Customers can view own company jobs" ON neta_ops.jobs;
CREATE POLICY "Customers can view own company jobs"
ON neta_ops.jobs
FOR SELECT
USING (
  auth.role() = 'authenticated'
  AND customer_id = common.current_customer_id()
  AND deleted_at IS NULL
);

-- 3) Report-assets listing (with flag status so the badge persists across reloads).
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
  job_title text,
  flag_count bigint
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
    j.title,
    (SELECT count(*) FROM common.report_flags rf
      WHERE rf.asset_id = a.id
        AND rf.flagged_by = auth.uid()
        AND rf.status = 'open')
  FROM neta_ops.jobs j
  JOIN neta_ops.job_assets ja ON ja.job_id = j.id
  JOIN neta_ops.assets a ON a.id = ja.asset_id
  WHERE j.customer_id = common.current_customer_id()
    AND j.deleted_at IS NULL
    AND lower(coalesce(a.status, '')) IN ('approved', 'sent')
  ORDER BY coalesce(a.sent_at, a.approved_at, a.created_at) DESC;
$$;

-- 4) Deliverables (report packets) listing.
CREATE OR REPLACE FUNCTION common.customer_deliverables()
RETURNS TABLE (
  id uuid,
  job_id uuid,
  name text,
  description text,
  status text,
  delivered_at timestamptz,
  created_at timestamptz,
  report_asset_ids uuid[]
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = common, neta_ops, public
AS $$
  SELECT
    d.id,
    d.job_id,
    d.name,
    d.description,
    d.status,
    d.delivered_at,
    d.created_at,
    COALESCE(gd.selected_report_ids, '{}')::uuid[]
  FROM neta_ops.deliverables d
  JOIN neta_ops.jobs j ON j.id = d.job_id
  LEFT JOIN neta_ops.generated_documents gd ON gd.id = d.cover_letter_id
  WHERE j.customer_id = common.current_customer_id()
    AND j.deleted_at IS NULL
    AND lower(coalesce(d.status, '')) = 'delivered'
  ORDER BY coalesce(d.delivered_at, d.created_at) DESC;
$$;
