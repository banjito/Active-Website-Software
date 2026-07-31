-- Report test date resolution
--
-- The "Oldest" age shown in the Review Shortcuts panel was derived from
-- neta_ops.assets.created_at, which is when the report record was first
-- created (i.e. when the tech started filling it out), not when the equipment
-- was actually tested. A report started in May and tested/submitted in July
-- therefore read as "68d ago".
--
-- The metric the business tracks is the test date recorded inside the report
-- itself. Every report type stores that date in its own table under its own
-- key (report_info.date, report_data.date, data.testDate, a plain "date"
-- column, ...), so this migration adds:
--
--   neta_ops.parse_report_date(text)   -- tolerant text -> date normalizer
--   neta_ops.get_asset_test_dates(uuid[]) -- asset id -> test date
--
-- get_asset_test_dates walks every report table in neta_ops by primary key, so
-- new report tables are picked up automatically with no code change as long as
-- they keep one of the known date containers.

-- ---------------------------------------------------------------------------
-- parse_report_date: the "forced formatting" for test dates.
--
-- Report dates are free-form text captured by <input type="date"> (ISO) or, in
-- a few older reports, typed by hand ("6/16/2026"). Anything that is not a
-- plausible calendar date resolves to NULL so callers can fall back rather
-- than render a nonsense age (real data contains e.g. '0015-12-13' from a
-- mistyped year).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION neta_ops.parse_report_date(p_value text)
RETURNS date
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_text text;
  v_date date;
BEGIN
  IF p_value IS NULL THEN
    RETURN NULL;
  END IF;

  v_text := btrim(p_value);
  IF v_text = '' THEN
    RETURN NULL;
  END IF;

  BEGIN
    IF v_text ~ '^\d{4}-\d{1,2}-\d{1,2}' THEN
      -- ISO, optionally followed by a time component we do not care about
      v_date := to_date(substring(v_text from '^\d{4}-\d{1,2}-\d{1,2}'), 'YYYY-MM-DD');
    ELSIF v_text ~ '^\d{1,2}/\d{1,2}/\d{4}$' THEN
      v_date := to_date(v_text, 'FMMM/FMDD/YYYY');
    ELSIF v_text ~ '^\d{1,2}/\d{1,2}/\d{2}$' THEN
      v_date := to_date(v_text, 'FMMM/FMDD/YY');
    ELSIF v_text ~ '^\d{1,2}-\d{1,2}-\d{4}$' THEN
      v_date := to_date(v_text, 'FMMM-FMDD-YYYY');
    ELSE
      RETURN NULL;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RETURN NULL;
  END;

  -- Reject typos that parse cleanly but cannot be a test date.
  IF v_date < DATE '2000-01-01' OR v_date > (CURRENT_DATE + INTERVAL '1 year') THEN
    RETURN NULL;
  END IF;

  RETURN v_date;
END;
$$;

COMMENT ON FUNCTION neta_ops.parse_report_date(text) IS
  'Normalizes a report test date (ISO or M/D/YYYY text) to a date; NULL when missing or implausible.';

-- ---------------------------------------------------------------------------
-- get_asset_test_dates: asset id -> test date recorded in the linked report.
--
-- assets.file_url is 'report:/jobs/{jobId}/{slug}/{reportId}' or
-- 'custom-form:/jobs/{jobId}/custom-form/{templateId}/{instanceId}', so the
-- trailing path segment is the report row id in both cases. Report ids are
-- uuids, so a primary key probe across the report tables resolves the row
-- without needing a slug -> table map to be kept in sync.
--
-- SECURITY INVOKER: the caller's RLS applies to both assets and the report
-- tables, so this exposes nothing the caller could not already read.
-- ---------------------------------------------------------------------------
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
    resolved_report AS (
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
GRANT EXECUTE ON FUNCTION neta_ops.parse_report_date(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION neta_ops.get_asset_test_dates(uuid[]) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
