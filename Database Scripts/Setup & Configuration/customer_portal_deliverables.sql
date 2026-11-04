-- Customer Portal: report packets (deliverables) visibility
-- Run in the Supabase SQL Editor after customer_portal_report_assets.sql.
--
-- In ampOS a "deliverable" (neta_ops.deliverables) is a named bundle the staff
-- app assembles from a cover letter and its selected reports. The customer-facing
-- name for these is "Report Packets". This SECURITY DEFINER function returns the
-- customer's *delivered* packets (joined to their job), scoped strictly to
-- common.current_customer_id(), along with the cover letter's selected report
-- asset ids so the portal can list the individual reports inside each packet.
--
-- The packet only exposes asset ids; the portal still resolves each report
-- through common.customer_report_assets() + the customer-report-download edge
-- function, so a packet can never widen what a customer may actually open.
--
-- cover_pdf_path: storage path of the packet's cover letter PDF, written by the
-- publish-deliverable-pdf edge function when staff mark a packet Delivered.
-- The bucket is private; customer-report-download signs it after re-checking
-- the packet is in this function's result for the calling customer.
--
-- Safe to re-run.

BEGIN;

SET LOCAL lock_timeout = '5s';

ALTER TABLE neta_ops.deliverables
  ADD COLUMN IF NOT EXISTS published_cover_pdf_path text;

-- DROP first: CREATE OR REPLACE can't change a function's return type, so adding
-- columns to the RETURNS TABLE requires dropping the old definition.
DROP FUNCTION IF EXISTS common.customer_deliverables();

CREATE FUNCTION common.customer_deliverables()
RETURNS TABLE (
  id uuid,
  job_id uuid,
  name text,
  description text,
  status text,
  delivered_at timestamptz,
  created_at timestamptz,
  report_asset_ids uuid[],
  cover_pdf_path text
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
    COALESCE(gd.selected_report_ids, '{}')::uuid[],
    d.published_cover_pdf_path
  FROM neta_ops.deliverables d
  JOIN neta_ops.jobs j ON j.id = d.job_id
  LEFT JOIN neta_ops.generated_documents gd ON gd.id = d.cover_letter_id
  WHERE j.customer_id = common.current_customer_id()
    AND j.deleted_at IS NULL
    AND lower(coalesce(d.status, '')) = 'delivered'
  ORDER BY coalesce(d.delivered_at, d.created_at) DESC;
$$;

GRANT EXECUTE ON FUNCTION common.customer_deliverables() TO authenticated;

COMMIT;
