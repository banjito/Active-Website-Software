-- Customer Portal: report download artifacts (Gap 1)
-- Run in the Supabase SQL Editor after customer_portal_security.sql.
--
-- Adds a place to record the published PDF for a technical report, and a PRIVATE
-- storage bucket to hold those PDFs. Customers never read the bucket directly;
-- the `customer-report-download` edge function mints short-lived signed URLs
-- after re-checking common.customer_can_select_technical_report().

-- 1. Where the published PDF lives (object path within the customer-reports bucket).
-- The customer-facing report is a neta_ops.assets row, so the path is stored there.
-- (technical_reports also gets a column for the future oil-report workflow.)
ALTER TABLE neta_ops.assets
  ADD COLUMN IF NOT EXISTS published_pdf_path text;

COMMENT ON COLUMN neta_ops.assets.published_pdf_path IS
  'Object path in the private customer-reports storage bucket. Populated by the staff app when a report-asset is approved/sent. Convention: {customer_id}/{job_id}/{asset_id}.pdf';

ALTER TABLE neta_ops.technical_reports
  ADD COLUMN IF NOT EXISTS published_pdf_path text;

COMMENT ON COLUMN neta_ops.technical_reports.published_pdf_path IS
  'Object path in the private customer-reports storage bucket (future oil-report workflow).';

-- 2. Private bucket for customer-downloadable report PDFs (and oil-report sources).
INSERT INTO storage.buckets (id, name, public)
VALUES ('customer-reports', 'customer-reports', false)
ON CONFLICT (id) DO UPDATE SET public = false;

-- 3. Storage access:
--   - Employees (staff app) may write/read objects here to publish report PDFs.
--   - Customers never read the bucket directly; the customer-report-download edge
--     function (service role) mints short-lived signed URLs after re-checking that
--     the asset belongs to the signed-in customer.
DROP POLICY IF EXISTS "Employees manage customer-reports objects" ON storage.objects;
CREATE POLICY "Employees manage customer-reports objects"
ON storage.objects
FOR ALL
TO authenticated
USING (bucket_id = 'customer-reports' AND common.is_employee_user())
WITH CHECK (bucket_id = 'customer-reports' AND common.is_employee_user());
