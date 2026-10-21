-- Fix: neta_ops.get_asset_test_dates hits the 8s statement timeout (57014)
--
-- Why it was slow: the planner guesses the asset list (asset_report) has 1 row,
-- because it cannot estimate the file_url regex filter. With 1 row it picks a
-- nested loop and re-runs the whole UNION over all ~68 report tables once per
-- asset. 191 assets x 68 tables = ~2.8M page reads, 6-10s per call.
--
-- Fix: AS MATERIALIZED on resolved_report, so the report tables are read once
-- per call and the result is joined to the asset list in memory. Same rows out.
-- Measured on prod with 200 review assets (read-only EXPLAIN ANALYZE):
--   before: 6.9s as postgres, 7.5-10.3s as a logged-in employee (RLS on)
--   after:  0.08s as postgres, 0.25s as a logged-in employee
--
-- No index changes needed: every report table lookup was already an index
-- probe on the primary key; the problem was how many times it ran.
--
-- Only change vs add_report_test_date_rpc.sql: the word MATERIALIZED.

CREATE OR REPLACE FUNCTION neta_ops.get_asset_test_dates(p_asset_ids uuid[])
RETURNS TABLE (asset_id uuid, test_date date)
LANGUAGE plpgsql
AS $fn$
DECLARE
  v_union text;
  v_sql   text;
