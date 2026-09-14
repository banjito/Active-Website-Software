-- Prayer Wall
-- Company-wide feed of prayer requests with "I'm praying" counts.
--
-- Anonymity is enforced in the database, not the browser:
--   * `authenticated` has NO direct SELECT on common.prayer_requests.
--   * Reads go through the common.prayer_wall_feed view, which nulls
--     author_id / author_name on anonymous rows unless the caller is the author.
--   * Writes go through SECURITY DEFINER RPCs that check auth.uid().
-- RLS policies below are defense-in-depth on top of that.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS common.prayer_requests (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title         text,
  body          text NOT NULL,
  is_anonymous  boolean NOT NULL DEFAULT false,
  -- 'active' | 'answered'. Text (not enum) so a future 'removed' / moderation
  -- status can be added without a type migration.
  status        text NOT NULL DEFAULT 'active',
  answered_note text,
  answered_at   timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT prayer_requests_status_check CHECK (status IN ('active', 'answered')),
  CONSTRAINT prayer_requests_body_len CHECK (char_length(btrim(body)) BETWEEN 1 AND 1000),
  CONSTRAINT prayer_requests_title_len CHECK (title IS NULL OR char_length(title) <= 120),
  CONSTRAINT prayer_requests_note_len CHECK (answered_note IS NULL OR char_length(answered_note) <= 500)
);

