-- Ground Fault Trip Test Report: nameplate data, primary injection results,
-- set-up description, and comments.
--
-- Adds the columns the rewritten GFITripTestReport.tsx writes. The old flat
-- columns (rated_current, ground_fault_setting, ground_fault_trip, results)
-- are intentionally left in place so previously saved reports keep their data;
-- the report reads them as a fallback when the new columns are NULL.
--
-- Run this script in the Supabase SQL Editor.

ALTER TABLE neta_ops.gfi_trip_test_reports
    ADD COLUMN IF NOT EXISTS nameplate_data JSONB DEFAULT '{}'::jsonb,
    ADD COLUMN IF NOT EXISTS primary_injection JSONB DEFAULT '{}'::jsonb,
    ADD COLUMN IF NOT EXISTS setup_description TEXT,
    ADD COLUMN IF NOT EXISTS comments TEXT;

-- The report header cycles PASS -> FAIL -> LIMITED SERVICE, but the original
-- CHECK constraint only allowed PASS/FAIL, so saving a limited-service report
-- failed. Widen it to match the UI.
ALTER TABLE neta_ops.gfi_trip_test_reports
    DROP CONSTRAINT IF EXISTS gfi_trip_test_reports_status_check;

ALTER TABLE neta_ops.gfi_trip_test_reports
    ADD CONSTRAINT gfi_trip_test_reports_status_check
    CHECK (status IN ('PASS', 'FAIL', 'LIMITED SERVICE'));

-- Backfill: move the legacy nameplate manufacturer into the new JSONB blob so
-- existing reports show it without needing a re-save.
UPDATE neta_ops.gfi_trip_test_reports
SET nameplate_data = jsonb_build_object('manufacturer', manufacturer)
WHERE manufacturer IS NOT NULL
  AND manufacturer <> ''
  AND (nameplate_data IS NULL OR nameplate_data = '{}'::jsonb);