BEGIN
  IF p_asset_ids IS NULL OR cardinality(p_asset_ids) = 0 THEN
    RETURN;
  END IF;

  -- One SELECT per report table, ordered coalesce of every date container that
  -- table actually has. Built from the catalog so new report tables need no
  -- edit here.
  WITH candidate(prio, required_column, required_type, expr) AS (
    VALUES
      ( 1, 'report_info', 'jsonb', $x$neta_ops.parse_report_date(report_info->>'date')$x$),
      ( 2, 'report_info', 'jsonb', $x$neta_ops.parse_report_date(report_info->>'testDate')$x$),
      ( 3, 'report_info', 'jsonb', $x$neta_ops.parse_report_date(report_info->>'test_date')$x$),
      ( 4, 'report_info', 'jsonb', $x$neta_ops.parse_report_date(report_info->'reportInfo'->>'date')$x$),
      ( 5, 'report_info', 'jsonb', $x$neta_ops.parse_report_date(report_info->>'date_prepared')$x$),
      ( 6, 'report_data', 'jsonb', $x$neta_ops.parse_report_date(report_data->>'date')$x$),
      ( 7, 'report_data', 'jsonb', $x$neta_ops.parse_report_date(report_data->>'testDate')$x$),
      ( 8, 'report_data', 'jsonb', $x$neta_ops.parse_report_date(report_data->>'test_date')$x$),
      ( 9, 'report_data', 'jsonb', $x$neta_ops.parse_report_date(report_data->'reportInfo'->>'date')$x$),
      (10, 'data',        'jsonb', $x$neta_ops.parse_report_date(data->>'date')$x$),
      (11, 'data',        'jsonb', $x$neta_ops.parse_report_date(data->>'testDate')$x$),
      (12, 'data',        'jsonb', $x$neta_ops.parse_report_date(data->>'test_date')$x$),
      (13, 'data',        'jsonb', $x$neta_ops.parse_report_date(data->'reportInfo'->>'date')$x$),
      -- Custom form instances keep their fields in data.sections.{section}.{field}
      (14, 'template_id', 'uuid',  $x$(
             SELECT neta_ops.parse_report_date(fld.value #>> '{}')
             FROM jsonb_each(CASE WHEN jsonb_typeof(data->'sections') = 'object'
                                  THEN data->'sections' ELSE '{}'::jsonb END) AS sec(section_key, section_value),
                  jsonb_each(CASE WHEN jsonb_typeof(sec.section_value) = 'object'
                                  THEN sec.section_value ELSE '{}'::jsonb END) AS fld(field_key, value)
             WHERE lower(fld.field_key) IN ('date', 'testdate', 'test_date', 'dateoftest', 'datetested')
               AND neta_ops.parse_report_date(fld.value #>> '{}') IS NOT NULL
             LIMIT 1)$x$),
      -- Plain columns: NULL required_type means "whatever type, cast it to text"
      (15, 'date',        NULL,    $x$neta_ops.parse_report_date("date"::text)$x$),
      (16, 'report_date', NULL,    $x$neta_ops.parse_report_date(report_date::text)$x$),
      (17, 'test_date',   NULL,    $x$neta_ops.parse_report_date(test_date::text)$x$)
  ),
  report_table AS (
    SELECT c.table_name
    FROM information_schema.columns c
    WHERE c.table_schema = 'neta_ops'
      AND c.table_name::text NOT IN (
        -- job bookkeeping tables that also carry job_id and a date column
        'assets', 'job_assets', 'job_comments', 'job_notes', 'job_pictures',
        'job_costs', 'job_revenue', 'job_expenses', 'job_contracts',
        'job_change_orders', 'job_notifications', 'deliverables',
        'generated_documents', 'miscellaneous_documents', 'one_line_drawings',
        'resource_allocations', 'technician_assignments', 'backup_reports'
      )
    GROUP BY c.table_name
    HAVING bool_or(c.column_name::text = 'id' AND c.data_type::text = 'uuid')
       AND bool_or(c.column_name::text = 'job_id')
  )
  SELECT string_agg(stmt, E'\n    UNION ALL ')
  INTO v_union
  FROM (
    SELECT format(
             'SELECT id AS report_id, job_id AS report_job_id, COALESCE(%s) AS test_date'
             || ' FROM neta_ops.%I WHERE id IN (SELECT report_id FROM asset_report)',
             string_agg(candidate.expr, ', ' ORDER BY candidate.prio),
             report_table.table_name
           ) AS stmt
    FROM report_table
    JOIN information_schema.columns col
      ON col.table_schema = 'neta_ops'
     AND col.table_name = report_table.table_name
    JOIN candidate
      ON candidate.required_column = col.column_name::text
     AND (candidate.required_type IS NULL
          OR candidate.required_type = col.data_type::text)
    GROUP BY report_table.table_name
  ) AS per_table;

  IF v_union IS NULL THEN
    RETURN;
  END IF;

  -- A handful of legacy rows were copied between report tables and share a
  -- primary key, so prefer the copy whose job_id matches the job in file_url.
  v_sql := format($q$
    WITH asset_report AS (
      SELECT a.id AS asset_id,
             right(lower(a.file_url), 36)::uuid AS report_id,
             substring(lower(a.file_url) from '/jobs/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/')::uuid AS job_id
      FROM neta_ops.assets a
      WHERE a.id = ANY($1)
        AND lower(a.file_url) ~ '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    ),
    resolved_report AS MATERIALIZED (
      %s
    )
    SELECT DISTINCT ON (ar.asset_id) ar.asset_id, rd.test_date
    FROM asset_report ar
    JOIN resolved_report rd ON rd.report_id = ar.report_id
    WHERE rd.test_date IS NOT NULL
    ORDER BY ar.asset_id,
             (rd.report_job_id IS NOT DISTINCT FROM ar.job_id) DESC,
             rd.test_date DESC
  $q$, v_union);

  RETURN QUERY EXECUTE v_sql USING p_asset_ids;
END;
$fn$;

COMMENT ON FUNCTION neta_ops.get_asset_test_dates(uuid[]) IS
  'Returns the test date recorded inside each report asset, resolved from whichever report table the asset points at.';

REVOKE ALL ON FUNCTION neta_ops.get_asset_test_dates(uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION neta_ops.get_asset_test_dates(uuid[]) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';

-- ---------------------------------------------------------------------------
-- Check (run on its own before and after for a timing comparison)
--   before: fix_applied = f, elapsed_ms ~ 6000-7000
--   after:  fix_applied = t, elapsed_ms under 500
--   assets_with_test_date should match between the two runs (105 on 2026-10-21)
-- ---------------------------------------------------------------------------
SELECT
  (SELECT prosrc LIKE '%resolved_report AS MATERIALIZED%'
     FROM pg_proc
    WHERE oid = 'neta_ops.get_asset_test_dates(uuid[])'::regprocedure) AS fix_applied,
  count(*) AS assets_with_test_date,
  round(extract(epoch FROM clock_timestamp() - statement_timestamp()) * 1000) AS elapsed_ms
FROM neta_ops.get_asset_test_dates(ARRAY(
  SELECT id FROM neta_ops.assets
  WHERE status = 'ready_for_review'
  ORDER BY id
  LIMIT 200));
