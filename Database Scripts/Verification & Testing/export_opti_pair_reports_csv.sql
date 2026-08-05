-- ============================================================================
-- Export reports for specific OPTI cable runs as CSV
-- ----------------------------------------------------------------------------
-- Target UUID: 8c68cc86-e40a-4c39-b39d-36654b32ddf2  (resolves to 1 job)
-- Wanted runs: OPTI-14A <-> OPTI-15A  and  OPTI-16A <-> OPTI-17A
--
-- Same output shape as OPTION 2 in export_all_reports_csv.sql (one CSV, one row
-- per report, full record as JSON), narrowed to reports that reference BOTH
-- ends of one of the requested cable runs.
--
-- HOW THE MATCH WORKS -- and why it is not a column lookup:
-- The OPTI designation is scattered across different jsonb keys depending on
-- the report type. In the medium_voltage_vlf_mts_reports sample it appears in
-- data.location ("OPTI-15A/OPTI-16A"), data.identifier, data.cable_info.from,
-- data.cable_info.to and data.cable_info.testedFrom -- and the ~50 report
-- tables do not even agree on the top-level jsonb column name (`data`,
-- `report_data`, `report_info`, ...). So these queries regex the ENTIRE row
-- cast to text. That is table-agnostic and key-agnostic.
--
-- IT ALSO SURVIVES TYPOS IN THE DATA. The sample row's identifier reads
-- "OPTI-15A GIS TO OPTI-16 GIS SET B" -- note "OPTI-16", missing the A. A match
-- against one specific field would miss it; a whole-row match still hits
-- because data.location spells the same endpoint correctly. For the same
-- reason the unit pattern treats the trailing letter as OPTIONAL:
--   'OPTI-16A?([^0-9]|$)'  matches "OPTI-16A" and "OPTI-16", but NOT "OPTI-160"
--
-- ASSUMPTION: your message said "4A to 15A"; the message before it said
-- "14A to 15A". This script uses 14A. If you really meant OPTI-4A, change the
-- `pairs` list -- it is one edit and every query below reads from it.
--
-- Run in the Supabase SQL editor. No psql needed.
-- ============================================================================


-- ############################################################################
-- QUERY 1 -- RUN THIS FIRST. Which OPTI runs actually exist on this job?
--
-- Lists every OPTI designation found in every report, so you can confirm the
-- pairs are named the way you expect BEFORE filtering. Worth 10 seconds: the
-- one sample row you pasted is a 15A<->16A run, which matches NEITHER of the
-- requested pairs, so it is worth seeing the real inventory first.
--
-- Only regex-extracted OPTI tokens are returned (pure ASCII), so this is safe
-- to push through query_to_xml -- raw report free-text is not.
-- ############################################################################
WITH params AS (
  SELECT '8c68cc86-e40a-4c39-b39d-36654b32ddf2'::uuid AS target_id
),
report_tables AS (
  SELECT c.table_name
  FROM information_schema.columns c
  JOIN information_schema.tables t
    ON t.table_schema = c.table_schema
   AND t.table_name   = c.table_name
   AND t.table_type   = 'BASE TABLE'
  WHERE c.table_schema = 'neta_ops'
    AND c.column_name  = 'job_id'
    AND (c.table_name LIKE '%\_reports' OR c.table_name = 'custom_form_instances')
    AND c.table_name <> 'backup_reports'   -- audit/version history, not reports
  GROUP BY c.table_name
),
rows_xml AS (
  SELECT
    rt.table_name,
    unnest(xpath('/table/row',
      query_to_xml(
        format(
          'SELECT t.id::text AS id, '
          '(SELECT string_agg(DISTINCT m.arr[1], '' '' ORDER BY m.arr[1]) '
          ' FROM regexp_matches(row_to_json(t)::text, ''OPTI-[0-9]+[A-Z]?'', ''g'') AS m(arr)'
          ') AS opti_tags '
          'FROM neta_ops.%I t WHERE t.job_id IN '
          '(SELECT id FROM neta_ops.jobs WHERE %L::uuid IN '
          '(customer_id, opportunity_id, contact_id, user_id, id))',
          rt.table_name, p.target_id),
        false, false, '')
    )) AS x
  FROM report_tables rt, params p
)
SELECT
  r.table_name                                  AS report_table,
  (xpath('/row/opti_tags/text()', r.x))[1]::text AS opti_units_referenced,
  count(*)                                      AS report_count,
  string_agg((xpath('/row/id/text()', r.x))[1]::text, ', ') AS report_ids
FROM rows_xml r
WHERE (xpath('/row/opti_tags/text()', r.x))[1] IS NOT NULL   -- drop non-OPTI reports
GROUP BY r.table_name, (xpath('/row/opti_tags/text()', r.x))[1]::text
ORDER BY report_table, opti_units_referenced;


