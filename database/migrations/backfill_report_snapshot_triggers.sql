-- Restore backup coverage to report tables that never got a snapshot trigger.
--
-- Background
-- ----------
-- 2025-11-04_backup_reports.sql created neta_ops.backup_reports, attached
-- snapshot triggers to every table that existed at the time, and installed an
-- event trigger so tables created later would be picked up automatically.
--
-- The event trigger is the part that did not hold. CREATE EVENT TRIGGER needs
-- superuser, which the migration role does not have on Supabase, so every
-- report table added since 2025-11-04 has been running with no version history
-- at all. As of 2026-08-27 that was 23 tables holding 2,314 report rows,
-- including lv_molded_case_circuit_breaker_ats25 with 1,821 of them.
--
-- The cost of that is not theoretical. On Core Scientific DNN4, panelboard
-- SWBD-RPP-9B-4 was retyped into SWBD-RPP-18B-3 on an already-saved row; the
-- 9B-4 readings survived only because the panelboard table *was* covered. The
-- same thing on any breaker report would be unrecoverable.
--
-- What this does
-- --------------
-- 1. Adds neta_ops.fn_attach_missing_report_snapshots(), which attaches the
--    snapshot trigger to every report table that is missing it and returns
--    what it touched.
-- 2. Runs it once.
-- 3. Retries the event trigger, and reports plainly if the role still cannot
--    create one, so the gap is visible instead of silent.
--
-- A "report table" here is a neta_ops base table with a job_id column and at
-- least one jsonb column. That is the shape every report in this schema has,
-- and it excludes the scheduling and equipment tables that share the schema.
--
-- Safe to re-run. Attaching is idempotent: fn_attach_report_snapshot drops any
-- existing trigger by the same name before creating it.
--
-- Run this again after adding a new report table, until the event trigger can
-- be created by a role that is allowed to.

begin;

-- Fail fast rather than half-apply if the 2025-11-04 migration is not in place.
do $$
begin
  if to_regprocedure('neta_ops.fn_attach_report_snapshot(text,text)') is null then
    raise exception
      'neta_ops.fn_attach_report_snapshot is missing; apply 2025-11-04_backup_reports.sql first';
  end if;
end $$;

create or replace function neta_ops.fn_attach_missing_report_snapshots()
returns table (table_name text, action text)
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  v_has_trigger boolean;
begin
  for r in
    select c.relname::text as tbl
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'neta_ops'
      and c.relkind = 'r'
      and c.relname <> 'backup_reports'
      -- Looks like a report: filed against a job, stores a JSON payload.
      and exists (
        select 1 from pg_attribute a
        where a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped
          and a.attname = 'job_id'
      )
      and exists (
        select 1 from pg_attribute a
        join pg_type t on t.oid = a.atttypid
        where a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped
          and t.typname = 'jsonb'
      )
    order by c.relname
  loop
    -- Match on the function the trigger calls, not on a name, because
    -- fn_attach_report_snapshot hashes names longer than 63 bytes.
    select exists (
      select 1
      from pg_trigger tg
      join pg_class tc on tc.oid = tg.tgrelid
      join pg_namespace tn on tn.oid = tc.relnamespace
      where tn.nspname = 'neta_ops'
        and tc.relname = r.tbl
        and not tg.tgisinternal
        and tg.tgfoid = 'neta_ops.fn_snapshot_report_json()'::regprocedure
    ) into v_has_trigger;

    if v_has_trigger then
      table_name := r.tbl; action := 'already covered'; return next;
    else
      perform neta_ops.fn_attach_report_snapshot('neta_ops', r.tbl);
      table_name := r.tbl; action := 'trigger attached'; return next;
    end if;
  end loop;
end $$;

revoke all on function neta_ops.fn_attach_missing_report_snapshots() from public;
grant execute on function neta_ops.fn_attach_missing_report_snapshots() to service_role;

-- Attach everything that is missing, and print the result so the run is auditable.
do $$
declare
  r record;
  v_attached int := 0;
  v_covered int := 0;
begin
  for r in select * from neta_ops.fn_attach_missing_report_snapshots() loop
    if r.action = 'trigger attached' then
      v_attached := v_attached + 1;
      raise notice 'snapshot trigger attached: neta_ops.%', r.table_name;
    else
      v_covered := v_covered + 1;
    end if;
  end loop;
  raise notice 'report snapshot coverage: % newly attached, % already covered',
    v_attached, v_covered;
end $$;

-- Try again to make coverage self-maintaining. This needs superuser, so treat
-- failure as expected and say so rather than letting it pass unnoticed.
do $$
begin
  begin
    drop event trigger if exists attach_report_snapshot_on_create;
    create event trigger attach_report_snapshot_on_create
      on ddl_command_end
      when tag in ('CREATE TABLE')
      execute function neta_ops.fn_on_create_table_snapshot();
    raise notice 'event trigger installed: new neta_ops tables are covered automatically';
  exception when others then
    raise notice
      'could not install the event trigger (%). New report tables will NOT be covered automatically: run select * from neta_ops.fn_attach_missing_report_snapshots(); after adding one.',
      sqlerrm;
  end;
end $$;

commit;

-- Verification. Every row this returns is a report table with no version
-- history, and should be empty after this migration.
--
-- select c.relname
-- from pg_class c
-- join pg_namespace n on n.oid = c.relnamespace
-- where n.nspname = 'neta_ops' and c.relkind = 'r'
--   and c.relname <> 'backup_reports'
--   and exists (select 1 from pg_attribute a where a.attrelid = c.oid and a.attname = 'job_id' and a.attnum > 0 and not a.attisdropped)
--   and exists (select 1 from pg_attribute a join pg_type t on t.oid = a.atttypid where a.attrelid = c.oid and t.typname = 'jsonb' and a.attnum > 0 and not a.attisdropped)
--   and not exists (
--     select 1 from pg_trigger tg
--     where tg.tgrelid = c.oid and not tg.tgisinternal
--       and tg.tgfoid = 'neta_ops.fn_snapshot_report_json()'::regprocedure
--   )
-- order by 1;
