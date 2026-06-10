-- Fix Pipeline Projection RLS
-- Currently, business.opportunities has RLS enabled with policies that restrict
-- SELECT to auth.uid() = user_id, which prevents users from seeing each other's
-- pipeline projection opportunities.
--
-- This migration adds policies that:
--   1. Allow all authenticated users to SELECT all opportunities
--   2. Allow all authenticated users to UPDATE any opportunity
--      (so they can toggle in_pipeline_projection on/off for shared use)

-- Ensure RLS is enabled (idempotent)
ALTER TABLE business.opportunities ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- SELECT: Allow all authenticated users to view all opportunities
-- Multiple policies are OR-combined, so this adds access on top of any
-- existing user-scoped SELECT policies.
-- ============================================================================
DROP POLICY IF EXISTS "All users can view opportunities" ON business.opportunities;
CREATE POLICY "All users can view opportunities"
  ON business.opportunities
  FOR SELECT
  USING (auth.role() = 'authenticated');

-- ============================================================================
-- UPDATE: Allow all authenticated users to update any opportunity
-- This enables users to toggle in_pipeline_projection on opportunities
-- they did not create, which is essential for a shared pipeline projection.
-- ============================================================================
DROP POLICY IF EXISTS "All users can update opportunities" ON business.opportunities;
CREATE POLICY "All users can update opportunities"
  ON business.opportunities
  FOR UPDATE
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

-- ============================================================================
-- INSERT: Ensure authenticated users can create opportunities
-- (safety net — may already exist via dashboard-created policy)
-- ============================================================================
DROP POLICY IF EXISTS "All users can insert opportunities" ON business.opportunities;
CREATE POLICY "All users can insert opportunities"
  ON business.opportunities
  FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

-- ============================================================================
-- DELETE: Ensure authenticated users can delete opportunities
-- (safety net — may already exist via dashboard-created policy)
-- ============================================================================
DROP POLICY IF EXISTS "All users can delete opportunities" ON business.opportunities;
CREATE POLICY "All users can delete opportunities"
  ON business.opportunities
  FOR DELETE
  USING (auth.role() = 'authenticated');
