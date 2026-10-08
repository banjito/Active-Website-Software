-- Fix: neta_ops.lv_molded_case_circuit_breaker_ats25 had no row-level security.
--
-- The table was created without RLS, and database/bootstrap/02_schema.sql grants
-- SELECT/INSERT/UPDATE/DELETE on it to anon. anon is the role behind the public
-- key that ships in the website's JavaScript, so with that grant every breaker
-- report on every job can be read, changed or deleted by a request that never
-- logged in. This is the most-used report in the app (about a third of all
-- reports). RLS being off was confirmed on the live database on 2026-10-08; the
-- live anon grant was not checked.
--
-- Two changes:
--   1. Turn RLS on with the same staff-only rule the other ATS 25 report tables
--      use (e.g. panelboard_assemblies_ats25_reports). Anyone who can open a
--      Panelboard report today can still open a breaker report after this.
--   2. Grant the table to service_role. It was never granted, so server-side
--      scripts using the service key got "permission denied" on this one table.
--
-- Safe to run more than once.
--
-- Check before running: common.is_employee_user() must return true for every
-- account that fills in breaker reports. See
-- fix_is_employee_user_roles_and_domains.sql for the time it did not.

ALTER TABLE neta_ops.lv_molded_case_circuit_breaker_ats25 ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Employees can manage records"
  ON neta_ops.lv_molded_case_circuit_breaker_ats25;
CREATE POLICY "Employees can manage records"
  ON neta_ops.lv_molded_case_circuit_breaker_ats25
  USING (common.is_employee_user())
  WITH CHECK (common.is_employee_user());

GRANT SELECT, INSERT, UPDATE, DELETE
  ON TABLE neta_ops.lv_molded_case_circuit_breaker_ats25
  TO service_role;
