-- Backup snapshots for report JSON edits (append-only)
-- - Creates neta_ops.backup_reports
-- - Adds SECURITY DEFINER trigger function to snapshot on INSERT/UPDATE
-- - Attaches triggers to all neta_ops tables that contain report_data or report_info JSONB
-- - Stores ONLY the JSON payload (no status fields), one row per edit
-- - Backups are retained even if the source report row is deleted

-- Ensure pgcrypto for gen_random_uuid
do $$ begin
  perform 1 from pg_extension where extname = 'pgcrypto';
  if not found then
    begin
      create extension pgcrypto;
    exception when others then null;
    end;
  end if;
end $$;

-- Create backup table (append-only)
create table if not exists neta_ops.backup_reports (
  id uuid primary key default gen_random_uuid(),
  source_schema text not null default 'neta_ops',
  source_table text not null,
  source_id uuid null,
  job_id uuid null,
  report_type text null,
  title text null,
  data jsonb not null,
  version int not null,
  edited_by uuid null default auth.uid(),
  saved_at timestamptz not null default now()
);

-- Align existing table schema if it was created previously with older columns
do $$
begin
  -- Add missing columns if they don't exist
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'neta_ops' and table_name = 'backup_reports' and column_name = 'row_pk'
  ) then
    alter table neta_ops.backup_reports add column row_pk text null;
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'neta_ops' and table_name = 'backup_reports' and column_name = 'action'
  ) then
    alter table neta_ops.backup_reports add column action text not null default 'insert';
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'neta_ops' and table_name = 'backup_reports' and column_name = 'source_id'
  ) then
    alter table neta_ops.backup_reports add column source_id uuid null;
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'neta_ops' and table_name = 'backup_reports' and column_name = 'job_id'
  ) then
    alter table neta_ops.backup_reports add column job_id uuid null;
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'neta_ops' and table_name = 'backup_reports' and column_name = 'report_type'
  ) then
    alter table neta_ops.backup_reports add column report_type text null;
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'neta_ops' and table_name = 'backup_reports' and column_name = 'title'
  ) then
    alter table neta_ops.backup_reports add column title text null;
  end if;

  -- Handle old 'row_data'/'occurred_at' naming
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'neta_ops' and table_name = 'backup_reports' and column_name = 'row_data'
  ) and not exists (
    select 1 from information_schema.columns
    where table_schema = 'neta_ops' and table_name = 'backup_reports' and column_name = 'data'
  ) then
    alter table neta_ops.backup_reports rename column row_data to data;
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'neta_ops' and table_name = 'backup_reports' and column_name = 'data'
  ) then
    alter table neta_ops.backup_reports add column data jsonb not null default '{}'::jsonb;
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'neta_ops' and table_name = 'backup_reports' and column_name = 'occurred_at'
  ) and not exists (
    select 1 from information_schema.columns
    where table_schema = 'neta_ops' and table_name = 'backup_reports' and column_name = 'saved_at'
  ) then
    alter table neta_ops.backup_reports rename column occurred_at to saved_at;
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'neta_ops' and table_name = 'backup_reports' and column_name = 'saved_at'
  ) then
    alter table neta_ops.backup_reports add column saved_at timestamptz not null default now();
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'neta_ops' and table_name = 'backup_reports' and column_name = 'version'
  ) then
    alter table neta_ops.backup_reports add column version int not null default 1;
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'neta_ops' and table_name = 'backup_reports' and column_name = 'edited_by'
  ) then
    alter table neta_ops.backup_reports add column edited_by uuid null;
  end if;

  -- Ensure action is constrained to allowed values if we added it
  if not exists (
    select 1
    from pg_constraint
    where conname = 'backup_reports_action_check'
      and conrelid = 'neta_ops.backup_reports'::regclass
  ) then
    begin
      alter table neta_ops.backup_reports add constraint backup_reports_action_check check (action in ('insert','update'));
    exception when others then null; end;
  end if;
end $$;

-- Helpful indexes (create only if target columns exist)
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'neta_ops' and table_name = 'backup_reports' and column_name = 'source_id'
  ) then
    execute 'create index if not exists idx_backup_reports_source on neta_ops.backup_reports(source_table, source_id)';
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'neta_ops' and table_name = 'backup_reports' and column_name = 'job_id'
  ) then
    execute 'create index if not exists idx_backup_reports_job on neta_ops.backup_reports(job_id)';
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'neta_ops' and table_name = 'backup_reports' and column_name = 'saved_at'
  ) then
    execute 'create index if not exists idx_backup_reports_saved_at on neta_ops.backup_reports(saved_at)';
  end if;
end $$;

-- RLS: allow select to authenticated; disallow update/delete via guard triggers
alter table neta_ops.backup_reports enable row level security;

do $$ begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'neta_ops' and tablename = 'backup_reports' and policyname = 'allow_select_authenticated_backup'
  ) then
    create policy allow_select_authenticated_backup on neta_ops.backup_reports
      for select to authenticated using (true);
  end if;
end $$;

create or replace function neta_ops.fn_prevent_modify_backup()
returns trigger language plpgsql as $$
begin
  raise exception 'neta_ops.backup_reports is immutable; % not allowed', tg_op;
end; $$;

drop trigger if exists trg_backup_no_update on neta_ops.backup_reports;
create trigger trg_backup_no_update before update on neta_ops.backup_reports
for each row execute function neta_ops.fn_prevent_modify_backup();

