-- Allow any authenticated user to edit/view rows in neta_ops.low_voltage_cable_test_3sets
-- This adds permissive RLS policies (does not drop existing ones)

BEGIN;

-- Ensure RLS is enabled (Supabase enables by default, but safe to include)
ALTER TABLE neta_ops.low_voltage_cable_test_3sets ENABLE ROW LEVEL SECURITY;

-- Read
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'neta_ops' 
      AND tablename = 'low_voltage_cable_test_3sets' 
      AND policyname = 'allow_all_select_lvcb_mts'
  ) THEN
    CREATE POLICY allow_all_select_lvcb_mts
      ON neta_ops.low_voltage_cable_test_3sets
      FOR SELECT
      USING (true);
  END IF;
END$$;

-- Insert
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'neta_ops' 
      AND tablename = 'low_voltage_cable_test_3sets' 
      AND policyname = 'allow_all_insert_lvcb_mts'
  ) THEN
    CREATE POLICY allow_all_insert_lvcb_mts
      ON neta_ops.low_voltage_cable_test_3sets
      FOR INSERT
      WITH CHECK (true);
  END IF;
END$$;

-- Update
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'neta_ops' 
      AND tablename = 'low_voltage_cable_test_3sets' 
      AND policyname = 'allow_all_update_lvcb_mts'
  ) THEN
    CREATE POLICY allow_all_update_lvcb_mts
      ON neta_ops.low_voltage_cable_test_3sets
      FOR UPDATE
      USING (true)
      WITH CHECK (true);
  END IF;
END$$;

-- Delete (optional; included for completeness)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'neta_ops' 
      AND tablename = 'low_voltage_cable_test_3sets' 
      AND policyname = 'allow_all_delete_lvcb_mts'
  ) THEN
    CREATE POLICY allow_all_delete_lvcb_mts
      ON neta_ops.low_voltage_cable_test_3sets
      FOR DELETE
      USING (true);
  END IF;
END$$;

COMMIT;


