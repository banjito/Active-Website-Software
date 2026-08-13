-- Move report assets from one job to another.
--
-- Two jobs at the same site (e.g. the two DNN4 projects) means techs can file a report
-- under the wrong one. Until now the only fix was to open a fresh report on the right job
-- and retype every reading. This migration moves the existing rows instead.
--
-- WHAT "BEING ON A JOB" ACTUALLY MEANS FOR A REPORT
-- A report is tied to its job in three independent places, and all three have to agree or
-- the report half-moves and turns into a ghost:
--
--   1. neta_ops.job_assets            the (job_id, asset_id) link the Reports tab lists from
--   2. neta_ops.assets.file_url       'report:/jobs/{jobId}/{slug}/{reportId}' — the route
--                                     the report opens at; a stale job id here loads the
--                                     report under the old job's header
--   3. the report's own table         every report type has its own table with a job_id
--                                     column (switchgear_reports, panelboard_reports, ...)
--
-- Doing this from the client would mean a slug -> table map kept in sync with ~100 report
-- types by hand. Instead the report tables are discovered from the catalog, the same way
-- neta_ops.get_asset_test_dates() does it, so a new report type is handled with no edit
-- here.
--
-- SAFETY
-- The whole move is one function call, so it is one transaction: either all three places
-- agree afterwards or nothing changed. Report-table updates are additionally constrained
-- to rows whose job_id is *already* the source job, so a legacy row that happens to share
-- a primary key with a report in a different table cannot be dragged along.
--
-- Nothing is copied and nothing is deleted: the same report row keeps the same id, so
-- comments, flags, approvals and equipment links all follow it automatically.
-- Safe to re-run.

