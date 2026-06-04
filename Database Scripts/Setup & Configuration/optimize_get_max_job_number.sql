-- Speed up public.get_max_job_number() for large neta_ops.jobs tables.
-- Without an index, the function scans every row and can hit statement_timeout (57014).
-- Also grants app users permission to call it; otherwise Supabase returns 403.
--
-- Run this in the Supabase SQL Editor when T&M / job creation times out.
-- Safe to run multiple times (uses IF NOT EXISTS patterns).

-- 1) Stored numeric mirror of job_number for fast MAX()
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'neta_ops'
      AND table_name = 'jobs'
      AND column_name = 'job_number_numeric'
  ) THEN
    ALTER TABLE neta_ops.jobs ADD COLUMN job_number_numeric bigint
      GENERATED ALWAYS AS (
        CASE
          WHEN job_number::text ~ '^[0-9]+$' THEN job_number::text::bigint
          ELSE NULLIF(regexp_replace(COALESCE(job_number::text, ''), '\D', '', 'g'), '')::bigint
        END
      ) STORED;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_jobs_job_number_numeric_desc
  ON neta_ops.jobs (job_number_numeric DESC NULLS LAST);

ANALYZE neta_ops.jobs;

-- 2) Function uses indexed column
CREATE OR REPLACE FUNCTION public.get_max_job_number()
RETURNS bigint
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = neta_ops, public
AS $$
  SELECT COALESCE(
    (
      SELECT job_number_numeric
      FROM neta_ops.jobs
      WHERE job_number_numeric IS NOT NULL
      ORDER BY job_number_numeric DESC
      LIMIT 1
    ),
    0
  );
$$;

COMMENT ON FUNCTION public.get_max_job_number() IS
  'Returns max numeric job_number; uses job_number_numeric index when present.';

GRANT EXECUTE ON FUNCTION public.get_max_job_number() TO anon, authenticated, service_role;
