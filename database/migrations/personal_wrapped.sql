-- Personal ampOS Wrapped: one person's numbers for a year, read from the login so
-- nobody can pull someone else's. Admins can pass an email to preview a person.
-- Its only write is one small new table, wrapped_seen, which remembers who has watched
-- so the popup stops on every device. No triggers, nothing existing changes, so it is
-- safe to run while people work, and safe to run again.
--
-- What counts as a report: same rule as report numbers. Built in the app, or an
-- uploaded PDF that reached review. It must still be on a job that isn't deleted,
-- because deleting a report only removes its job link. "Not started" doesn't count.
--
-- Who gets credit: whoever created it or submitted it, each counting it once. If
-- neither is recorded, whoever linked it to the job or marked it ready for review.
--
-- Duplicates: the old auto-save bug left rows like "S", "SWBD", "SWBD-RPP" on a job.
-- Same pattern as scripts/dedupe-reports.mjs: same job and type, within an hour, and
-- the later name starts with the earlier one. It can't compare readings the way the
-- script does, but it doesn't change or remove anything.
--
-- Estimates: credited to whoever saved last, because saving overwrites user_id and
-- nothing keeps who started it. Copies and change orders each count. "Won" means the
-- quote they sit on was marked awarded.

CREATE OR REPLACE FUNCTION common.get_my_wrapped(
  p_year integer,
  p_time_zone text DEFAULT 'UTC',
  p_preview_email text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_person uuid := auth.uid();
  v_first_name text;
  v_email text;
  v_zone text := 'UTC';
  v_result jsonb;
BEGIN
  IF v_person IS NULL OR NOT common.is_employee_user() THEN
    RETURN NULL;
  END IF;

  IF p_preview_email IS NOT NULL THEN
    -- Role comes from auth.users, not the token, so a demoted admin loses this at once
    IF NOT EXISTS (
      SELECT 1 FROM auth.users u
      WHERE u.id = v_person
        AND (
          coalesce(u.raw_user_meta_data ->> 'role', '') IN ('Admin', 'Super Admin')
          OR common.is_superuser_email(u.email)
        )
    ) THEN
      RAISE EXCEPTION 'Only admins can preview someone else''s Wrapped';
    END IF;

    SELECT u.id INTO v_person
    FROM auth.users u
    WHERE lower(u.email) = lower(trim(p_preview_email));

    IF v_person IS NULL THEN
      RAISE EXCEPTION 'No user with the email %', p_preview_email;
    END IF;
  END IF;

  SELECT split_part(trim(coalesce(u.raw_user_meta_data ->> 'name', '')), ' ', 1), lower(u.email)
  INTO v_first_name, v_email
  FROM auth.users u
  WHERE u.id = v_person;

  -- A browser can name a zone Postgres doesn't know, which would stop the whole query
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_timezone_names z WHERE z.name = p_time_zone) THEN
    v_zone := p_time_zone;
  END IF;

  WITH linked AS (
    -- A report on more than one job counts on the job it was linked to first
    SELECT DISTINCT ON (a.id)
      a.id,
      ja.job_id,
      j.customer_id,
      a.name,
      a.status,
      a.created_at,
      coalesce(a.submitted_at, a.created_at) AT TIME ZONE v_zone AS worked_at,
      split_part(a.name, ' - ', 1) AS title,
      a.file_url LIKE 'report:%' OR a.file_url LIKE 'custom-form:%' AS built_in_app,
      CASE
        WHEN a.file_url LIKE 'report:%' THEN split_part(split_part(a.file_url, '/', 4), '?', 1)
        WHEN a.file_url LIKE 'custom-form:%' THEN split_part(a.file_url, '/', 5)
        ELSE split_part(a.name, ' - ', 1)
      END AS report_type,
      (
        v_person IN (a.user_id, a.submitted_by)
        OR (
          a.user_id IS NULL
          AND a.submitted_by IS NULL
          AND (
            ja.user_id = v_person
            OR EXISTS (
              SELECT 1 FROM neta_ops.report_activity r
              WHERE r.asset_id = a.id
                AND r.actor_id = v_person
                AND r.to_status = 'ready_for_review'
            )
          )
        )
      ) AS is_mine
    FROM neta_ops.assets a
    JOIN neta_ops.job_assets ja ON ja.asset_id = a.id
    JOIN neta_ops.jobs j ON j.id = ja.job_id AND j.deleted_at IS NULL
    WHERE a.status <> 'not started'
      AND (
        a.file_url LIKE 'report:%'
        OR a.file_url LIKE 'custom-form:%'
        OR (a.file_url ILIKE '%.pdf' AND a.status IN ('ready_for_review', 'issue', 'approved', 'sent'))
      )
    ORDER BY a.id, ja.created_at, ja.id
  ),
  kept AS (
    SELECT r.*
    FROM linked r
    WHERE NOT EXISTS (
      SELECT 1 FROM linked n
      WHERE n.job_id = r.job_id
        AND n.report_type = r.report_type
        AND n.id <> r.id
        AND n.created_at >= r.created_at
        AND n.created_at < r.created_at + interval '60 minutes'
        AND starts_with(n.name, r.name)
        -- Two rows saved in the same instant: keep exactly one
        AND (n.created_at > r.created_at OR n.id > r.id)
        -- Neither names its equipment, so these can be two devices that test alike
        AND (n.name <> r.name OR position(' - ' IN r.name) > 0)
    )
  ),
  year_reports AS (
    SELECT * FROM kept WHERE extract(year FROM worked_at) = p_year
  ),
  my_reports AS (
    SELECT * FROM year_reports WHERE is_mine
  ),
  my_issues AS (
    SELECT i.type, i.status, i.title, i.resolved_at, i.created_at
    FROM common.issue_reports i
    WHERE i.reporter_id = v_person
      AND NOT i.excluded_from_stats
      AND i.status <> 'duplicate'
      AND extract(year FROM i.created_at AT TIME ZONE v_zone) = p_year
  ),
  my_estimates AS (
    SELECT e.opportunity_id, o.customer_id, o.status AS quote_status
    FROM business.estimates e
    JOIN business.opportunities o ON o.id = e.opportunity_id
    WHERE e.user_id = v_person
      AND extract(year FROM e.created_at AT TIME ZONE v_zone) = p_year
  )
  SELECT jsonb_build_object(
    'first_name', v_first_name,
    'email', v_email,
    'reports', (SELECT count(*) FROM my_reports),
    'last_year_reports', (
      SELECT count(*) FROM kept WHERE is_mine AND extract(year FROM worked_at) = p_year - 1
    ),
    'sent', (SELECT count(*) FROM my_reports WHERE status = 'sent'),
    'in_progress', (SELECT count(*) FROM my_reports WHERE status = 'in_progress'),
    'approved_or_ready', (
      SELECT count(*) FROM my_reports WHERE status IN ('approved', 'ready_for_review')
    ),
    'other', (
      SELECT count(*) FROM my_reports
      WHERE status NOT IN ('sent', 'in_progress', 'approved', 'ready_for_review')
    ),
    -- Uploaded PDFs have free-form names, so only app-built reports count as kinds
    'types_used', (SELECT count(DISTINCT report_type) FROM my_reports WHERE built_in_app),
    'types_total', (SELECT count(DISTINCT report_type) FROM year_reports WHERE built_in_app),
    'top_type', (
      SELECT jsonb_build_object('key', report_type, 'name', min(title), 'count', count(*))
      FROM my_reports
      WHERE built_in_app
      GROUP BY report_type
      ORDER BY count(*) DESC, report_type
      LIMIT 1
    ),
    'months', (
      SELECT jsonb_agg(coalesce(c.reports, 0) ORDER BY m.month)
      FROM generate_series(1, 12) AS m(month)
      LEFT JOIN (
        SELECT extract(month FROM worked_at)::integer AS month, count(*) AS reports
        FROM my_reports
        GROUP BY 1
      ) c ON c.month = m.month
    ),
    'best_day', (
      SELECT jsonb_build_object('date', worked_at::date, 'count', count(*))
      FROM my_reports
      GROUP BY worked_at::date
      ORDER BY count(*) DESC, worked_at::date
      LIMIT 1
    ),
    'jobs', (SELECT count(DISTINCT job_id) FROM my_reports),
    'customers', (SELECT count(DISTINCT customer_id) FROM my_reports),
    'most_on_one_job', (
      SELECT count(*) FROM my_reports GROUP BY job_id ORDER BY 1 DESC LIMIT 1
    ),
    'issues', (SELECT count(*) FROM my_issues WHERE type = 'issue'),
    'ideas', (SELECT count(*) FROM my_issues WHERE type = 'feature_request'),
    'fixed', (SELECT count(*) FROM my_issues WHERE status = 'resolved'),
    'shipped_idea', (
      SELECT title FROM my_issues
      WHERE type = 'feature_request' AND status = 'resolved'
      ORDER BY resolved_at DESC NULLS LAST, created_at DESC
      LIMIT 1
    ),
    'team_reports', (SELECT count(*) FROM year_reports),
    'estimates', (SELECT count(*) FROM my_estimates),
    'estimate_quotes', (SELECT count(DISTINCT opportunity_id) FROM my_estimates),
    'estimate_customers', (SELECT count(DISTINCT customer_id) FROM my_estimates),
    'estimate_wins', (
      SELECT count(DISTINCT opportunity_id) FROM my_estimates WHERE quote_status = 'awarded'
    )
  )
  INTO v_result;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION common.get_my_wrapped(integer, text, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION common.get_my_wrapped(integer, text, text) TO authenticated;

-- Who has started watching. Saved on the first slide, so the popup stops and the
-- portal button shows on every device they use, not just the one they watched on.
CREATE TABLE IF NOT EXISTS common.wrapped_seen (
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  year integer NOT NULL,
  seen_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, year)
);

-- Reached only through the two functions below, which use the login's own id
ALTER TABLE common.wrapped_seen ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON common.wrapped_seen FROM public, anon, authenticated;

CREATE OR REPLACE FUNCTION common.mark_wrapped_seen(p_year integer)
RETURNS void
LANGUAGE sql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
  INSERT INTO common.wrapped_seen (user_id, year)
  SELECT auth.uid(), p_year
  WHERE auth.uid() IS NOT NULL
  ON CONFLICT (user_id, year) DO NOTHING;
$$;

CREATE OR REPLACE FUNCTION common.has_seen_wrapped(p_year integer)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM common.wrapped_seen s
    WHERE s.user_id = auth.uid() AND s.year = p_year
  );
$$;

REVOKE ALL ON FUNCTION common.mark_wrapped_seen(integer) FROM public, anon;
GRANT EXECUTE ON FUNCTION common.mark_wrapped_seen(integer) TO authenticated;
REVOKE ALL ON FUNCTION common.has_seen_wrapped(integer) FROM public, anon;
GRANT EXECUTE ON FUNCTION common.has_seen_wrapped(integer) TO authenticated;

NOTIFY pgrst, 'reload schema';
