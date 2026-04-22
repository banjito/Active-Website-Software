-- ============================================================================
-- Allow Technicians to Update Calibration Dates
-- ============================================================================
-- This script ensures technician users can update calibration-related dates.
-- Safe to run multiple times.
--
-- Scope:
-- 1) neta_ops.field_equipment (calibration_date, calibration_due_date UI)
-- 2) neta_ops.equipment (some pages use maintenance-style date fields)
--
-- NOTE:
-- We add permissive UPDATE policies (we do not remove existing policies),
-- so restrictive legacy policies no longer block technicians.
-- ============================================================================

-- Ensure RLS is on
ALTER TABLE IF EXISTS neta_ops.field_equipment ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS neta_ops.equipment ENABLE ROW LEVEL SECURITY;

-- Make sure authenticated users can issue UPDATE at the table privilege layer
GRANT UPDATE ON TABLE neta_ops.field_equipment TO authenticated;
GRANT UPDATE ON TABLE neta_ops.equipment TO authenticated;

-- ---------------------------------------------------------------------------
-- field_equipment: allow technicians/admins/managers to update rows
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Technicians can update field equipment calibration dates"
  ON neta_ops.field_equipment;

CREATE POLICY "Technicians can update field equipment calibration dates"
  ON neta_ops.field_equipment
  FOR UPDATE
  USING (
    auth.uid() IS NOT NULL
    AND (
      lower(coalesce(auth.jwt() -> 'user_metadata' ->> 'role', '')) IN (
        'admin',
        'super admin',
        'manager',
        'supervisor',
        'technician',
        'neta technician',
        'field technician'
      )
      OR coalesce(auth.jwt() -> 'user_metadata' -> 'permissions', '[]'::jsonb) ? 'equipment_manage'
      OR coalesce(auth.jwt() -> 'user_metadata' -> 'permissions', '[]'::jsonb) ? 'equipment_view'
    )
  )
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND (
      lower(coalesce(auth.jwt() -> 'user_metadata' ->> 'role', '')) IN (
        'admin',
        'super admin',
        'manager',
        'supervisor',
        'technician',
        'neta technician',
        'field technician'
      )
      OR coalesce(auth.jwt() -> 'user_metadata' -> 'permissions', '[]'::jsonb) ? 'equipment_manage'
      OR coalesce(auth.jwt() -> 'user_metadata' -> 'permissions', '[]'::jsonb) ? 'equipment_view'
    )
  );

-- ---------------------------------------------------------------------------
-- equipment: allow same roles to update date fields used by equipment pages
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Technicians can update equipment calibration dates"
  ON neta_ops.equipment;

CREATE POLICY "Technicians can update equipment calibration dates"
  ON neta_ops.equipment
  FOR UPDATE
  USING (
    auth.uid() IS NOT NULL
    AND (
      lower(coalesce(auth.jwt() -> 'user_metadata' ->> 'role', '')) IN (
        'admin',
        'super admin',
        'manager',
        'supervisor',
        'technician',
        'neta technician',
        'field technician'
      )
      OR coalesce(auth.jwt() -> 'user_metadata' -> 'permissions', '[]'::jsonb) ? 'equipment_manage'
      OR coalesce(auth.jwt() -> 'user_metadata' -> 'permissions', '[]'::jsonb) ? 'equipment_view'
    )
  )
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND (
      lower(coalesce(auth.jwt() -> 'user_metadata' ->> 'role', '')) IN (
        'admin',
        'super admin',
        'manager',
        'supervisor',
        'technician',
        'neta technician',
        'field technician'
      )
      OR coalesce(auth.jwt() -> 'user_metadata' -> 'permissions', '[]'::jsonb) ? 'equipment_manage'
      OR coalesce(auth.jwt() -> 'user_metadata' -> 'permissions', '[]'::jsonb) ? 'equipment_view'
    )
  );

-- ============================================================================
-- Optional verification (run manually):
-- SELECT policyname, schemaname, tablename, cmd
-- FROM pg_policies
-- WHERE schemaname = 'neta_ops'
--   AND tablename IN ('field_equipment', 'equipment')
-- ORDER BY tablename, policyname;
-- ============================================================================
