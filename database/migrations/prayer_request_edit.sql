-- Prayer Wall: edit a request, and let admins act on any request.
-- Authors can edit, answer or delete their own. Admins, Super Admins and
-- superusers can edit, answer or delete any. Safe to re-run.
--
-- is_anonymous is deliberately not editable here, so an admin edit can never
-- unmask an anonymous author. Nothing about the author is returned either.

-- Role is read from auth.users, not the JWT, so a demoted admin loses access
-- right away instead of when their token expires.
CREATE OR REPLACE FUNCTION common.prayer_wall_is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT coalesce(
    (
      SELECT coalesce(u.raw_user_meta_data ->> 'role', '') IN ('Admin', 'Super Admin')
             OR common.is_superuser_email(u.email)
      FROM auth.users u
      WHERE u.id = auth.uid()
    ),
    false
  );
$$;

-- Only called from inside the SECURITY DEFINER functions below.
REVOKE ALL ON FUNCTION common.prayer_wall_is_admin() FROM public, anon, authenticated;

CREATE OR REPLACE FUNCTION common.prayer_request_update(
  p_request_id uuid,
  p_body text,
  p_title text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = common, public
AS $$
DECLARE
  v_body text := btrim(coalesce(p_body, ''));
  v_title text := NULLIF(btrim(coalesce(p_title, '')), '');
BEGIN
  IF NOT common.is_employee_user() THEN
    RAISE EXCEPTION 'Not authorized.';
  END IF;
  IF char_length(v_body) = 0 THEN
    RAISE EXCEPTION 'Prayer request body is required.';
  END IF;
  IF char_length(v_body) > 1000 THEN
    RAISE EXCEPTION 'Prayer request body must be 1000 characters or fewer.';
  END IF;
  IF v_title IS NOT NULL AND char_length(v_title) > 120 THEN
    RAISE EXCEPTION 'Title must be 120 characters or fewer.';
  END IF;

  UPDATE common.prayer_requests
  SET title = v_title,
      body = v_body
  WHERE id = p_request_id
    AND (author_id = auth.uid() OR common.prayer_wall_is_admin());

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Prayer request not found or not yours.';
  END IF;
END;
$$;

-- Replaces the author-only version in prayer_wall.sql. Same signature, so its
-- existing grants carry over. status = 'active' stops a second person with a
-- stale page from overwriting the first person's answer note.
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
    AND status = 'active'
    AND (author_id = auth.uid() OR common.prayer_wall_is_admin());

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Prayer request not found, not yours, or already answered.';
  END IF;
END;
$$;

-- Replaces the author-only version in prayer_wall.sql. Same signature, so its
-- existing grants carry over. Hard delete; intercessions cascade.
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
    AND (author_id = auth.uid() OR common.prayer_wall_is_admin());

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Prayer request not found or not yours.';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION common.prayer_request_update(uuid, text, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION common.prayer_request_update(uuid, text, text) TO authenticated;

NOTIFY pgrst, 'reload schema';
