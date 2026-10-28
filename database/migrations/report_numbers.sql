-- Report numbers: every report gets a number within its job, in the order the
-- reports were created (26103-203 = job 26103, 203rd report). The number never
-- changes and is never reused, so action items can build on it (26103-203-2).
--
--   neta_ops.report_numbers        one row per numbered report
--   neta_ops.job_report_counters   the last number handed out on each job
--
-- Kept out of neta_ops.assets on purpose: writing to every assets row would fire
-- its backup and snapshot triggers and touch every report.
-- Only report: and custom-form: assets are numbered, not uploaded files.
-- A report on more than one job is numbered on the job it was linked to first.
--
-- Safe to run again: the fill-in at the bottom only numbers reports that have
-- no number yet, so rerunning it also fills any gaps the trigger missed.

BEGIN;

CREATE TABLE IF NOT EXISTS neta_ops.job_report_counters (
  job_id uuid PRIMARY KEY REFERENCES neta_ops.jobs(id) ON DELETE CASCADE,
  last_number integer NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS neta_ops.report_numbers (
  asset_id uuid PRIMARY KEY REFERENCES neta_ops.assets(id) ON DELETE CASCADE,
  job_id uuid NOT NULL REFERENCES neta_ops.jobs(id) ON DELETE CASCADE,
  report_number integer NOT NULL,
  -- Job number + report number, frozen when assigned so a later job number
  -- edit doesn't change IDs people have already written down
  report_code text NOT NULL,
  assigned_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (job_id, report_number)
);

CREATE INDEX IF NOT EXISTS idx_report_numbers_code ON neta_ops.report_numbers (report_code);

REVOKE ALL ON TABLE neta_ops.job_report_counters FROM anon, authenticated;
GRANT ALL ON TABLE neta_ops.job_report_counters TO service_role;
ALTER TABLE neta_ops.job_report_counters ENABLE ROW LEVEL SECURITY;
-- No policies: only the SECURITY DEFINER function below touches counters

REVOKE ALL ON TABLE neta_ops.report_numbers FROM anon;
-- Read only: rows are written by the trigger below
GRANT SELECT ON TABLE neta_ops.report_numbers TO authenticated;
GRANT ALL ON TABLE neta_ops.report_numbers TO service_role;
ALTER TABLE neta_ops.report_numbers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "report_numbers_select" ON neta_ops.report_numbers;
CREATE POLICY "report_numbers_select"
  ON neta_ops.report_numbers FOR SELECT
  TO authenticated
  USING (common.is_employee_user());

CREATE OR REPLACE FUNCTION neta_ops.assign_report_number(p_asset_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_job_id uuid;
  v_job_number text;
  v_next integer;
BEGIN
  IF p_asset_id IS NULL
     OR EXISTS (SELECT 1 FROM neta_ops.report_numbers WHERE asset_id = p_asset_id) THEN
    RETURN;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM neta_ops.assets a
    WHERE a.id = p_asset_id
      AND (a.file_url LIKE 'report:%' OR a.file_url LIKE 'custom-form:%')
  ) THEN
    RETURN;
  END IF;

  SELECT ja.job_id INTO v_job_id
  FROM neta_ops.job_assets ja
  WHERE ja.asset_id = p_asset_id
  ORDER BY ja.created_at, ja.id
  LIMIT 1;
  IF v_job_id IS NULL THEN
    RETURN;
  END IF;

  -- The row lock here makes two reports saved at once on the same job take turns
  INSERT INTO neta_ops.job_report_counters (job_id, last_number)
  VALUES (v_job_id, 1)
  ON CONFLICT (job_id) DO UPDATE
    SET last_number = neta_ops.job_report_counters.last_number + 1
  RETURNING last_number INTO v_next;

  SELECT NULLIF(btrim(j.job_number), '') INTO v_job_number
  FROM neta_ops.jobs j WHERE j.id = v_job_id;

  -- A number lost to a race is just a gap; gaps are fine, reuse is not
  INSERT INTO neta_ops.report_numbers (asset_id, job_id, report_number, report_code)
  VALUES (p_asset_id, v_job_id, v_next, COALESCE(v_job_number, '?') || '-' || v_next)
  ON CONFLICT (asset_id) DO NOTHING;
END;
$$;

REVOKE ALL ON FUNCTION neta_ops.assign_report_number(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION neta_ops.job_assets_assign_report_number() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  -- Never block linking a report over its number. Rerunning the fill-in at the
  -- bottom of report_numbers.sql numbers anything this missed.
  BEGIN
    PERFORM neta_ops.assign_report_number(NEW.asset_id);
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'assign_report_number failed for asset %: %', NEW.asset_id, SQLERRM;
  END;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION neta_ops.job_assets_assign_report_number() FROM PUBLIC, anon;

-- Created before the fill-in so a report linked while this runs waits for it,
-- then gets the next number
DROP TRIGGER IF EXISTS trg_job_assets_report_number ON neta_ops.job_assets;
CREATE TRIGGER trg_job_assets_report_number
  AFTER INSERT OR UPDATE OF asset_id ON neta_ops.job_assets
  FOR EACH ROW EXECUTE FUNCTION neta_ops.job_assets_assign_report_number();

-- ---------------------------------------------------------------------------
-- Fill-in: number existing reports per job, oldest first
-- ---------------------------------------------------------------------------

LOCK TABLE neta_ops.job_report_counters IN EXCLUSIVE MODE;

WITH firsts AS (
  SELECT DISTINCT ON (ja.asset_id) ja.asset_id, ja.job_id
  FROM neta_ops.job_assets ja
  JOIN neta_ops.assets a ON a.id = ja.asset_id
  WHERE (a.file_url LIKE 'report:%' OR a.file_url LIKE 'custom-form:%')
    AND NOT EXISTS (SELECT 1 FROM neta_ops.report_numbers rn WHERE rn.asset_id = ja.asset_id)
  ORDER BY ja.asset_id, ja.created_at, ja.id
),
numbered AS (
  SELECT
    f.asset_id,
    f.job_id,
    COALESCE(c.last_number, 0)
      + row_number() OVER (PARTITION BY f.job_id ORDER BY a.created_at, a.id) AS n
  FROM firsts f
  JOIN neta_ops.assets a ON a.id = f.asset_id
  LEFT JOIN neta_ops.job_report_counters c ON c.job_id = f.job_id
)
INSERT INTO neta_ops.report_numbers (asset_id, job_id, report_number, report_code)
SELECT n.asset_id, n.job_id, n.n, COALESCE(NULLIF(btrim(j.job_number), ''), '?') || '-' || n.n
FROM numbered n
JOIN neta_ops.jobs j ON j.id = n.job_id;

-- Counters pick up after the highest number used on each job
INSERT INTO neta_ops.job_report_counters (job_id, last_number)
SELECT job_id, max(report_number) FROM neta_ops.report_numbers GROUP BY job_id
ON CONFLICT (job_id) DO UPDATE
  SET last_number = GREATEST(neta_ops.job_report_counters.last_number, EXCLUDED.last_number);

COMMIT;

NOTIFY pgrst, 'reload schema';

-- Expected result: one row with the number of reports numbered, jobs covered,
-- and the biggest report number on any job.
SELECT count(*) AS reports_numbered,
       count(DISTINCT job_id) AS jobs,
       max(report_number) AS highest_number
FROM neta_ops.report_numbers;
