-- PM dashboard: remember which estimates each SOV line was copied from.
-- Lets the "Copy from estimate" picker mark estimates that are already in the SOV,
-- so the same one is not added twice. Run after pm_dashboard.sql. Safe to run again.

ALTER TABLE neta_ops.job_sov_lines
  ADD COLUMN IF NOT EXISTS source_estimate_ids uuid[] NOT NULL DEFAULT '{}';

COMMENT ON COLUMN neta_ops.job_sov_lines.source_estimate_ids IS
  'business.estimates ids this line was copied from. Empty for lines typed in by hand.';

-- Tell the API layer about the new column right away.
NOTIFY pgrst, 'reload schema';
