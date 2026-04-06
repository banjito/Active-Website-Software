-- Remove RLS from custom_form_component_defaults (no policies needed).
-- Run this if the table was created with RLS and you get policy errors or "already exists".
-- Drops all policies on the table by name from pg_policies to avoid quoting/encoding issues.

DO $$
DECLARE
  pol record;
BEGIN
  FOR pol IN
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'neta_ops' AND tablename = 'custom_form_component_defaults'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON neta_ops.custom_form_component_defaults', pol.policyname);
  END LOOP;
END $$;

ALTER TABLE neta_ops.custom_form_component_defaults DISABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON neta_ops.custom_form_component_defaults TO authenticated;
