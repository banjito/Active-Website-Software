-- Article email signups from ampqes.com.
--
-- Why: article pages show the first part, then ask for an email to keep reading.
-- The website (server side, secret key) calls one function, which adds the reader
-- or recognizes them. It answers 'new' or 'returning' so the site can say
-- "Welcome back" instead of adding a duplicate.
--
--   common.article_subscribers           one row per email
--   common.subscribe_article_reader()    the only way in from the website
--
-- Contract (called by the ampqes.com site, server side):
--   POST /rest/v1/rpc/subscribe_article_reader   Content-Profile: common
--   body {"p_email": "...", "p_article_slug": "why-we-test-breakers" | null}
--   returns "new" or "returning"; an invalid email is a 400 error
--
-- Only the service role may call it. The publishable (anon) key and signed-in users
-- cannot, so nobody can skip the site's spam check from a browser.
--
-- In ampOS, the people who may publish articles (Admins, superusers,
-- article_publishers) can read the list, export it, and mark people unsubscribed.
-- No site rebuild trigger: nothing here is public.
--
-- Safe to run twice. Run after articles.sql (needs common.article_can_publish).

-- ---------------------------------------------------------------------------
-- Table
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS common.article_subscribers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Stored lower-case and trimmed, so one person is one row
  email text NOT NULL
    CONSTRAINT article_subscribers_email_key UNIQUE
    CONSTRAINT article_subscribers_email_clean CHECK (email = lower(btrim(email)) AND char_length(email) BETWEEN 3 AND 254),
  -- The article they signed up on, and the latest one they came back on
  first_article_slug text CHECK (char_length(first_article_slug) <= 200),
  last_article_slug text CHECK (char_length(last_article_slug) <= 200),
  created_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  -- Times they entered their email again after the first signup
  return_count integer NOT NULL DEFAULT 0,
  unsubscribed_at timestamptz,
  unsubscribed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

COMMENT ON TABLE common.article_subscribers IS
  'Readers who signed up on ampqes.com article pages. Written only through subscribe_article_reader().';

CREATE INDEX IF NOT EXISTS idx_article_subscribers_created_at
  ON common.article_subscribers (created_at DESC);

-- ---------------------------------------------------------------------------
-- Who can see and change it
-- ---------------------------------------------------------------------------

ALTER TABLE common.article_subscribers ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE common.article_subscribers FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE common.article_subscribers TO authenticated;
-- Staff can only mark someone unsubscribed (or undo it). Emails and history are
-- written by the function alone.
GRANT UPDATE (unsubscribed_at, unsubscribed_by) ON TABLE common.article_subscribers TO authenticated;
GRANT ALL ON TABLE common.article_subscribers TO service_role;

DROP POLICY IF EXISTS "article_subscribers_select" ON common.article_subscribers;
CREATE POLICY "article_subscribers_select" ON common.article_subscribers
  FOR SELECT TO authenticated
  USING (common.article_can_publish());

DROP POLICY IF EXISTS "article_subscribers_update" ON common.article_subscribers;
CREATE POLICY "article_subscribers_update" ON common.article_subscribers
  FOR UPDATE TO authenticated
  USING (common.article_can_publish())
  WITH CHECK (common.article_can_publish());

-- ---------------------------------------------------------------------------
-- The website's way in
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION common.subscribe_article_reader(
  p_email text,
  p_article_slug text DEFAULT NULL
) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_email text := lower(btrim(COALESCE(p_email, '')));
  v_slug text := NULLIF(left(btrim(COALESCE(p_article_slug, '')), 200), '');
  v_new boolean;
BEGIN
  -- Loose check; the site validates first. 22023 = invalid parameter (HTTP 400).
  IF char_length(v_email) > 254 OR v_email !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' THEN
    RAISE EXCEPTION 'Invalid email address' USING ERRCODE = '22023';
  END IF;

  INSERT INTO common.article_subscribers AS s (email, first_article_slug, last_article_slug)
  VALUES (v_email, v_slug, v_slug)
  ON CONFLICT (email) DO UPDATE
     SET last_seen_at = now(),
         last_article_slug = COALESCE(EXCLUDED.last_article_slug, s.last_article_slug),
         return_count = s.return_count + 1,
         -- Entering the email again is a fresh opt-in
         unsubscribed_at = NULL,
         unsubscribed_by = NULL
  -- xmax is 0 only on a row this statement inserted
  RETURNING (s.xmax = 0) INTO v_new;

  RETURN CASE WHEN v_new THEN 'new' ELSE 'returning' END;
END;
$$;

REVOKE ALL ON FUNCTION common.subscribe_article_reader(text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION common.subscribe_article_reader(text, text) TO service_role;

NOTIFY pgrst, 'reload schema';

-- Expected result: one row. table_exists = true, rls_on = true,
-- anon_can_call = false, authenticated_can_call = false, service_can_call = true.
SELECT to_regclass('common.article_subscribers') IS NOT NULL AS table_exists,
       (SELECT relrowsecurity FROM pg_class WHERE oid = 'common.article_subscribers'::regclass) AS rls_on,
       has_function_privilege('anon', 'common.subscribe_article_reader(text, text)', 'EXECUTE') AS anon_can_call,
       has_function_privilege('authenticated', 'common.subscribe_article_reader(text, text)', 'EXECUTE') AS authenticated_can_call,
       has_function_privilege('service_role', 'common.subscribe_article_reader(text, text)', 'EXECUTE') AS service_can_call;
