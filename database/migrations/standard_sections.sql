-- Standards reader (/standards): the company's licensed NETA ATS / MTS text,
-- one row per section or table, rendered as docs-style pages.
--
-- The text lives ONLY in this table, behind login. Never put it in src/:
-- app bundles download without login and ship to every ampOS buyer.
-- The seed data is loaded separately and is not committed to the repo.

CREATE TABLE IF NOT EXISTS common.standard_sections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  standard text NOT NULL,                 -- 'ats-2025', 'mts-2023'
  section_number text NOT NULL,           -- '7.6.1.1.1', '100.1'
  kind text NOT NULL DEFAULT 'section' CHECK (kind IN ('section', 'table')),
  title text NOT NULL,
  group_title text,                       -- sidebar group, e.g. '7.6 Circuit Breakers'
  sort_order int NOT NULL DEFAULT 0,
  body text NOT NULL DEFAULT '',          -- markdown (docs renderer syntax)
  book_page int,                          -- page number printed in the book
  pdf_page int,                           -- page index in the PDF file
  search tsvector GENERATED ALWAYS AS (
    setweight(to_tsvector('english', section_number || ' ' || title), 'A') ||
    setweight(to_tsvector('english', body), 'B')
  ) STORED,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (standard, section_number)
);

CREATE INDEX IF NOT EXISTS idx_standard_sections_search
  ON common.standard_sections USING gin (search);
CREATE INDEX IF NOT EXISTS idx_standard_sections_order
  ON common.standard_sections (standard, sort_order);

-- Employees read. Nobody writes from the app; loads run in the SQL editor.
ALTER TABLE common.standard_sections ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Employees can read standards" ON common.standard_sections;
CREATE POLICY "Employees can read standards"
  ON common.standard_sections
  FOR SELECT TO authenticated
  USING (common.is_employee_user());

REVOKE ALL ON common.standard_sections FROM anon;
GRANT SELECT ON common.standard_sections TO authenticated;
GRANT ALL ON common.standard_sections TO service_role;

-- Search. Matches words in title/body, plus section numbers typed directly
-- ("100.1", "Table 100.1", "7.6.1"). SECURITY INVOKER so the policy above
-- still decides who sees rows. Highlights come back wrapped in <mark></mark>;
-- the page splits on those strings and never injects HTML.
CREATE OR REPLACE FUNCTION common.search_standard_sections(
  p_query text,
  p_standard text DEFAULT NULL,
  p_limit int DEFAULT 30
)
RETURNS TABLE (
  standard text,
  section_number text,
  kind text,
  title text,
  snippet text,
  rank real
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = common, public
AS $$
  WITH q AS (
    SELECT
      websearch_to_tsquery('english', p_query) AS tsq,
      regexp_replace(trim(p_query), '^(table|section)\s*', '', 'i') AS num
  )
  SELECT
    s.standard,
    s.section_number,
    s.kind,
    s.title,
    ts_headline(
      'english', s.body, q.tsq,
      'StartSel=<mark>, StopSel=</mark>, MaxWords=28, MinWords=10, MaxFragments=1'
    ) AS snippet,
    (
      ts_rank(s.search, q.tsq)
      + CASE
          WHEN s.section_number = q.num THEN 10
          WHEN q.num <> '' AND s.section_number LIKE q.num || '%' THEN 5
          ELSE 0
        END
    )::real AS rank
  FROM common.standard_sections s, q
  WHERE (p_standard IS NULL OR s.standard = p_standard)
    AND (
      s.search @@ q.tsq
      OR (q.num ~ '^[0-9]' AND s.section_number LIKE q.num || '%')
    )
  ORDER BY rank DESC, s.sort_order
  LIMIT greatest(1, least(p_limit, 100));
$$;

REVOKE ALL ON FUNCTION common.search_standard_sections(text, text, int) FROM public, anon;
GRANT EXECUTE ON FUNCTION common.search_standard_sections(text, text, int) TO authenticated;