CREATE INDEX IF NOT EXISTS prayer_requests_created_at_idx
  ON common.prayer_requests (created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS prayer_requests_status_created_at_idx
  ON common.prayer_requests (status, created_at DESC, id DESC);

CREATE TABLE IF NOT EXISTS common.prayer_intercessions (
  request_id  uuid NOT NULL REFERENCES common.prayer_requests(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (request_id, user_id)
);

-- ---------------------------------------------------------------------------
-- RLS (defense-in-depth; the browser never selects these tables directly)
-- ---------------------------------------------------------------------------
ALTER TABLE common.prayer_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE common.prayer_intercessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Employees can read prayer requests" ON common.prayer_requests;
DROP POLICY IF EXISTS "Employees can post prayer requests" ON common.prayer_requests;
DROP POLICY IF EXISTS "Authors can update own prayer requests" ON common.prayer_requests;
DROP POLICY IF EXISTS "Authors can delete own prayer requests" ON common.prayer_requests;

CREATE POLICY "Employees can read prayer requests"
  ON common.prayer_requests FOR SELECT
  USING (common.is_employee_user());

CREATE POLICY "Employees can post prayer requests"
  ON common.prayer_requests FOR INSERT
  WITH CHECK (common.is_employee_user() AND author_id = auth.uid());

CREATE POLICY "Authors can update own prayer requests"
  ON common.prayer_requests FOR UPDATE
  USING (author_id = auth.uid())
  WITH CHECK (author_id = auth.uid());

CREATE POLICY "Authors can delete own prayer requests"
  ON common.prayer_requests FOR DELETE
  USING (author_id = auth.uid());

DROP POLICY IF EXISTS "Employees can read intercessions" ON common.prayer_intercessions;
DROP POLICY IF EXISTS "Users can add own intercession" ON common.prayer_intercessions;
DROP POLICY IF EXISTS "Users can remove own intercession" ON common.prayer_intercessions;

CREATE POLICY "Employees can read intercessions"
  ON common.prayer_intercessions FOR SELECT
  USING (common.is_employee_user());

CREATE POLICY "Users can add own intercession"
  ON common.prayer_intercessions FOR INSERT
  WITH CHECK (common.is_employee_user() AND user_id = auth.uid());

CREATE POLICY "Users can remove own intercession"
  ON common.prayer_intercessions FOR DELETE
  USING (user_id = auth.uid());

-- No direct table access for browser clients. Everything goes through the
-- view + RPCs below. (Intercessions expose nothing sensitive, but keeping the
-- same rule for both tables means the counts can't be used to unmask anyone.)
REVOKE ALL ON common.prayer_requests FROM authenticated, anon;
REVOKE ALL ON common.prayer_intercessions FROM authenticated, anon;

-- ---------------------------------------------------------------------------
-- Feed view (runs with owner privileges; strips identity on anonymous rows)
-- ---------------------------------------------------------------------------
DROP VIEW IF EXISTS common.prayer_wall_feed;

CREATE VIEW common.prayer_wall_feed
WITH (security_barrier = true)
AS
SELECT
  r.id,
  r.title,
  r.body,
  r.is_anonymous,
  r.status,
  r.answered_note,
  r.answered_at,
  r.created_at,
  (r.author_id = auth.uid()) AS is_mine,
  CASE
    WHEN r.is_anonymous AND r.author_id <> auth.uid() THEN NULL
    ELSE r.author_id
  END AS author_id,
  CASE
    WHEN r.is_anonymous AND r.author_id <> auth.uid() THEN NULL
    ELSE COALESCE(NULLIF(btrim(p.full_name), ''), p.email, 'Unknown')
  END AS author_name,
  (SELECT count(*) FROM common.prayer_intercessions i WHERE i.request_id = r.id)::int AS praying_count,
  EXISTS (
    SELECT 1 FROM common.prayer_intercessions i
    WHERE i.request_id = r.id AND i.user_id = auth.uid()
  ) AS is_praying
FROM common.prayer_requests r
LEFT JOIN common.profiles p ON p.id = r.author_id
WHERE common.is_employee_user();

ALTER VIEW common.prayer_wall_feed OWNER TO postgres;
REVOKE ALL ON common.prayer_wall_feed FROM anon;
GRANT SELECT ON common.prayer_wall_feed TO authenticated;

COMMENT ON VIEW common.prayer_wall_feed IS
  'Prayer Wall feed. author_id/author_name are NULL on anonymous rows unless the caller is the author. Only readable by employees.';

-- ---------------------------------------------------------------------------
-- Write RPCs
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION common.prayer_request_post(
  p_body text,
  p_title text DEFAULT NULL,
  p_is_anonymous boolean DEFAULT false
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = common, public
AS $$
DECLARE
  v_id uuid;
  v_body text := btrim(coalesce(p_body, ''));
  v_title text := NULLIF(btrim(coalesce(p_title, '')), '');
BEGIN
  IF NOT common.is_employee_user() THEN
    RAISE EXCEPTION 'Not authorized to post prayer requests.';
  END IF;
  IF char_length(v_body) = 0 THEN
    RAISE EXCEPTION 'Prayer request body is required.';
  END IF;
  IF char_length(v_body) > 1000 THEN
    RAISE EXCEPTION 'Prayer request body must be 1000 characters or fewer.';
  END IF;

  INSERT INTO common.prayer_requests (author_id, title, body, is_anonymous)
  VALUES (auth.uid(), v_title, v_body, coalesce(p_is_anonymous, false))
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

-- Toggle "I'm praying for this". Returns the new state for the caller.
CREATE OR REPLACE FUNCTION common.prayer_request_toggle_praying(p_request_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = common, public
AS $$
DECLARE
  v_deleted int;
BEGIN
  IF NOT common.is_employee_user() THEN
    RAISE EXCEPTION 'Not authorized.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM common.prayer_requests WHERE id = p_request_id) THEN
    RAISE EXCEPTION 'Prayer request not found.';
  END IF;

  DELETE FROM common.prayer_intercessions
  WHERE request_id = p_request_id AND user_id = auth.uid();
  GET DIAGNOSTICS v_deleted = ROW_COUNT;

  IF v_deleted > 0 THEN
    RETURN false;
  END IF;

  INSERT INTO common.prayer_intercessions (request_id, user_id)
  VALUES (p_request_id, auth.uid())
  ON CONFLICT DO NOTHING;
  RETURN true;
END;
$$;

-- Author marks their own request answered (one-way).
CREATE OR REPLACE FUNCTION common.prayer_request_mark_answered(
  p_request_id uuid,
  p_note text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = common, public
AS $$
DECLARE
  v_note text := NULLIF(btrim(coalesce(p_note, '')), '');
BEGIN
  IF NOT common.is_employee_user() THEN
    RAISE EXCEPTION 'Not authorized.';
  END IF;
  IF v_note IS NOT NULL AND char_length(v_note) > 500 THEN
    RAISE EXCEPTION 'Note must be 500 characters or fewer.';
  END IF;

  UPDATE common.prayer_requests
  SET status = 'answered',
      answered_note = v_note,
      answered_at = now()
  WHERE id = p_request_id
    AND author_id = auth.uid();

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Prayer request not found or not yours.';
  END IF;
END;
$$;

-- Author deletes their own request (hard delete; intercessions cascade).
CREATE OR REPLACE FUNCTION common.prayer_request_delete(p_request_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = common, public
AS $$
BEGIN
  IF NOT common.is_employee_user() THEN
    RAISE EXCEPTION 'Not authorized.';
  END IF;

  DELETE FROM common.prayer_requests
  WHERE id = p_request_id
    AND author_id = auth.uid();

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Prayer request not found or not yours.';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION common.prayer_request_post(text, text, boolean) FROM public, anon;
REVOKE ALL ON FUNCTION common.prayer_request_toggle_praying(uuid) FROM public, anon;
REVOKE ALL ON FUNCTION common.prayer_request_mark_answered(uuid, text) FROM public, anon;
REVOKE ALL ON FUNCTION common.prayer_request_delete(uuid) FROM public, anon;

GRANT EXECUTE ON FUNCTION common.prayer_request_post(text, text, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION common.prayer_request_toggle_praying(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION common.prayer_request_mark_answered(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION common.prayer_request_delete(uuid) TO authenticated;