-- ── neta_ops.report_moves ─────────────────────────────────────────────────────
-- A report that changes jobs is a question waiting to be asked ("why is this on the other
-- project now?"). Log it.
CREATE TABLE IF NOT EXISTS neta_ops.report_moves (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id     UUID        NOT NULL REFERENCES neta_ops.assets(id) ON DELETE CASCADE,
  from_job_id  UUID        REFERENCES neta_ops.jobs(id) ON DELETE SET NULL,
  to_job_id    UUID        REFERENCES neta_ops.jobs(id) ON DELETE SET NULL,
  moved_by     UUID        REFERENCES auth.users(id),
  reason       TEXT,
  moved_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_report_moves_asset ON neta_ops.report_moves(asset_id);
CREATE INDEX IF NOT EXISTS idx_report_moves_to_job ON neta_ops.report_moves(to_job_id);
CREATE INDEX IF NOT EXISTS idx_report_moves_moved_at ON neta_ops.report_moves(moved_at DESC);

ALTER TABLE neta_ops.report_moves ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Employees can read report moves" ON neta_ops.report_moves;
DROP POLICY IF EXISTS "Employees can log report moves" ON neta_ops.report_moves;

CREATE POLICY "Employees can read report moves"
ON neta_ops.report_moves
FOR SELECT
USING (common.is_employee_user());

-- Append-only. The move function runs as the caller, so it needs INSERT, but a logged move
-- can only ever be attributed to whoever is signed in, and there is deliberately no
-- UPDATE or DELETE policy: history cannot be rewritten from the client.
CREATE POLICY "Employees can log report moves"
ON neta_ops.report_moves
FOR INSERT
WITH CHECK (common.is_employee_user() AND moved_by = auth.uid());

GRANT SELECT, INSERT ON neta_ops.report_moves TO authenticated;
GRANT SELECT, INSERT ON neta_ops.report_moves TO service_role;

-- ── neta_ops.move_report_assets_to_job ────────────────────────────────────────
-- Moves the given assets from one job to another and returns what it did, one row per
-- asset. Assets not actually linked to p_source_job_id are ignored rather than erroring,
-- so a stale selection in the UI cannot half-apply.
--
-- SECURITY INVOKER: the caller's RLS applies to job_assets, assets and every report table,
-- so this grants no reach beyond what the caller could already write by editing the report
-- normally. Who is *offered* the action is decided in the UI (report reviewers).
CREATE OR REPLACE FUNCTION neta_ops.move_report_assets_to_job(
  p_asset_ids     uuid[],
  p_source_job_id uuid,
  p_target_job_id uuid,
  p_reason        text DEFAULT NULL
)
RETURNS TABLE (
  asset_id            uuid,
  asset_name          text,
  new_file_url        text,
  report_row_updated  boolean
)
LANGUAGE plpgsql
SET search_path = neta_ops, common, public
AS $fn$
DECLARE
  v_asset_ids   uuid[];
  v_report_ids  uuid[];
  v_updated_ids uuid[] := ARRAY[]::uuid[];
  v_batch       uuid[];
  v_table       text;
BEGIN
  IF p_asset_ids IS NULL OR cardinality(p_asset_ids) = 0 THEN
    RETURN;
  END IF;

  IF p_source_job_id IS NULL OR p_target_job_id IS NULL THEN
    RAISE EXCEPTION 'Both a source job and a target job are required';
  END IF;

  IF p_source_job_id = p_target_job_id THEN
    RAISE EXCEPTION 'The reports are already on that job';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM neta_ops.jobs j WHERE j.id = p_target_job_id) THEN
    RAISE EXCEPTION 'Target job % does not exist', p_target_job_id;
  END IF;

  -- Only the assets genuinely linked to the source job are in play.
  SELECT array_agg(ja.asset_id)
  INTO v_asset_ids
  FROM neta_ops.job_assets ja
  WHERE ja.job_id = p_source_job_id
    AND ja.asset_id = ANY(p_asset_ids);

  IF v_asset_ids IS NULL OR cardinality(v_asset_ids) = 0 THEN
    RETURN;
  END IF;

  -- The report row id is the last path segment of the file_url, for both
  -- 'report:/jobs/{job}/{slug}/{reportId}' and the custom-form and grounding variants.
  -- Uploaded documents (http URLs) have no report row and simply drop out here.
  SELECT array_agg(DISTINCT right(lower(a.file_url), 36)::uuid)
  INTO v_report_ids
  FROM neta_ops.assets a
  WHERE a.id = ANY(v_asset_ids)
    AND lower(a.file_url) ~ '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';

  -- 1. The job link. An asset already linked to the target job (someone linked it to both)
  --    would collide on (job_id, asset_id), so drop the source link in that case instead.
  DELETE FROM neta_ops.job_assets ja
  WHERE ja.job_id = p_source_job_id
    AND ja.asset_id = ANY(v_asset_ids)
    AND EXISTS (
      SELECT 1 FROM neta_ops.job_assets existing
      WHERE existing.job_id = p_target_job_id
        AND existing.asset_id = ja.asset_id
    );

  UPDATE neta_ops.job_assets ja
  SET job_id = p_target_job_id
  WHERE ja.job_id = p_source_job_id
    AND ja.asset_id = ANY(v_asset_ids);

  -- 2. The route stored in file_url. Only the /jobs/{id}/ segment changes: the slug, the
  --    substation folder and the report id all stay exactly as they are.
  UPDATE neta_ops.assets a
  SET file_url = regexp_replace(
        a.file_url,
        '/jobs/' || p_source_job_id::text || '/',
        '/jobs/' || p_target_job_id::text || '/',
        'i'
      )
  WHERE a.id = ANY(v_asset_ids)
    AND a.file_url ~* ('/jobs/' || p_source_job_id::text || '/');

  -- 3. The report's own row. Every neta_ops table with a uuid `id` and a `job_id` is a
  --    candidate; the job bookkeeping tables are excluded by name (same list as
  --    neta_ops.get_asset_test_dates). Matching on job_id = source keeps the update from
  --    touching an unrelated row that shares a primary key.
  IF v_report_ids IS NOT NULL AND cardinality(v_report_ids) > 0 THEN
    FOR v_table IN
      SELECT c.table_name::text
      FROM information_schema.columns c
      -- Base tables only. A view with the same shape would be caught by the column test
      -- below and then fail the UPDATE, taking the whole move down with it.
      JOIN information_schema.tables t
        ON t.table_schema = c.table_schema
       AND t.table_name = c.table_name
       AND t.table_type = 'BASE TABLE'
      WHERE c.table_schema = 'neta_ops'
        AND c.table_name::text NOT IN (
          'assets', 'job_assets', 'job_comments', 'job_notes', 'job_pictures',
          'job_costs', 'job_revenue', 'job_expenses', 'job_contracts',
          'job_change_orders', 'job_notifications', 'deliverables',
          'generated_documents', 'miscellaneous_documents', 'one_line_drawings',
          'resource_allocations', 'technician_assignments', 'backup_reports',
          'report_moves', 'substation_folders', 'substation_folder_assignments'
        )
      GROUP BY c.table_name
      HAVING bool_or(c.column_name::text = 'id' AND c.data_type::text = 'uuid')
         AND bool_or(c.column_name::text = 'job_id')
    LOOP
      EXECUTE format(
        'WITH moved AS ('
        || ' UPDATE neta_ops.%I SET job_id = $1'
        || ' WHERE id = ANY($2) AND job_id = $3'
        || ' RETURNING id'
        || ') SELECT COALESCE(array_agg(id), ARRAY[]::uuid[]) FROM moved',
        v_table
      )
      INTO v_batch
      USING p_target_job_id, v_report_ids, p_source_job_id;

      IF cardinality(v_batch) > 0 THEN
        v_updated_ids := v_updated_ids || v_batch;
      END IF;
    END LOOP;
  END IF;

  -- 4. The log.
  INSERT INTO neta_ops.report_moves (asset_id, from_job_id, to_job_id, moved_by, reason)
  SELECT unnest(v_asset_ids), p_source_job_id, p_target_job_id, auth.uid(), NULLIF(btrim(p_reason), '');

  RETURN QUERY
  SELECT a.id,
         a.name,
         a.file_url,
         -- CASE, not AND: the uuid cast has to be guarded by the pattern test, and only a
         -- CASE guarantees the test runs first. False here means the link and the URL
         -- moved but no report row did — an uploaded document, or a report whose own row
         -- was already pointing at some other job.
         COALESCE(
           CASE
             WHEN lower(a.file_url) ~ '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
               THEN right(lower(a.file_url), 36)::uuid = ANY(v_updated_ids)
           END,
           false
         ) AS report_row_updated
  FROM neta_ops.assets a
  WHERE a.id = ANY(v_asset_ids)
  ORDER BY a.name;
END;
$fn$;

COMMENT ON FUNCTION neta_ops.move_report_assets_to_job(uuid[], uuid, uuid, text) IS
  'Moves report assets between jobs: rewrites the job_assets link, the file_url route and the report row''s own job_id in one transaction.';

REVOKE ALL ON FUNCTION neta_ops.move_report_assets_to_job(uuid[], uuid, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION neta_ops.move_report_assets_to_job(uuid[], uuid, uuid, text)
  TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
