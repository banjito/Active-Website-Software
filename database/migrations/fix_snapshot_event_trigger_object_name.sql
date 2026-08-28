-- ============================================================================
-- Fix: neta_ops.fn_on_create_table_snapshot() referenced a nonexistent column
-- ============================================================================
-- The event trigger that auto-attaches snapshot triggers to new neta_ops
-- tables read `cmd.object_name` from pg_event_trigger_ddl_commands(). That
-- column does not exist — the set-returning function yields classid, objid,
-- objsubid, command_tag, object_type, schema_name, object_identity,
-- in_extension and command.
--
-- Because record fields resolve at runtime, the bad reference only fired once
-- execution reached the PERFORM, i.e. on any CREATE TABLE in neta_ops:
--
--   ERROR:  42703: record "cmd" has no field "object_name"
--   CONTEXT: PL/pgSQL function neta_ops.fn_on_create_table_snapshot() line 6
--
-- so every CREATE TABLE in neta_ops aborted. Tables in other schemas were
-- unaffected (the schema guard short-circuits before the PERFORM).
--
-- Fix: resolve the bare table name from pg_class via cmd.objid. Preferred over
-- splitting object_identity on '.', which mis-parses quoted identifiers that
-- themselves contain a dot.
--
-- Run this in the Supabase SQL Editor BEFORE creating any new neta_ops table.
-- Safe to re-run.
-- ============================================================================

CREATE OR REPLACE FUNCTION neta_ops.fn_on_create_table_snapshot()
RETURNS event_trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
declare
  cmd record;
  v_table text;
begin
  for cmd in select * from pg_event_trigger_ddl_commands() loop
    if cmd.object_type = 'table' and cmd.schema_name = 'neta_ops' then
      select c.relname into v_table
      from pg_class c
      where c.oid = cmd.objid;

      if v_table is not null then
        perform neta_ops.fn_attach_report_snapshot(cmd.schema_name, v_table);
      end if;
    end if;
  end loop;
end; $$;

-- The event trigger itself is unchanged; recreate it only if it went missing.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_event_trigger
    WHERE evtname = 'attach_report_snapshot_on_create'
  ) THEN
    CREATE EVENT TRIGGER attach_report_snapshot_on_create
      ON ddl_command_end
      WHEN TAG IN ('CREATE TABLE')
      EXECUTE FUNCTION neta_ops.fn_on_create_table_snapshot();
  END IF;
END $$;

-- ============================================================================
-- Verification
-- ============================================================================
-- Should create, snapshot-attach, and drop cleanly:
--
--   CREATE TABLE neta_ops.zz_snapshot_trigger_probe (id int);
--   SELECT tgname FROM pg_trigger
--   WHERE tgrelid = 'neta_ops.zz_snapshot_trigger_probe'::regclass
--     AND NOT tgisinternal;   -- expect trg_snapshot_..._ins and ..._upd
--   DROP TABLE neta_ops.zz_snapshot_trigger_probe;