-- ############################################################################
-- QUERY 2 -- The export. Run it, then click "Download CSV".
--
-- Direct query against medium_voltage_vlf_mts_reports, which is where the MV
-- cable runs live (30 of this job's 46 reports). Immediately runnable, no
-- generator step. If QUERY 1 shows matching runs in OTHER tables too, use
-- QUERY 3 instead to sweep everything.
-- ############################################################################
WITH params AS (
  SELECT '8c68cc86-e40a-4c39-b39d-36654b32ddf2'::uuid AS target_id
),
-- EDIT PAIRS HERE. Unit numbers only; the trailing letter is matched loosely.
pairs AS (
  SELECT * FROM (VALUES
    ('14', '15'),
    ('16', '17')
  ) AS v(unit_a, unit_b)
),
scoped AS (
  SELECT t.*, row_to_json(t)::text AS row_text
  FROM neta_ops.medium_voltage_vlf_mts_reports t, params p
  WHERE t.job_id IN (
    SELECT j.id FROM neta_ops.jobs j
    WHERE p.target_id IN (j.customer_id, j.opportunity_id, j.contact_id, j.user_id, j.id)
  )
)
SELECT
  pr.unit_a || 'A-' || pr.unit_b || 'A'          AS matched_run,
  s.data ->> 'identifier'                        AS identifier,
  s.data ->> 'location'                          AS location,
  s.data ->> 'equipment_location'                AS equipment_location,
  s.data -> 'cable_info' ->> 'from'              AS cable_from,
  s.data -> 'cable_info' ->> 'to'                AS cable_to,
  s.data ->> 'status'                            AS pass_fail,
  s.data ->> 'test_date'                         AS test_date,
  s.data ->> 'tested_by'                         AS tested_by,
  s.data ->> 'job_number'                        AS job_number,
  s.data ->> 'customer_name'                     AS customer_name,
  (SELECT string_agg(DISTINCT m.arr[1], ' ' ORDER BY m.arr[1])
     FROM regexp_matches(s.row_text, 'OPTI-[0-9]+[A-Z]?', 'g') AS m(arr)) AS opti_units_referenced,
  (s.deleted_at IS NOT NULL)                     AS is_deleted,
  s.created_at,
  s.updated_at,
  s.id                                           AS report_id,
  s.job_id,
  s.row_text                                     AS report_data   -- full record as JSON
FROM scoped s
JOIN pairs pr
  ON s.row_text ~* ('OPTI-' || pr.unit_a || 'A?([^0-9]|$)')
 AND s.row_text ~* ('OPTI-' || pr.unit_b || 'A?([^0-9]|$)')
-- Uncomment to exclude soft-deleted reports:
-- WHERE s.deleted_at IS NULL
ORDER BY matched_run, identifier, s.created_at;


-- ############################################################################
-- QUERY 3 -- Same export, but sweeping ALL report tables (Option 2 style).
--
-- Use this if QUERY 1 shows matching OPTI runs outside
-- medium_voltage_vlf_mts_reports.
--
-- STEP 1: run this generator. It returns one text cell.
-- STEP 2: copy that cell into a new query, run it, Download CSV.
--
-- Generated rather than executed directly because the ~50 report tables have
-- no common column shape, and because pushing raw report free-text through
-- query_to_xml can fail on control characters that are not legal XML.
-- ############################################################################
WITH params AS (
  SELECT '8c68cc86-e40a-4c39-b39d-36654b32ddf2'::uuid AS target_id
),
pairs AS (
  SELECT * FROM (VALUES
    ('14', '15'),
    ('16', '17')
  ) AS v(unit_a, unit_b)
),
pair_predicate AS (
  SELECT string_agg(
    format('(x.r ~* %L AND x.r ~* %L)',
      'OPTI-' || unit_a || 'A?([^0-9]|$)',
      'OPTI-' || unit_b || 'A?([^0-9]|$)'),
    ' OR ' ORDER BY unit_a) AS pred
  FROM pairs
),
report_tables AS (
  SELECT c.table_name
  FROM information_schema.columns c
  JOIN information_schema.tables t
    ON t.table_schema = c.table_schema
   AND t.table_name   = c.table_name
   AND t.table_type   = 'BASE TABLE'
  WHERE c.table_schema = 'neta_ops'
    AND c.column_name  = 'job_id'
    AND (c.table_name LIKE '%\_reports' OR c.table_name = 'custom_form_instances')
    AND c.table_name <> 'backup_reports'
  GROUP BY c.table_name
)
-- NOTE: every literal below is a plain '...' string. Postgres concatenates
-- adjacent string constants separated by a newline, but an E'...' literal
-- cannot participate in that implicit concatenation -- mixing the two is a
-- syntax error. Newlines in the OUTPUT come from the separator arguments,
-- which are standalone E-strings and therefore fine.
SELECT string_agg(
  format(
    'SELECT %L::text AS report_table, '
    't.id::text AS report_id, '
    't.job_id::text AS job_id, '
    -- identifier/location live under different jsonb roots per table; probing
    -- the row JSON returns NULL instead of erroring when a key is absent.
    'COALESCE(x.r::json -> ''data'' ->> ''identifier'', '
    'x.r::json -> ''report_info'' ->> ''identifier'', '
    'x.r::json -> ''report_data'' ->> ''identifier'') AS identifier, '
    'COALESCE(x.r::json -> ''data'' ->> ''location'', '
    'x.r::json -> ''report_info'' ->> ''location'', '
    'x.r::json -> ''report_data'' ->> ''location'') AS location, '
    '(SELECT string_agg(DISTINCT m.arr[1], '' '' ORDER BY m.arr[1]) '
    'FROM regexp_matches(x.r, ''OPTI-[0-9]+[A-Z]?'', ''g'') AS m(arr)) '
    'AS opti_units_referenced, '
    'x.r AS report_data '
    'FROM neta_ops.%I t '
    'CROSS JOIN LATERAL (SELECT row_to_json(t)::text AS r) x '
    'WHERE t.job_id IN (SELECT id FROM neta_ops.jobs WHERE %L::uuid IN '
    '(customer_id, opportunity_id, contact_id, user_id, id)) '
    'AND (%s)',
    rt.table_name, rt.table_name, p.target_id, pp.pred),
  E'\nUNION ALL\n' ORDER BY rt.table_name
) || E'\nORDER BY report_table, identifier;'  AS generated_sql
FROM report_tables rt, params p, pair_predicate pp;
