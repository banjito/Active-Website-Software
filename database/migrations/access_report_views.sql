-- ampOS ACCESS view tracking.
-- One row each time a customer opens a report, packet cover letter, or full
-- packet PDF in ACCESS. Written only by the customer-report-download edge
-- function (service role). Staff read it on the job's Deliverables tab.
-- Lives in common (not neta_ops) so it doesn't get a backup_reports snapshot trigger.

CREATE TABLE IF NOT EXISTS common.access_report_views (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  viewed_at timestamptz NOT NULL DEFAULT now(),
  auth_user_id uuid NOT NULL,
  customer_id uuid,
  viewer_email text,
  viewer_name text,
  job_id uuid,
  asset_id uuid,          -- set when a single report was opened
  deliverable_id uuid,    -- set when a packet cover letter / full packet was opened
  kind text NOT NULL CHECK (kind IN ('report', 'cover', 'packet'))
);

CREATE INDEX IF NOT EXISTS idx_access_report_views_job
  ON common.access_report_views (job_id, viewed_at DESC);
CREATE INDEX IF NOT EXISTS idx_access_report_views_asset
  ON common.access_report_views (asset_id);
CREATE INDEX IF NOT EXISTS idx_access_report_views_deliverable
  ON common.access_report_views (deliverable_id);

ALTER TABLE common.access_report_views ENABLE ROW LEVEL SECURITY;

-- Staff can read. Nobody writes from the browser; the edge function uses the
-- service role, which skips row security.
DROP POLICY IF EXISTS "Employees read ACCESS views" ON common.access_report_views;
CREATE POLICY "Employees read ACCESS views" ON common.access_report_views
  FOR SELECT TO authenticated
  USING (common.is_employee_user());

REVOKE ALL ON common.access_report_views FROM anon;
GRANT SELECT ON common.access_report_views TO authenticated;
GRANT ALL ON common.access_report_views TO service_role;
