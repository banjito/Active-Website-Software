-- Add excluded_from_stats column to issue_reports table
-- This allows certain issues to be excluded from timing statistics
-- (e.g. when someone forgot to mark status changes in time)
-- The issue still counts toward totals, just not toward avg response/fix/impl times.

ALTER TABLE common.issue_reports
  ADD COLUMN IF NOT EXISTS excluded_from_stats BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN common.issue_reports.excluded_from_stats
  IS 'When true, this issue is excluded from timing averages (response time, fix time, etc.) but still counted in totals.';
