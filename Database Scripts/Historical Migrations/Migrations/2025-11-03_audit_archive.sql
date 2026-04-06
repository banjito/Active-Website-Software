-- Immutable audit archive for opportunities and all report tables
-- Creates an audit schema, archive table, SECURITY DEFINER trigger function,
-- and attaches triggers to business.opportunities and all neta_ops tables matching '%report%'.
-- Also includes neta_ops.technical_reports explicitly.

-- Required for gen_random_uuid (Supabase commonly uses the 'extensions' schema)
-- Fallback to default if already installed elsewhere
do $$ begin
  perform 1 from pg_extension where extname = 'pgcrypto';
  if not found then
    begin
      create extension pgcrypto;
    exception when others then
      -- ignore if not permitted; most Supabase projects already have it
      null;
    end;
  end if;
end $$;

-- Create audit schema
create schema if not exists audit;

-- Archive table: append-only snapshots
create table if not exists audit.data_archive (
  id uuid primary key default gen_random_uuid(),
  schema_name text not null,
  table_name text not null,
  row_pk text null,
  action text not null check (action in ('insert','update')),
  row_new jsonb null,
  row_old jsonb null,
  user_id uuid null default auth.uid(),
  occurred_at timestamptz not null default now()
);

-- Enable RLS and prevent updates/deletes from any role
alter table audit.data_archive enable row level security;

-- Allow SELECT to authenticated users (adjust as needed)
do $$ begin
  if not exists (
    select 1 from pg_policies where schemaname = 'audit' and tablename = 'data_archive' and policyname = 'allow_select_authenticated'
  ) then
    create policy allow_select_authenticated on audit.data_archive
      for select to authenticated using (true);
  end if;
end $$;

-- Deny UPDATE/DELETE by not creating policies; also add guard triggers
create or replace function audit.fn_prevent_modify()
returns trigger
language plpgsql as $$
begin
  raise exception 'audit.data_archive is immutable; % not allowed', tg_op;
end; $$;

drop trigger if exists trg_no_update on audit.data_archive;
create trigger trg_no_update
  before update on audit.data_archive
  for each row execute function audit.fn_prevent_modify();

drop trigger if exists trg_no_delete on audit.data_archive;
create trigger trg_no_delete
  before delete on audit.data_archive
  for each row execute function audit.fn_prevent_modify();

-- Helper to JSON-ify a row
create or replace function audit.fn_row_to_json(anyelement)
returns jsonb
language sql immutable as $$
  select to_jsonb($1);
$$;

-- Determine primary key value (assumes common 'id' uuid/text; falls back to null)
create or replace function audit.fn_detect_pk_value(schema_name text, table_name text, new_row anyelement, old_row anyelement)
returns text
language plpgsql stable as $$
declare
  pk_col text;
  val text;
begin
  -- Try to find primary key column name
  select a.attname into pk_col
  from pg_index i
  join pg_class c on c.oid = i.indrelid
  join pg_namespace n on n.oid = c.relnamespace
  join pg_attribute a on a.attrelid = c.oid and a.attnum = any(i.indkey)
  join pg_constraint con on con.conindid = i.indexrelid and con.contype = 'p'
  where n.nspname = schema_name and c.relname = table_name
  limit 1;

  if pk_col is null then
    -- Fallback common name
    pk_col := 'id';
  end if;

  begin
    -- Prefer NEW then OLD
    if tg_op in ('INSERT','UPDATE') then
      execute format('select ($1).%I::text', pk_col) into val using new_row;
    end if;
  exception when others then val := null; end;

  if val is null then
    begin
      execute format('select ($1).%I::text', pk_col) into val using old_row;
    exception when others then val := null; end;
  end if;

  return val;
end; $$;

-- SECURITY DEFINER trigger that writes into audit.data_archive bypassing RLS
create or replace function audit.fn_log_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_schema text := tg_table_schema;
  v_table text := tg_table_name;
  v_action text := lower(tg_op);
  v_new jsonb := null;
  v_old jsonb := null;
  v_pk text := null;
begin
  if tg_op = 'INSERT' then
    v_new := audit.fn_row_to_json(new);
    v_pk := audit.fn_detect_pk_value(v_schema, v_table, new, null);
  elsif tg_op = 'UPDATE' then
    v_new := audit.fn_row_to_json(new);
    v_old := audit.fn_row_to_json(old);
    v_pk := audit.fn_detect_pk_value(v_schema, v_table, new, old);
  end if;

  insert into audit.data_archive(schema_name, table_name, row_pk, action, row_new, row_old)
  values (v_schema, v_table, v_pk, v_action, v_new, v_old);

  return new;
end; $$;

-- Helper: attach the audit trigger to any table
create or replace function audit.fn_attach_audit(p_schema text, p_table text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  execute format('drop trigger if exists trg_audit_%I on %I.%I;', p_table, p_schema, p_table);
  execute format('create trigger trg_audit_%I after insert or update on %I.%I for each row execute function audit.fn_log_change();', p_table, p_schema, p_table);
end; $$;

-- Attach triggers to business.opportunities
do $$ begin
  if exists (select 1 from information_schema.tables where table_schema = 'business' and table_name = 'opportunities') then
    execute 'drop trigger if exists trg_audit_opportunities on business.opportunities';
    execute 'create trigger trg_audit_opportunities after insert or update on business.opportunities for each row execute function audit.fn_log_change();';
  end if;
end $$;

-- Attach triggers to ALL existing tables in neta_ops (no name filter)
do $$
declare r record;
begin
  for r in (
    select table_schema, table_name
    from information_schema.tables
    where table_schema = 'neta_ops'
      and table_type = 'BASE TABLE'
  ) loop
    perform audit.fn_attach_audit(r.table_schema, r.table_name);
  end loop;
end $$;

-- Explicitly include neta_ops.technical_reports if present
do $$ begin
  if exists (select 1 from information_schema.tables where table_schema = 'neta_ops' and table_name = 'technical_reports') then
    execute 'drop trigger if exists trg_audit_technical_reports on neta_ops.technical_reports';
    execute 'create trigger trg_audit_technical_reports after insert or update on neta_ops.technical_reports for each row execute function audit.fn_log_change();';
  end if;
end $$;

-- Event trigger: auto-attach audit on CREATE TABLE in neta_ops
create or replace function audit.fn_on_create_table()
returns event_trigger
language plpgsql
security definer
set search_path = public
as $$
declare cmd record;
begin
  for cmd in select * from pg_event_trigger_ddl_commands() loop
    if cmd.object_type = 'table' and cmd.schema_name = 'neta_ops' then
      perform audit.fn_attach_audit(cmd.schema_name, cmd.object_name);
    end if;
  end loop;
end; $$;

drop event trigger if exists audit_attach_on_create;
create event trigger audit_attach_on_create
  on ddl_command_end
  when tag in ('CREATE TABLE')
  execute procedure audit.fn_on_create_table();


