-- Customer Portal: one merged "full packet" PDF per Report Packet.
-- Run in the Supabase SQL Editor after customer_portal_deliverables.sql.
--
-- published_packet_pdf_path: storage path of the merged PDF (cover letter +
-- every published report, in order), written by the publish-packet-pdf edge
-- function. Rebuilt when a report in the packet is republished or unpublished.
-- customer-report-download signs it (kind: 'packet') after re-checking the
-- packet is in customer_deliverables() for the calling customer.
--
-- Safe to re-run.

BEGIN;

SET LOCAL lock_timeout = '5s';

ALTER TABLE neta_ops.deliverables
  ADD COLUMN IF NOT EXISTS published_packet_pdf_path text;

-- DROP first: CREATE OR REPLACE can't change a function's return type.
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
  cover_pdf_path text,
  packet_pdf_path text
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
    d.published_cover_pdf_path,
    d.published_packet_pdf_path
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
