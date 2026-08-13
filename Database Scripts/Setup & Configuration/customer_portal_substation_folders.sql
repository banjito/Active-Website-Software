-- Customer Portal: the folder level above substation.
--
-- Run in the Supabase SQL Editor after create_substation_folders.sql.
--
-- A SECOND function rather than extra columns on common.customer_report_assets(). Adding
-- columns there means DROP FUNCTION + CREATE, which leaves the live portal broken for the
-- gap and forces a lockstep redeploy. A separate function is additive: a portal build that
-- doesn't know about it carries on grouping by substation alone.
--
-- SCOPE, AND WHY IT MATTERS HERE
-- neta_ops.substation_folders is employee-only under RLS, and the portal must never be
-- granted access to it: a *site* is shared across customers (see
-- create_asset_tracking_tables.sql), so site-scoped folder names are cross-customer by
-- construction. This function is the only door, and it is narrow on purpose:
--
--   * rows only for jobs where j.customer_id = common.current_customer_id()
--   * a folder is returned only when it actually holds a substation that appears on one of
--     that customer's own approved/sent reports — an unused folder is never named
--   * job-scoped assignments override inherited site ones, exactly as the staff app resolves
--     them, so the customer sees the same grouping the office does

DROP FUNCTION IF EXISTS common.customer_substation_folders();

CREATE FUNCTION common.customer_substation_folders()
RETURNS TABLE (
  job_id         uuid,
  substation_key text,
  folder_id      uuid,
  folder_name    text,
  folder_sort    integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = common, neta_ops, public
AS $$
  WITH visible_jobs AS (
    SELECT j.id, j.site_id
    FROM neta_ops.jobs j
    WHERE j.customer_id = common.current_customer_id()
      AND j.deleted_at IS NULL
  ),
  -- The substations the customer can actually see, normalised the same way the app does.
  visible_substations AS (
    SELECT DISTINCT
      vj.id AS job_id,
      vj.site_id,
      lower(regexp_replace(btrim(a.substation), '\s+', ' ', 'g')) AS substation_key
    FROM visible_jobs vj
    JOIN neta_ops.job_assets ja ON ja.job_id = vj.id
    JOIN neta_ops.assets a      ON a.id = ja.asset_id
    WHERE lower(coalesce(a.status, '')) IN ('approved', 'sent')
      AND btrim(coalesce(a.substation, '')) <> ''
  ),
  -- Job scope wins over site scope. Note this turns on whether the job row EXISTS, not on
  -- whether its folder_id is non-null: a job row with a NULL folder means "deliberately
  -- pulled out of the folder this job inherited", so COALESCE would be exactly wrong here
  -- and would put the substation straight back into the folder it was dragged out of.
  resolved AS (
    SELECT
      vs.job_id,
      vs.substation_key,
      CASE
        WHEN jm.job_id IS NOT NULL THEN jm.folder_id
        ELSE sm.folder_id
      END AS folder_id
    FROM visible_substations vs
    LEFT JOIN neta_ops.substation_folder_assignments jm
      ON jm.job_id = vs.job_id AND jm.substation_key = vs.substation_key
    LEFT JOIN neta_ops.substation_folder_assignments sm
      ON sm.site_id = vs.site_id AND sm.substation_key = vs.substation_key
  )
  SELECT r.job_id, r.substation_key, f.id, f.name, f.sort_order
  FROM resolved r
  JOIN neta_ops.substation_folders f ON f.id = r.folder_id
  WHERE f.deleted_at IS NULL;
$$;

REVOKE ALL ON FUNCTION common.customer_substation_folders() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION common.customer_substation_folders() TO authenticated;

COMMENT ON FUNCTION common.customer_substation_folders() IS 'Portal-visible folder grouping for substations. Scoped to common.current_customer_id() and to folders that actually hold one of that customer''s visible substations; the folder tables themselves stay employee-only.';
