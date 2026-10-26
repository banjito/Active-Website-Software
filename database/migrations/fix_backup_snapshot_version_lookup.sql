-- Fix: "Move to job" hits the 8s statement timeout (57014) at ~11+ reports
--
-- Why it was slow: neta_ops.fn_snapshot_report_json (the backup trigger on
-- 210 tables, including assets, job_assets and every report table) looks up
-- the next backup version with
--   source_id IS NOT DISTINCT FROM v_source_id
-- IS NOT DISTINCT FROM cannot use an index, so every fire scans every backup
-- row for that table (71k for assets, 16k for LV MCCB ATS 25, 13k for
-- job_assets). A move fires it 3 times per report, so it grows with the
-- number of reports. Worse on a cold cache: backup_reports is 1.4 GB.
--
-- Measured on prod (read-only EXPLAIN ANALYZE, warm cache, assets lookup):
--   before: 36 ms per fire
--   after:  0.2 ms per fire
--
-- Also speeds up every report save, since the same trigger fires on each.
--
-- Only change vs the live function: the version lookup uses plain "=" (with a
-- separate branch for a null id), so idx_backup_reports_lookup is used.
-- No index changes needed. Same version numbers out.

CREATE OR REPLACE FUNCTION neta_ops.fn_snapshot_report_json()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_payload_new jsonb;
  v_payload_old jsonb;
  v_source_id uuid;
  v_row_pk text;
  v_job_id uuid;
  v_report_type text;
  v_title text;
  v_next_version int;
begin
  -- Build full-row JSON payloads and scrub non-report fields
  -- Remove 'status' so backups don't store workflow state
  v_payload_new := to_jsonb(NEW) - 'status';
  v_payload_old := to_jsonb(OLD) - 'status';

  -- Only snapshot on INSERT, or on UPDATE where JSON payload changed
  if tg_op = 'UPDATE' and not (v_payload_new is distinct from v_payload_old) then
    return NEW;
  end if;

  -- Common metadata best-effort (all pulled from row JSON to avoid tight coupling)
  begin v_source_id := (to_jsonb(NEW)->>'id')::uuid; exception when others then v_source_id := null; end;
  begin v_row_pk := (to_jsonb(NEW)->>'id'); exception when others then v_row_pk := null; end;
  begin v_job_id := (to_jsonb(NEW)->>'job_id')::uuid; exception when others then v_job_id := null; end;
  begin v_report_type := (to_jsonb(NEW)->>'report_type'); exception when others then v_report_type := null; end;
  begin v_title := (to_jsonb(NEW)->>'title'); exception when others then v_title := null; end;

  -- Determine next version number for this source row within this table.
  -- Plain "=" (not IS NOT DISTINCT FROM) so idx_backup_reports_lookup is used.
  if v_source_id is null then
    select coalesce(max(version), 0) + 1 into v_next_version
    from neta_ops.backup_reports br
    where br.source_schema = tg_table_schema
      and br.source_table = tg_table_name
      and br.source_id is null;
  else
    select coalesce(max(version), 0) + 1 into v_next_version
    from neta_ops.backup_reports br
    where br.source_schema = tg_table_schema
      and br.source_table = tg_table_name
      and br.source_id = v_source_id;
  end if;

  insert into neta_ops.backup_reports(
    source_schema, source_table, source_id, row_pk, action, job_id, report_type, title, data, version, edited_by
  ) values (
    tg_table_schema, tg_table_name, v_source_id, v_row_pk, lower(tg_op), v_job_id, v_report_type, v_title, v_payload_new, v_next_version, auth.uid()
  );

  return NEW;
end; $function$;