drop trigger if exists trg_backup_no_delete on neta_ops.backup_reports;
create trigger trg_backup_no_delete before delete on neta_ops.backup_reports
for each row execute function neta_ops.fn_prevent_modify_backup();

-- Backwards-compatibility: redefine original backup trigger function to write into 'data'
-- This ensures any existing trg_backup_* triggers keep working without errors
create or replace function neta_ops.fn_backup_row()
returns trigger
language plpgsql
security definer
set search_path = neta_ops, public
as $$
declare
  v_pk text := null;
begin
  -- Try to capture a primary key value named "id" if it exists
  begin
    if tg_op in ('INSERT','UPDATE') then
      execute 'select ($1).id::text' into v_pk using new;
    end if;
  exception when others then v_pk := null; end;

  insert into neta_ops.backup_reports (source_schema, source_table, row_pk, action, data)
  values (tg_table_schema, tg_table_name, v_pk, lower(tg_op), to_jsonb(new));

  return new;
end; $$;

-- Trigger function to snapshot FULL ROW JSON (minus 'status')
-- Captures all user inputs across heterogeneous report tables
create or replace function neta_ops.fn_snapshot_report_json()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
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

  -- Determine next version number for this source row within this table
  select coalesce(max(version), 0) + 1 into v_next_version
  from neta_ops.backup_reports br
  where br.source_schema = tg_table_schema
    and br.source_table = tg_table_name
    and (v_source_id is not distinct from br.source_id);

  insert into neta_ops.backup_reports(
    source_schema, source_table, source_id, row_pk, action, job_id, report_type, title, data, version, edited_by
  ) values (
    tg_table_schema, tg_table_name, v_source_id, v_row_pk, lower(tg_op), v_job_id, v_report_type, v_title, v_payload_new, v_next_version, auth.uid()
  );

  return NEW;
end; $$;

-- Helper to attach snapshot trigger to a given table
create or replace function neta_ops.fn_attach_report_snapshot(p_schema text, p_table text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_trg_ins_long text;
  v_trg_upd_long text;
  v_trg_ins_short text;
  v_trg_upd_short text;
  v_trg_ins text;
  v_trg_upd text;
begin
  -- Skip attaching to the backup table itself
  if p_schema = 'neta_ops' and p_table = 'backup_reports' then
    return;
  end if;

  -- Build trigger names; ensure <= 63 bytes by hashing when necessary
  v_trg_ins_long := format('trg_snapshot_%s_ins', p_table);
  v_trg_upd_long := format('trg_snapshot_%s_upd', p_table);
  v_trg_ins_short := format('trg_snapshot_%s_ins', substring(md5(p_table) from 1 for 16));
  v_trg_upd_short := format('trg_snapshot_%s_upd', substring(md5(p_table) from 1 for 16));

  if length(v_trg_ins_long) > 63 then
    v_trg_ins := v_trg_ins_short;
  else
    v_trg_ins := v_trg_ins_long;
  end if;

  if length(v_trg_upd_long) > 63 then
    v_trg_upd := v_trg_upd_short;
  else
    v_trg_upd := v_trg_upd_long;
  end if;

  -- Drop both old-style (long) and new-style (hashed) names if they exist
  execute format('drop trigger if exists %I on %I.%I;', v_trg_ins_long, p_schema, p_table);
  execute format('drop trigger if exists %I on %I.%I;', v_trg_upd_long, p_schema, p_table);
  execute format('drop trigger if exists %I on %I.%I;', v_trg_ins_short, p_schema, p_table);
  execute format('drop trigger if exists %I on %I.%I;', v_trg_upd_short, p_schema, p_table);

  -- After INSERT: always snapshot first version
  execute format(
    'create trigger %1$I after insert on %2$I.%3$I for each row execute function neta_ops.fn_snapshot_report_json();',
    v_trg_ins, p_schema, p_table
  );

  -- After UPDATE on any column: function internally compares payloads to avoid noise
  execute format(
    'create trigger %1$I after update on %2$I.%3$I for each row execute function neta_ops.fn_snapshot_report_json();',
    v_trg_upd, p_schema, p_table
  );
end; $$;

-- Attach to all existing neta_ops tables that contain report_data or report_info
do $$
declare r record;
begin
  for r in (
    select table_schema, table_name
    from information_schema.tables
    where table_schema = 'neta_ops' and table_type = 'BASE TABLE'
  ) loop
    perform neta_ops.fn_attach_report_snapshot(r.table_schema, r.table_name);
  end loop;
end $$;

-- Optionally, attach automatically on future CREATE TABLE in neta_ops
create or replace function neta_ops.fn_on_create_table_snapshot()
returns event_trigger
language plpgsql
security definer
set search_path = public
as $$
declare cmd record;
begin
  for cmd in select * from pg_event_trigger_ddl_commands() loop
    if cmd.object_type = 'table' and cmd.schema_name = 'neta_ops' then
      perform neta_ops.fn_attach_report_snapshot(cmd.schema_name, cmd.object_name);
    end if;
  end loop;
end; $$;

drop event trigger if exists attach_report_snapshot_on_create;
create event trigger attach_report_snapshot_on_create
  on ddl_command_end
  when tag in ('CREATE TABLE')
  execute function neta_ops.fn_on_create_table_snapshot();


