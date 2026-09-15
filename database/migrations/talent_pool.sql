-- Talent Pool (recruiting prospects)
-- Plan: documentation/Feature Documentation/TALENT_POOL_PLAN.md
--
-- Sourced prospects live apart from applicants (common.candidates) until HR
-- explicitly promotes one into Candidate Tracking.
--
-- Security model (enforced in the database, not the browser):
--   * Access is an allowlist (common.talent_pool_members). Admins, Super
--     Admins, and superusers (common.is_superuser_email) grant and revoke it.
--     The role lives in auth user_metadata, which users could once edit about
--     themselves; apply protect_user_role.sql with this migration.
--   * Browser clients get no direct table access. Reads and writes go through
--     SECURITY DEFINER functions that re-check access on every call, so a
--     revoked member loses access immediately, even with an old token.
--   * Triggers enforce the lifecycle regardless of caller: promoted prospects
--     are read-only and undeletable, promotion fields can only be set by the
--     promotion function, activity is append-only.
--   * Promotion refuses to run while common.candidates is readable by anon or
--     by every signed-in user (see talent_pool_promotion_enabled()).
--   * Import functions are executable by service_role only.
--
-- Safe to re-run.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS common.talent_pool_members (
  user_id    uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  added_by   uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS common.recruiting_prospects (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  first_name        text NOT NULL,
  last_name         text,
  email             text,
  phone             text,
  linkedin_url      text,
  job_title         text,
  current_org       text,
  location          text,
  source            text NOT NULL DEFAULT 'other',
  status            text NOT NULL DEFAULT 'new',
  availability      text,
  needs_follow_up   boolean NOT NULL DEFAULT false,
  owner_id          uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  last_contact_date timestamptz,
  candidate_id      uuid REFERENCES common.candidates(id) ON DELETE RESTRICT,
  promoted_at       timestamptz,
  import_refs       jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_by        uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT recruiting_prospects_first_name_check CHECK (btrim(first_name) <> '' AND char_length(first_name) <= 100),
  CONSTRAINT recruiting_prospects_last_name_check CHECK (last_name IS NULL OR char_length(last_name) <= 100),
  CONSTRAINT recruiting_prospects_email_check CHECK (
    email IS NULL OR (email = lower(btrim(email)) AND email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' AND char_length(email) <= 255)
  ),
  CONSTRAINT recruiting_prospects_linkedin_check CHECK (
    linkedin_url IS NULL OR linkedin_url ~ '^https://www\.linkedin\.com/in/[^/?#\s]+$'
  ),
  CONSTRAINT recruiting_prospects_text_len_check CHECK (
    coalesce(char_length(phone), 0) <= 50
    AND coalesce(char_length(job_title), 0) <= 255
    AND coalesce(char_length(current_org), 0) <= 255
    AND coalesce(char_length(location), 0) <= 255
    AND coalesce(char_length(availability), 0) <= 500
  ),
  CONSTRAINT recruiting_prospects_source_check CHECK (source IN ('linkedin', 'indeed', 'referral', 'other')),
  CONSTRAINT recruiting_prospects_status_check CHECK (
    status IN ('new', 'contacted', 'interested', 'future_roles', 'not_interested', 'promoted')
  ),
  CONSTRAINT recruiting_prospects_promotion_check CHECK (
    (status = 'promoted' AND candidate_id IS NOT NULL AND promoted_at IS NOT NULL)
    OR (status <> 'promoted' AND candidate_id IS NULL AND promoted_at IS NULL)
  ),
  CONSTRAINT recruiting_prospects_import_refs_check CHECK (jsonb_typeof(import_refs) = 'array')
);

CREATE UNIQUE INDEX IF NOT EXISTS recruiting_prospects_email_key
  ON common.recruiting_prospects (lower(email)) WHERE email IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS recruiting_prospects_linkedin_key
  ON common.recruiting_prospects (linkedin_url) WHERE linkedin_url IS NOT NULL;
CREATE INDEX IF NOT EXISTS recruiting_prospects_status_idx ON common.recruiting_prospects (status);
CREATE INDEX IF NOT EXISTS recruiting_prospects_owner_idx ON common.recruiting_prospects (owner_id);
CREATE INDEX IF NOT EXISTS recruiting_prospects_candidate_idx ON common.recruiting_prospects (candidate_id);

CREATE TABLE IF NOT EXISTS common.recruiting_prospect_activity (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  prospect_id     uuid NOT NULL REFERENCES common.recruiting_prospects(id) ON DELETE CASCADE,
  type            text NOT NULL,
  body            text,
  occurred_at     timestamptz,
  original_author text,
  import_ref      jsonb,
  created_by      uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT recruiting_prospect_activity_type_check CHECK (
    type IN ('note', 'call', 'text', 'email', 'status_change', 'promoted')
  ),
  CONSTRAINT recruiting_prospect_activity_note_body_check CHECK (
    type <> 'note' OR (body IS NOT NULL AND btrim(body) <> '')
  ),
  CONSTRAINT recruiting_prospect_activity_contact_time_check CHECK (
    type NOT IN ('call', 'text', 'email') OR occurred_at IS NOT NULL
  ),
  CONSTRAINT recruiting_prospect_activity_body_len_check CHECK (body IS NULL OR char_length(body) <= 10000)
);

CREATE INDEX IF NOT EXISTS recruiting_prospect_activity_log_idx
  ON common.recruiting_prospect_activity (prospect_id, created_at, id);
CREATE UNIQUE INDEX IF NOT EXISTS recruiting_prospect_activity_one_promotion
  ON common.recruiting_prospect_activity (prospect_id) WHERE type = 'promoted';

-- One apply of an import manifest at a time.
CREATE TABLE IF NOT EXISTS common.talent_pool_import_runs (
  manifest_id  uuid PRIMARY KEY,
  run_id       uuid NOT NULL,
  target       text NOT NULL,
  heartbeat_at timestamptz NOT NULL DEFAULT now(),
  started_at   timestamptz NOT NULL DEFAULT now(),
  finished_at  timestamptz
);

-- ---------------------------------------------------------------------------
-- Normalization helpers (mirrored in src/lib/talentPool/normalize.ts)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION common.talent_pool_normalize_linkedin(p_url text) RETURNS text
  LANGUAGE plpgsql IMMUTABLE
  SET search_path = ''
  AS $$
DECLARE
  v text := btrim(coalesce(p_url, ''));
  m text[];
BEGIN
  IF v = '' THEN RETURN NULL; END IF;
  IF v !~* '^https?://' THEN v := 'https://' || v; END IF;
  v := regexp_replace(v, '[?#].*$', '');
  m := regexp_match(v, '^https?://(?:[a-z]{2,3}\.)?linkedin\.com/in/([^/\s]+)/?.*$', 'i');
  IF m IS NULL OR m[1] = '' THEN RETURN NULL; END IF;
  RETURN 'https://www.linkedin.com/in/' || lower(m[1]);
END;
$$;

CREATE OR REPLACE FUNCTION common.recruiting_prospects_before_write() RETURNS trigger
  LANGUAGE plpgsql
  SET search_path = ''
  AS $$
DECLARE
  v_linkedin text;
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status = 'promoted' THEN
      RAISE EXCEPTION 'Promoted prospects cannot be deleted' USING ERRCODE = 'P0001';
    END IF;
    RETURN OLD;
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.status = 'promoted' THEN
    -- The only change allowed: ON DELETE SET NULL when an auth user is removed.
    IF (to_jsonb(NEW) - ARRAY['owner_id', 'created_by', 'updated_at'])
         = (to_jsonb(OLD) - ARRAY['owner_id', 'created_by', 'updated_at'])
       AND (NEW.owner_id IS NULL OR NEW.owner_id = OLD.owner_id)
       AND (NEW.created_by IS NULL OR NEW.created_by = OLD.created_by) THEN
      RETURN NEW;
    END IF;
    RAISE EXCEPTION 'Promoted prospects are read-only' USING ERRCODE = 'P0001';
  END IF;

  -- Promotion fields are set only inside the promotion function.
  IF (NEW.status = 'promoted' OR NEW.candidate_id IS NOT NULL OR NEW.promoted_at IS NOT NULL)
     AND coalesce(current_setting('talent_pool.promoting', true), '') <> 'on' THEN
    RAISE EXCEPTION 'Use Promote to Candidate to move a prospect into the pipeline' USING ERRCODE = 'P0001';
  END IF;

  NEW.first_name   := btrim(coalesce(NEW.first_name, ''));
  NEW.last_name    := nullif(btrim(NEW.last_name), '');
  NEW.email        := nullif(lower(btrim(NEW.email)), '');
  NEW.phone        := nullif(btrim(NEW.phone), '');
  NEW.job_title    := nullif(btrim(NEW.job_title), '');
  NEW.current_org  := nullif(btrim(NEW.current_org), '');
  NEW.location     := nullif(btrim(NEW.location), '');
  NEW.availability := nullif(btrim(NEW.availability), '');

  IF NEW.first_name = '' THEN
    RAISE EXCEPTION 'First name is required' USING ERRCODE = '23514';
  END IF;
  IF NEW.email IS NOT NULL AND NEW.email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' THEN
    RAISE EXCEPTION 'Invalid email address' USING ERRCODE = '23514';
  END IF;
  IF nullif(btrim(NEW.linkedin_url), '') IS NOT NULL THEN
    v_linkedin := common.talent_pool_normalize_linkedin(NEW.linkedin_url);
    IF v_linkedin IS NULL THEN
      RAISE EXCEPTION 'LinkedIn URL must be a profile link (linkedin.com/in/...)' USING ERRCODE = '23514';
    END IF;
    NEW.linkedin_url := v_linkedin;
  ELSE
    NEW.linkedin_url := NULL;
  END IF;

  IF NEW.owner_id IS NOT NULL
     AND (TG_OP = 'INSERT' OR NEW.owner_id IS DISTINCT FROM OLD.owner_id)
     AND NOT EXISTS (SELECT 1 FROM common.talent_pool_members m WHERE m.user_id = NEW.owner_id) THEN
    RAISE EXCEPTION 'Owner must be a Talent Pool member' USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS recruiting_prospects_before_write ON common.recruiting_prospects;
CREATE TRIGGER recruiting_prospects_before_write
  BEFORE INSERT OR UPDATE OR DELETE ON common.recruiting_prospects
  FOR EACH ROW EXECUTE FUNCTION common.recruiting_prospects_before_write();

DROP TRIGGER IF EXISTS recruiting_prospects_updated_at ON common.recruiting_prospects;
CREATE TRIGGER recruiting_prospects_updated_at
  BEFORE UPDATE ON common.recruiting_prospects
  FOR EACH ROW EXECUTE FUNCTION common.update_updated_at_column();

CREATE OR REPLACE FUNCTION common.recruiting_prospect_activity_before_write() RETURNS trigger
  LANGUAGE plpgsql
  SET search_path = ''
  AS $$
DECLARE
  v_status text;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    -- The only change allowed: ON DELETE SET NULL when an auth user is removed.
    IF NEW.created_by IS NULL
       AND (to_jsonb(NEW) - 'created_by') = (to_jsonb(OLD) - 'created_by') THEN
      RETURN NEW;
    END IF;
    RAISE EXCEPTION 'Prospect activity is append-only' USING ERRCODE = 'P0001';
  END IF;
  IF TG_OP = 'DELETE' THEN
    -- Only allowed as the cascade from deleting the (unpromoted) prospect,
    -- which is already gone by the time this fires.
    IF EXISTS (SELECT 1 FROM common.recruiting_prospects p WHERE p.id = OLD.prospect_id) THEN
      RAISE EXCEPTION 'Prospect activity is append-only' USING ERRCODE = 'P0001';
    END IF;
    RETURN OLD;
  END IF;

  IF NEW.type IN ('status_change', 'promoted')
     AND coalesce(current_setting('talent_pool.system_event', true), '') <> 'on' THEN
    RAISE EXCEPTION 'System activity cannot be added directly' USING ERRCODE = 'P0001';
  END IF;

  SELECT p.status INTO v_status FROM common.recruiting_prospects p WHERE p.id = NEW.prospect_id;
  IF v_status = 'promoted' AND NEW.type <> 'promoted' THEN
    RAISE EXCEPTION 'Promoted prospects are read-only' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS recruiting_prospect_activity_before_write ON common.recruiting_prospect_activity;
CREATE TRIGGER recruiting_prospect_activity_before_write
  BEFORE INSERT OR UPDATE OR DELETE ON common.recruiting_prospect_activity
  FOR EACH ROW EXECUTE FUNCTION common.recruiting_prospect_activity_before_write();

-- ---------------------------------------------------------------------------
-- Authorization helpers
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION common.talent_pool_can_access() RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = ''
  AS $$
  SELECT auth.uid() IS NOT NULL
    AND EXISTS (SELECT 1 FROM common.talent_pool_members m WHERE m.user_id = auth.uid());
$$;

CREATE OR REPLACE FUNCTION common.talent_pool_is_manager() RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = ''
  AS $$
  SELECT EXISTS (
    SELECT 1 FROM auth.users u
    WHERE u.id = auth.uid()
      AND u.email_confirmed_at IS NOT NULL
      AND (
        common.is_superuser_email(u.email)
        -- Read from auth.users, not the token, so a demotion applies at once.
        -- Self-edits of role are blocked by database/migrations/protect_user_role.sql.
        OR u.raw_user_meta_data ->> 'role' IN ('Admin', 'Super Admin')
      )
  );
$$;

CREATE OR REPLACE FUNCTION common._talent_pool_require_access() RETURNS uuid
  LANGUAGE plpgsql STABLE SECURITY DEFINER
  SET search_path = ''
  AS $$
BEGIN
  IF NOT common.talent_pool_can_access() THEN
    RAISE EXCEPTION 'Not authorized for Talent Pool' USING ERRCODE = '42501';
  END IF;
  RETURN auth.uid();
END;
$$;

-- True only when candidate records are not readable by anon or by every
-- signed-in user. A policy with a real condition counts as protected.
CREATE OR REPLACE FUNCTION common.talent_pool_promotion_enabled() RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = ''
  AS $$
  WITH t AS (
    SELECT c.oid, c.relrowsecurity
    FROM pg_catalog.pg_class c
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'common' AND c.relname = 'candidates'
  ),
  exposed AS (
    SELECT r.rolname
    FROM (VALUES ('anon'::name), ('authenticated'::name)) AS r(rolname)
    CROSS JOIN t
    WHERE pg_catalog.has_table_privilege(r.rolname, t.oid, 'SELECT')
      AND (
        NOT t.relrowsecurity
        OR EXISTS (
          SELECT 1 FROM pg_catalog.pg_policies p
          WHERE p.schemaname = 'common' AND p.tablename = 'candidates'
            AND p.cmd IN ('SELECT', 'ALL')
            AND p.permissive = 'PERMISSIVE'
            AND (r.rolname = ANY (p.roles) OR 'public' = ANY (p.roles))
            AND btrim(coalesce(p.qual, 'true')) IN ('true', '(true)')
        )
      )
  )
  SELECT EXISTS (SELECT 1 FROM t) AND NOT EXISTS (SELECT 1 FROM exposed);
$$;

CREATE OR REPLACE FUNCTION common.talent_pool_my_access() RETURNS jsonb
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = ''
  AS $$
  SELECT jsonb_build_object(
    'can_access', common.talent_pool_can_access(),
    'can_manage', common.talent_pool_is_manager(),
    'promotion_enabled', common.talent_pool_promotion_enabled()
  );
$$;

-- ---------------------------------------------------------------------------
-- Members
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION common.talent_pool_members_list() RETURNS jsonb
  LANGUAGE plpgsql STABLE SECURITY DEFINER
  SET search_path = ''
  AS $$
BEGIN
  IF NOT (common.talent_pool_can_access() OR common.talent_pool_is_manager()) THEN
    RAISE EXCEPTION 'Not authorized for Talent Pool' USING ERRCODE = '42501';
  END IF;
  RETURN coalesce((
    SELECT jsonb_agg(jsonb_build_object(
      'user_id', m.user_id,
      'name', coalesce(nullif(btrim(pr.full_name), ''), u.email),
      'email', u.email,
      'created_at', m.created_at
    ) ORDER BY lower(coalesce(nullif(btrim(pr.full_name), ''), u.email)))
    FROM common.talent_pool_members m
    JOIN auth.users u ON u.id = m.user_id
    LEFT JOIN common.profiles pr ON pr.id = m.user_id
  ), '[]'::jsonb);
END;
$$;

CREATE OR REPLACE FUNCTION common.talent_pool_grant_access(p_email text) RETURNS jsonb
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path = ''
  AS $$
DECLARE
  v_user uuid;
BEGIN
  IF NOT common.talent_pool_is_manager() THEN
    RAISE EXCEPTION 'Only an Admin can manage Talent Pool access' USING ERRCODE = '42501';
  END IF;
  SELECT u.id INTO v_user FROM auth.users u WHERE lower(u.email) = lower(btrim(p_email));
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'No ampOS account uses that email' USING ERRCODE = 'P0002';
  END IF;
  INSERT INTO common.talent_pool_members (user_id, added_by)
  VALUES (v_user, auth.uid())
  ON CONFLICT (user_id) DO NOTHING;
  RETURN jsonb_build_object('user_id', v_user);
END;
$$;

CREATE OR REPLACE FUNCTION common.talent_pool_revoke_access(p_user_id uuid) RETURNS void
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path = ''
  AS $$
BEGIN
  IF NOT common.talent_pool_is_manager() THEN
    RAISE EXCEPTION 'Only an Admin can manage Talent Pool access' USING ERRCODE = '42501';
  END IF;
  DELETE FROM common.talent_pool_members WHERE user_id = p_user_id;
END;
$$;

-- ---------------------------------------------------------------------------
-- Reads
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION common._talent_pool_filtered(
  p_search text, p_source text, p_owner uuid, p_unassigned boolean, p_follow_up boolean
) RETURNS SETOF common.recruiting_prospects
  LANGUAGE sql STABLE
  SET search_path = ''
  AS $$
  WITH q AS (
    SELECT
      nullif(btrim(coalesce(p_search, '')), '') AS term,
      '%' || replace(replace(replace(btrim(coalesce(p_search, '')), '\', '\\'), '%', '\%'), '_', '\_') || '%' AS pat,
      regexp_replace(coalesce(p_search, ''), '\D', '', 'g') AS digits
  )
  SELECT p.*
  FROM common.recruiting_prospects p, q
  WHERE (
      q.term IS NULL
      OR (p.first_name || ' ' || coalesce(p.last_name, '')) ILIKE q.pat
      OR p.email ILIKE q.pat
      OR p.phone ILIKE q.pat
      OR (char_length(q.digits) >= 3 AND regexp_replace(coalesce(p.phone, ''), '\D', '', 'g') LIKE '%' || q.digits || '%')
      OR p.job_title ILIKE q.pat
      OR p.current_org ILIKE q.pat
      OR p.linkedin_url ILIKE q.pat
      OR p.location ILIKE q.pat
    )
    AND (nullif(p_source, '') IS NULL OR p.source = p_source)
    AND (p_owner IS NULL OR p.owner_id = p_owner)
    AND (NOT coalesce(p_unassigned, false) OR p.owner_id IS NULL)
    AND (NOT coalesce(p_follow_up, false) OR p.needs_follow_up);
$$;

CREATE OR REPLACE FUNCTION common._talent_pool_prospect_json(p common.recruiting_prospects) RETURNS jsonb
  LANGUAGE sql STABLE
  SET search_path = ''
  AS $$
  SELECT to_jsonb(p)
    || jsonb_build_object(
      'owner_name', (
        SELECT coalesce(nullif(btrim(pr.full_name), ''), pr.email)
        FROM common.profiles pr WHERE pr.id = p.owner_id
      ),
      'has_import_refs', jsonb_array_length(p.import_refs) > 0
    );
$$;

CREATE OR REPLACE FUNCTION common.talent_pool_list(
  p_search text DEFAULT NULL,
  p_status text DEFAULT NULL,   -- NULL: everything except promoted; 'all': everything
  p_source text DEFAULT NULL,
  p_owner uuid DEFAULT NULL,
  p_unassigned boolean DEFAULT false,
  p_follow_up boolean DEFAULT false,
  p_sort text DEFAULT 'created_at',
  p_ascending boolean DEFAULT false,
  p_limit integer DEFAULT 50,
  p_offset integer DEFAULT 0
) RETURNS jsonb
  LANGUAGE plpgsql STABLE SECURITY DEFINER
  SET search_path = ''
  AS $$
DECLARE
  v_order text;
  v_dir text := CASE WHEN p_ascending THEN 'ASC' ELSE 'DESC' END;
  v_total bigint;
  v_rows jsonb;
BEGIN
  PERFORM common._talent_pool_require_access();

  -- Whitelisted sort expressions only; never interpolate caller text.
  v_order := CASE p_sort
    WHEN 'name' THEN format('lower(coalesce(x.last_name, x.first_name)) %1$s NULLS LAST, lower(x.first_name) %1$s', v_dir)
    WHEN 'status' THEN format('x.status %s', v_dir)
    WHEN 'source' THEN format('x.source %s', v_dir)
    WHEN 'location' THEN format('lower(x.location) %s NULLS LAST', v_dir)
    WHEN 'last_contact_date' THEN format('x.last_contact_date %s NULLS LAST', v_dir)
    WHEN 'updated_at' THEN format('x.updated_at %s', v_dir)
    ELSE format('x.created_at %s', v_dir)
  END || format(', x.id %s', v_dir);

  SELECT count(*) INTO v_total
  FROM common._talent_pool_filtered(p_search, p_source, p_owner, p_unassigned, p_follow_up) x
  WHERE CASE
    WHEN p_status IS NULL OR p_status = '' THEN x.status <> 'promoted'
    WHEN p_status = 'all' THEN true
    ELSE x.status = p_status
  END;

  EXECUTE format($q$
    SELECT coalesce(jsonb_agg(common._talent_pool_prospect_json(s.pr) ORDER BY s.ord), '[]'::jsonb)
    FROM (
      SELECT x AS pr, row_number() OVER (ORDER BY %1$s) AS ord
      FROM common._talent_pool_filtered($1, $2, $3, $4, $5) x
      WHERE CASE
        WHEN $6 IS NULL OR $6 = '' THEN x.status <> 'promoted'
        WHEN $6 = 'all' THEN true
        ELSE x.status = $6
      END
      ORDER BY %1$s
      LIMIT $7 OFFSET $8
    ) s
  $q$, v_order)
  INTO v_rows
  USING p_search, p_source, p_owner, p_unassigned, p_follow_up, p_status,
        least(greatest(coalesce(p_limit, 50), 1), 200), greatest(coalesce(p_offset, 0), 0);

  RETURN jsonb_build_object('total', v_total, 'rows', v_rows);
END;
$$;

CREATE OR REPLACE FUNCTION common.talent_pool_counts(
  p_search text DEFAULT NULL,
  p_source text DEFAULT NULL,
  p_owner uuid DEFAULT NULL,
  p_unassigned boolean DEFAULT false,
  p_follow_up boolean DEFAULT false
) RETURNS jsonb
  LANGUAGE plpgsql STABLE SECURITY DEFINER
  SET search_path = ''
  AS $$
BEGIN
  PERFORM common._talent_pool_require_access();
  RETURN coalesce((
    SELECT jsonb_object_agg(s.status, s.n)
    FROM (
      SELECT x.status, count(*) AS n
      FROM common._talent_pool_filtered(p_search, p_source, p_owner, p_unassigned, p_follow_up) x
      GROUP BY x.status
    ) s
  ), '{}'::jsonb);
END;
$$;

CREATE OR REPLACE FUNCTION common.talent_pool_get(p_id uuid) RETURNS jsonb
  LANGUAGE plpgsql STABLE SECURITY DEFINER
  SET search_path = ''
  AS $$
DECLARE
  v common.recruiting_prospects;
BEGIN
  PERFORM common._talent_pool_require_access();
  SELECT * INTO v FROM common.recruiting_prospects WHERE id = p_id;
  IF NOT FOUND THEN RETURN NULL; END IF;
  RETURN common._talent_pool_prospect_json(v);
END;
$$;

CREATE OR REPLACE FUNCTION common.talent_pool_activity(
  p_prospect_id uuid, p_limit integer DEFAULT 50, p_offset integer DEFAULT 0
) RETURNS jsonb
  LANGUAGE plpgsql STABLE SECURITY DEFINER
  SET search_path = ''
  AS $$
BEGIN
  PERFORM common._talent_pool_require_access();
  RETURN jsonb_build_object(
    'total', (SELECT count(*) FROM common.recruiting_prospect_activity a WHERE a.prospect_id = p_prospect_id),
    'rows', coalesce((
      SELECT jsonb_agg(to_jsonb(s) - 'ord' ORDER BY s.ord)
      FROM (
        SELECT a.id, a.type, a.body, a.occurred_at, a.original_author,
               (a.import_ref IS NOT NULL) AS imported,
               a.created_by, a.created_at,
               (SELECT coalesce(nullif(btrim(pr.full_name), ''), pr.email) FROM common.profiles pr WHERE pr.id = a.created_by) AS created_by_name,
               row_number() OVER (ORDER BY a.created_at DESC, a.id DESC) AS ord
        FROM common.recruiting_prospect_activity a
        WHERE a.prospect_id = p_prospect_id
        ORDER BY a.created_at DESC, a.id DESC
        LIMIT least(greatest(coalesce(p_limit, 50), 1), 200)
        OFFSET greatest(coalesce(p_offset, 0), 0)
      ) s
    ), '[]'::jsonb)
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- Writes
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION common._talent_pool_log_system(
  p_prospect_id uuid, p_type text, p_body text, p_actor uuid
) RETURNS void
  LANGUAGE plpgsql
  SET search_path = ''
  AS $$
BEGIN
  PERFORM set_config('talent_pool.system_event', 'on', true);
  INSERT INTO common.recruiting_prospect_activity (prospect_id, type, body, created_by)
  VALUES (p_prospect_id, p_type, p_body, p_actor);
  PERFORM set_config('talent_pool.system_event', 'off', true);
END;
$$;

CREATE OR REPLACE FUNCTION common._talent_pool_check_status(p_status text) RETURNS void
  LANGUAGE plpgsql IMMUTABLE
  SET search_path = ''
  AS $$
BEGIN
  IF p_status IS NULL OR p_status NOT IN ('new', 'contacted', 'interested', 'future_roles', 'not_interested') THEN
    RAISE EXCEPTION 'Invalid status: %', coalesce(p_status, '(blank)') USING ERRCODE = '22023';
  END IF;
END;
$$;

-- Creates with a client-chosen id so a retried request cannot duplicate.
CREATE OR REPLACE FUNCTION common.talent_pool_create(p_id uuid, p jsonb) RETURNS jsonb
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path = ''
  AS $$
DECLARE
  v_actor uuid := common._talent_pool_require_access();
  v common.recruiting_prospects;
  v_status text := coalesce(nullif(p->>'status', ''), 'new');
BEGIN
  IF p_id IS NULL THEN
    RAISE EXCEPTION 'Prospect id is required' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v FROM common.recruiting_prospects WHERE id = p_id;
  IF FOUND THEN
    IF v.created_by IS DISTINCT FROM v_actor THEN
      RAISE EXCEPTION 'Prospect id already in use' USING ERRCODE = '23505';
    END IF;
    RETURN common._talent_pool_prospect_json(v);
  END IF;

  PERFORM common._talent_pool_check_status(v_status);

  INSERT INTO common.recruiting_prospects (
    id, first_name, last_name, email, phone, linkedin_url, job_title, current_org,
    location, source, status, availability, needs_follow_up, owner_id, created_by
  ) VALUES (
    p_id, p->>'first_name', p->>'last_name', p->>'email', p->>'phone', p->>'linkedin_url',
    p->>'job_title', p->>'current_org', p->>'location', coalesce(nullif(p->>'source', ''), 'other'),
    v_status, p->>'availability', coalesce((p->>'needs_follow_up')::boolean, false),
    nullif(p->>'owner_id', '')::uuid, v_actor
  )
  RETURNING * INTO v;

  RETURN common._talent_pool_prospect_json(v);
END;
$$;

-- Partial update: only keys present in p change. p_expected_updated_at, when
-- given, rejects the save if someone else edited the prospect first.
CREATE OR REPLACE FUNCTION common.talent_pool_update(
  p_id uuid, p jsonb, p_expected_updated_at timestamptz DEFAULT NULL
) RETURNS jsonb
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path = ''
  AS $$
DECLARE
  v_actor uuid := common._talent_pool_require_access();
  v common.recruiting_prospects;
  v_old_status text;
  v_new_status text;
BEGIN
  SELECT * INTO v FROM common.recruiting_prospects WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Prospect not found' USING ERRCODE = 'P0002';
  END IF;
  IF v.status = 'promoted' THEN
    RAISE EXCEPTION 'Promoted prospects are read-only' USING ERRCODE = 'P0001';
  END IF;
  IF p_expected_updated_at IS NOT NULL AND v.updated_at <> p_expected_updated_at THEN
    RAISE EXCEPTION 'This prospect was changed by someone else. Reload and try again.' USING ERRCODE = '40001';
  END IF;

  v_old_status := v.status;
  v_new_status := CASE WHEN p ? 'status' THEN p->>'status' ELSE v.status END;
  PERFORM common._talent_pool_check_status(v_new_status);

  UPDATE common.recruiting_prospects SET
    first_name      = CASE WHEN p ? 'first_name' THEN p->>'first_name' ELSE first_name END,
    last_name       = CASE WHEN p ? 'last_name' THEN p->>'last_name' ELSE last_name END,
    email           = CASE WHEN p ? 'email' THEN p->>'email' ELSE email END,
    phone           = CASE WHEN p ? 'phone' THEN p->>'phone' ELSE phone END,
    linkedin_url    = CASE WHEN p ? 'linkedin_url' THEN p->>'linkedin_url' ELSE linkedin_url END,
    job_title       = CASE WHEN p ? 'job_title' THEN p->>'job_title' ELSE job_title END,
    current_org     = CASE WHEN p ? 'current_org' THEN p->>'current_org' ELSE current_org END,
    location        = CASE WHEN p ? 'location' THEN p->>'location' ELSE location END,
    source          = CASE WHEN p ? 'source' THEN coalesce(nullif(p->>'source', ''), 'other') ELSE source END,
    availability    = CASE WHEN p ? 'availability' THEN p->>'availability' ELSE availability END,
    needs_follow_up = CASE WHEN p ? 'needs_follow_up' THEN coalesce((p->>'needs_follow_up')::boolean, false) ELSE needs_follow_up END,
    owner_id        = CASE WHEN p ? 'owner_id' THEN nullif(p->>'owner_id', '')::uuid ELSE owner_id END,
    status          = v_new_status
  WHERE id = p_id
  RETURNING * INTO v;

  IF v_new_status <> v_old_status THEN
    PERFORM common._talent_pool_log_system(p_id, 'status_change', v_old_status || ' → ' || v_new_status, v_actor);
  END IF;

  RETURN common._talent_pool_prospect_json(v);
END;
$$;

CREATE OR REPLACE FUNCTION common.talent_pool_delete(p_id uuid) RETURNS void
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path = ''
  AS $$
DECLARE
  v_status text;
BEGIN
  PERFORM common._talent_pool_require_access();
  SELECT status INTO v_status FROM common.recruiting_prospects WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RETURN; END IF; -- already gone: repeat-safe
  IF v_status = 'promoted' THEN
    RAISE EXCEPTION 'Promoted prospects cannot be deleted' USING ERRCODE = 'P0001';
  END IF;
  DELETE FROM common.recruiting_prospects WHERE id = p_id;
END;
$$;

-- All-or-nothing: any missing or promoted id rejects the whole request.
CREATE OR REPLACE FUNCTION common._talent_pool_lock_bulk(p_ids uuid[]) RETURNS integer
  LANGUAGE plpgsql
  SET search_path = ''
  AS $$
DECLARE
  v_wanted integer := coalesce(array_length(ARRAY(SELECT DISTINCT unnest(p_ids)), 1), 0);
  v_found integer;
  v_promoted integer;
BEGIN
  IF v_wanted = 0 THEN
    RAISE EXCEPTION 'Select at least one prospect' USING ERRCODE = '22023';
  END IF;
  IF v_wanted > 500 THEN
    RAISE EXCEPTION 'Select 500 prospects or fewer' USING ERRCODE = '22023';
  END IF;
  PERFORM 1 FROM common.recruiting_prospects WHERE id = ANY (p_ids) ORDER BY id FOR UPDATE;
  SELECT count(*), count(*) FILTER (WHERE status = 'promoted')
    INTO v_found, v_promoted
  FROM common.recruiting_prospects WHERE id = ANY (p_ids);
  IF v_found <> v_wanted THEN
    RAISE EXCEPTION '% of the selected prospects no longer exist. Reload and try again.', v_wanted - v_found USING ERRCODE = 'P0002';
  END IF;
  IF v_promoted > 0 THEN
    RAISE EXCEPTION '% selected prospects are already in the pipeline and cannot be changed. Deselect them and try again.', v_promoted USING ERRCODE = 'P0001';
  END IF;
  RETURN v_wanted;
END;
$$;

CREATE OR REPLACE FUNCTION common.talent_pool_bulk_status(p_ids uuid[], p_status text) RETURNS jsonb
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path = ''
  AS $$
DECLARE
  v_actor uuid := common._talent_pool_require_access();
  v_count integer;
  r record;
BEGIN
  PERFORM common._talent_pool_check_status(p_status);
  PERFORM common._talent_pool_lock_bulk(p_ids);
  v_count := 0;
  FOR r IN
    UPDATE common.recruiting_prospects p SET status = p_status
    FROM (SELECT id, status AS old_status FROM common.recruiting_prospects WHERE id = ANY (p_ids)) o
    WHERE p.id = o.id AND o.old_status <> p_status
    RETURNING p.id, o.old_status
  LOOP
    PERFORM common._talent_pool_log_system(r.id, 'status_change', r.old_status || ' → ' || p_status, v_actor);
    v_count := v_count + 1;
  END LOOP;
  RETURN jsonb_build_object('updated', v_count);
END;
$$;

CREATE OR REPLACE FUNCTION common.talent_pool_bulk_owner(p_ids uuid[], p_owner_id uuid) RETURNS jsonb
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path = ''
  AS $$
DECLARE
  v_count integer;
BEGIN
  PERFORM common._talent_pool_require_access();
  PERFORM common._talent_pool_lock_bulk(p_ids);
  UPDATE common.recruiting_prospects SET owner_id = p_owner_id
  WHERE id = ANY (p_ids) AND owner_id IS DISTINCT FROM p_owner_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN jsonb_build_object('updated', v_count);
END;
$$;

-- Notes and logged contacts. Retry-safe on p_id.
CREATE OR REPLACE FUNCTION common.talent_pool_add_activity(
  p_id uuid, p_prospect_id uuid, p_type text, p_body text, p_occurred_at timestamptz
) RETURNS jsonb
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path = ''
  AS $$
DECLARE
  v_actor uuid := common._talent_pool_require_access();
  v_status text;
  v_existing common.recruiting_prospect_activity;
BEGIN
  IF p_id IS NULL THEN
    RAISE EXCEPTION 'Activity id is required' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_existing FROM common.recruiting_prospect_activity WHERE id = p_id;
  IF FOUND THEN
    IF v_existing.prospect_id <> p_prospect_id OR v_existing.created_by IS DISTINCT FROM v_actor THEN
      RAISE EXCEPTION 'Activity id already in use' USING ERRCODE = '23505';
    END IF;
    RETURN to_jsonb(v_existing);
  END IF;

  IF p_type NOT IN ('note', 'call', 'text', 'email') THEN
    RAISE EXCEPTION 'Invalid activity type' USING ERRCODE = '22023';
  END IF;
  IF p_type = 'note' AND nullif(btrim(p_body), '') IS NULL THEN
    RAISE EXCEPTION 'A note needs some text' USING ERRCODE = '22023';
  END IF;
  IF p_type <> 'note' THEN
    IF p_occurred_at IS NULL THEN
      RAISE EXCEPTION 'When did this % happen?', p_type USING ERRCODE = '22023';
    END IF;
    IF p_occurred_at > now() + interval '1 day' THEN
      RAISE EXCEPTION 'Contact time cannot be in the future' USING ERRCODE = '22023';
    END IF;
  END IF;

  SELECT status INTO v_status FROM common.recruiting_prospects WHERE id = p_prospect_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Prospect not found' USING ERRCODE = 'P0002';
  END IF;
  IF v_status = 'promoted' THEN
    RAISE EXCEPTION 'Promoted prospects are read-only' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO common.recruiting_prospect_activity (id, prospect_id, type, body, occurred_at, created_by)
  VALUES (p_id, p_prospect_id, p_type, nullif(btrim(p_body), ''),
          CASE WHEN p_type = 'note' THEN NULL ELSE p_occurred_at END, v_actor)
  RETURNING * INTO v_existing;

  -- Only a dated call/text/email moves last contact, and never backward.
  IF p_type <> 'note' THEN
    UPDATE common.recruiting_prospects
    SET last_contact_date = greatest(coalesce(last_contact_date, p_occurred_at), p_occurred_at)
    WHERE id = p_prospect_id
      AND (last_contact_date IS NULL OR last_contact_date < p_occurred_at);
  END IF;

  RETURN to_jsonb(v_existing);
END;
$$;

-- ---------------------------------------------------------------------------
-- Promotion
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION common.talent_pool_candidate_matches(
  p_email text, p_first_name text DEFAULT NULL, p_last_name text DEFAULT NULL
) RETURNS jsonb
  LANGUAGE plpgsql STABLE SECURITY DEFINER
  SET search_path = ''
  AS $$
BEGIN
  PERFORM common._talent_pool_require_access();
  IF NOT common.talent_pool_promotion_enabled() THEN
    RAISE EXCEPTION 'Promotion is disabled until candidate records are access-protected' USING ERRCODE = '42501';
  END IF;
  RETURN coalesce((
    SELECT jsonb_agg(jsonb_build_object(
      'id', c.id, 'first_name', c.first_name, 'last_name', c.last_name, 'email', c.email,
      'position_applied', c.position_applied, 'status', c.status, 'applied_date', c.applied_date,
      'match', CASE WHEN lower(c.email) = lower(btrim(p_email)) THEN 'email' ELSE 'name' END
    ) ORDER BY c.applied_date DESC NULLS LAST)
    FROM common.candidates c
    WHERE (nullif(btrim(p_email), '') IS NOT NULL AND lower(c.email) = lower(btrim(p_email)))
       OR (nullif(btrim(p_first_name), '') IS NOT NULL AND nullif(btrim(p_last_name), '') IS NOT NULL
           AND lower(c.first_name) = lower(btrim(p_first_name))
           AND lower(c.last_name) = lower(btrim(p_last_name)))
  ), '[]'::jsonb);
END;
$$;

-- Shared by the UI and the import. Not executable by any client role.
--
-- p keys: first_name, last_name, email, position_applied, source, phone,
--   location, requisition_id, summary, existing_candidate_id,
--   acknowledged_candidate_ids (uuid[] the reviewer already saw).
CREATE OR REPLACE FUNCTION common._talent_pool_promote(
  p_actor uuid, p_prospect_id uuid, p jsonb, p_initial_status text
) RETURNS jsonb
  LANGUAGE plpgsql
  SET search_path = ''
  AS $$
DECLARE
  v common.recruiting_prospects;
  v_first text := btrim(coalesce(p->>'first_name', ''));
  v_last text := btrim(coalesce(p->>'last_name', ''));
  v_email text := lower(btrim(coalesce(p->>'email', '')));
  v_position text := btrim(coalesce(p->>'position_applied', ''));
  v_source text := btrim(coalesce(p->>'source', ''));
  v_phone text;
  v_location text;
  v_summary text := nullif(btrim(coalesce(p->>'summary', '')), '');
  v_req uuid := nullif(p->>'requisition_id', '')::uuid;
  v_existing uuid := nullif(p->>'existing_candidate_id', '')::uuid;
  v_ack uuid[] := ARRAY(SELECT jsonb_array_elements_text(coalesce(p->'acknowledged_candidate_ids', '[]'::jsonb))::uuid);
  v_conflicts jsonb;
  v_candidate uuid;
BEGIN
  IF NOT common.talent_pool_promotion_enabled() THEN
    RAISE EXCEPTION 'Promotion is disabled until candidate records are access-protected' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v FROM common.recruiting_prospects WHERE id = p_prospect_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Prospect not found' USING ERRCODE = 'P0002';
  END IF;

  -- Repeat calls, retries, and the loser of a race all land here.
  IF v.status = 'promoted' THEN
    RETURN jsonb_build_object('candidate_id', v.candidate_id, 'already_promoted', true);
  END IF;

  IF v_existing IS NOT NULL THEN
    PERFORM 1 FROM common.candidates WHERE id = v_existing;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'The selected application no longer exists' USING ERRCODE = 'P0002';
    END IF;
    v_candidate := v_existing; -- link only; never touch the application
  ELSE
    IF p_initial_status NOT IN ('screening', 'interview', 'offer', 'offer_sent', 'offer_accepted', 'hired') THEN
      RAISE EXCEPTION 'Invalid initial candidate status' USING ERRCODE = '22023';
    END IF;
    IF v_first = '' OR v_last = '' OR v_email = '' OR v_position = '' OR v_source = '' THEN
      RAISE EXCEPTION 'First name, last name, email, position, and source are all required' USING ERRCODE = '22023';
    END IF;
    IF v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' THEN
      RAISE EXCEPTION 'Invalid email address' USING ERRCODE = '22023';
    END IF;
    IF char_length(v_first) > 100 OR char_length(v_last) > 100 THEN
      RAISE EXCEPTION 'Names must be 100 characters or fewer' USING ERRCODE = '22001';
    END IF;
    IF char_length(v_email) > 255 OR char_length(v_position) > 255 THEN
      RAISE EXCEPTION 'Email and position must be 255 characters or fewer' USING ERRCODE = '22001';
    END IF;
    IF char_length(v_source) > 100 THEN
      RAISE EXCEPTION 'Source must be 100 characters or fewer' USING ERRCODE = '22001';
    END IF;
    IF v_req IS NOT NULL THEN
      PERFORM 1 FROM common.job_requisitions r WHERE r.id = v_req AND r.status IN ('approved', 'posted');
      IF NOT FOUND THEN
        RAISE EXCEPTION 'The selected requisition is not open' USING ERRCODE = '22023';
      END IF;
    END IF;

    -- Serialize promotions that share an email, then recheck for applications
    -- the reviewer has not seen (including ones created seconds ago).
    PERFORM pg_advisory_xact_lock(hashtextextended('talent_pool_promote:' || v_email, 0));
    PERFORM pg_advisory_xact_lock(hashtextextended('talent_pool_promote_name:' || lower(v_first || ' ' || v_last), 0));
    SELECT jsonb_agg(jsonb_build_object(
      'id', c.id, 'first_name', c.first_name, 'last_name', c.last_name, 'email', c.email,
      'position_applied', c.position_applied, 'status', c.status, 'applied_date', c.applied_date,
      'match', CASE WHEN lower(c.email) = v_email THEN 'email' ELSE 'name' END))
      INTO v_conflicts
    FROM common.candidates c
    WHERE (lower(c.email) = v_email
           OR (lower(c.first_name) = lower(v_first) AND lower(c.last_name) = lower(v_last)))
      AND NOT (c.id = ANY (v_ack));
    IF v_conflicts IS NOT NULL THEN
      RETURN jsonb_build_object('conflicts', v_conflicts);
    END IF;

    v_phone := CASE WHEN char_length(coalesce(nullif(btrim(p->>'phone'), ''), v.phone, '')) BETWEEN 1 AND 20
                    THEN coalesce(nullif(btrim(p->>'phone'), ''), v.phone) END;
    v_location := left(coalesce(nullif(btrim(p->>'location'), ''), v.location), 255);

    INSERT INTO common.candidates (
      first_name, last_name, email, phone, location, position_applied, requisition_id,
      status, source, notes, applied_date, last_contact_date
    ) VALUES (
      v_first, v_last, v_email, v_phone, v_location, v_position, v_req,
      p_initial_status, v_source,
      concat_ws(E'\n\n', v_summary, 'Added from Talent Pool.'),
      now(), v.last_contact_date
    )
    RETURNING id INTO v_candidate;
  END IF;

  PERFORM set_config('talent_pool.promoting', 'on', true);
  UPDATE common.recruiting_prospects
  SET status = 'promoted', candidate_id = v_candidate, promoted_at = now()
  WHERE id = p_prospect_id;
  PERFORM set_config('talent_pool.promoting', 'off', true);

  PERFORM common._talent_pool_log_system(
    p_prospect_id, 'promoted',
    CASE WHEN v_existing IS NOT NULL THEN 'Linked to an existing application' ELSE 'Added to Candidate Tracking' END,
    p_actor
  );

  RETURN jsonb_build_object('candidate_id', v_candidate, 'linked_existing', v_existing IS NOT NULL);
END;
$$;

CREATE OR REPLACE FUNCTION common.talent_pool_promote(p_prospect_id uuid, p jsonb) RETURNS jsonb
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path = ''
  AS $$
DECLARE
  v_actor uuid := common._talent_pool_require_access();
BEGIN
  RETURN common._talent_pool_promote(v_actor, p_prospect_id, p, 'screening');
END;
$$;

-- ---------------------------------------------------------------------------
-- One-time import (service_role only; scripts/talent-pool-import.ts)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION common.talent_pool_import_claim(
  p_manifest_id uuid, p_run_id uuid, p_target text
) RETURNS boolean
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path = ''
  AS $$
BEGIN
  INSERT INTO common.talent_pool_import_runs (manifest_id, run_id, target)
  VALUES (p_manifest_id, p_run_id, p_target)
  ON CONFLICT (manifest_id) DO UPDATE
    SET run_id = EXCLUDED.run_id, target = EXCLUDED.target,
        heartbeat_at = now(), started_at = now(), finished_at = NULL
    WHERE common.talent_pool_import_runs.run_id = EXCLUDED.run_id
       OR common.talent_pool_import_runs.finished_at IS NOT NULL
       OR common.talent_pool_import_runs.heartbeat_at < now() - interval '10 minutes';
  RETURN EXISTS (
    SELECT 1 FROM common.talent_pool_import_runs WHERE manifest_id = p_manifest_id AND run_id = p_run_id
  );
END;
$$;

CREATE OR REPLACE FUNCTION common.talent_pool_import_release(p_manifest_id uuid, p_run_id uuid) RETURNS void
  LANGUAGE sql SECURITY DEFINER
  SET search_path = ''
  AS $$
  UPDATE common.talent_pool_import_runs SET finished_at = now(), heartbeat_at = now()
  WHERE manifest_id = p_manifest_id AND run_id = p_run_id;
$$;

-- Applies one reviewed manifest operation in a single transaction.
--
-- op: { op_id, kind: 'create' | 'merge', prospect_id, expected_updated_at,
--       fields: {...}, fill_fields: [..], overwrite_fields: [..],
--       import_refs: [..], activities: [{ id, type, body, original_author, import_ref }],
--       promote: { initial_status, first_name, last_name, email, position_applied,
--                  source, existing_candidate_id, acknowledged_candidate_ids } }
-- Returns { result: 'created' | 'merged' | 'unchanged' | 'blocked', reason?, candidate_id? }.
CREATE OR REPLACE FUNCTION common.talent_pool_import_apply(
  p_operator uuid, p_manifest_id uuid, p_run_id uuid, op jsonb
) RETURNS jsonb
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path = ''
  AS $$
DECLARE
  v common.recruiting_prospects;
  v_id uuid := (op->>'prospect_id')::uuid;
  v_fields jsonb := coalesce(op->'fields', '{}'::jsonb);
  v_refs jsonb := coalesce(op->'import_refs', '[]'::jsonb);
  v_result text;
  v_promote jsonb;
  v_col text;
  v_set jsonb := '{}'::jsonb;
  a jsonb;
  v_allowed text[] := ARRAY['first_name', 'last_name', 'email', 'phone', 'linkedin_url', 'job_title',
                            'current_org', 'location', 'source', 'status', 'availability', 'needs_follow_up'];
BEGIN
  PERFORM 1 FROM common.talent_pool_import_runs
  WHERE manifest_id = p_manifest_id AND run_id = p_run_id AND finished_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Import run does not hold the manifest lock' USING ERRCODE = '55P03';
  END IF;
  UPDATE common.talent_pool_import_runs SET heartbeat_at = now() WHERE manifest_id = p_manifest_id;

  PERFORM 1 FROM auth.users u WHERE u.id = p_operator;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Import operator not found' USING ERRCODE = 'P0002';
  END IF;
  IF jsonb_typeof(v_refs) <> 'array' OR jsonb_array_length(v_refs) = 0 THEN
    RAISE EXCEPTION 'Import operations must carry their source row references' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v FROM common.recruiting_prospects WHERE id = v_id FOR UPDATE;

  IF op->>'kind' = 'create' THEN
    IF FOUND THEN
      IF v.import_refs @> v_refs THEN
        v_result := 'unchanged';
      ELSE
        RETURN jsonb_build_object('result', 'blocked', 'reason', 'Planned prospect id is already used by a different record');
      END IF;
    ELSE
      IF coalesce(v_fields->>'status', 'new') = 'promoted' THEN
        RAISE EXCEPTION 'Import cannot set promoted directly' USING ERRCODE = '22023';
      END IF;
      PERFORM common._talent_pool_check_status(coalesce(v_fields->>'status', 'new'));
      INSERT INTO common.recruiting_prospects (
        id, first_name, last_name, email, phone, linkedin_url, job_title, current_org,
        location, source, status, availability, needs_follow_up, import_refs, created_by
      ) VALUES (
        v_id, v_fields->>'first_name', v_fields->>'last_name', v_fields->>'email', v_fields->>'phone',
        v_fields->>'linkedin_url', v_fields->>'job_title', v_fields->>'current_org', v_fields->>'location',
        coalesce(nullif(v_fields->>'source', ''), 'other'), coalesce(v_fields->>'status', 'new'),
        v_fields->>'availability', coalesce((v_fields->>'needs_follow_up')::boolean, false),
        v_refs, p_operator
      )
      RETURNING * INTO v;
      v_result := 'created';
    END IF;

  ELSIF op->>'kind' = 'merge' THEN
    IF NOT FOUND THEN
      RETURN jsonb_build_object('result', 'blocked', 'reason', 'Merge target no longer exists');
    END IF;
    IF v.import_refs @> v_refs THEN
      v_result := 'unchanged';
    ELSIF v.status = 'promoted' THEN
      RETURN jsonb_build_object('result', 'blocked', 'reason', 'Merge target is already in the pipeline');
    ELSIF op->>'expected_updated_at' IS NULL
       OR v.updated_at <> (op->>'expected_updated_at')::timestamptz THEN
      RETURN jsonb_build_object('result', 'blocked', 'reason', 'Merge target was edited after review');
    ELSE
      -- Fill blanks by default; overwrite only fields HR explicitly approved.
      FOR v_col IN SELECT jsonb_array_elements_text(coalesce(op->'fill_fields', '[]'::jsonb)) LOOP
        IF v_col = ANY (v_allowed) AND v_fields ? v_col AND (to_jsonb(v)->v_col) IN ('null'::jsonb, 'false'::jsonb) THEN
          v_set := v_set || jsonb_build_object(v_col, v_fields->v_col);
        END IF;
      END LOOP;
      FOR v_col IN SELECT jsonb_array_elements_text(coalesce(op->'overwrite_fields', '[]'::jsonb)) LOOP
        IF v_col = ANY (v_allowed) AND v_fields ? v_col THEN
          v_set := v_set || jsonb_build_object(v_col, v_fields->v_col);
        END IF;
      END LOOP;
      IF v_set ? 'status' AND v_set->>'status' <> 'new' THEN
        PERFORM common._talent_pool_check_status(v_set->>'status');
      ELSIF v_set ? 'status' THEN
        v_set := v_set - 'status'; -- never reset an existing status to new
      END IF;

      UPDATE common.recruiting_prospects SET
        first_name      = CASE WHEN v_set ? 'first_name' THEN v_set->>'first_name' ELSE first_name END,
        last_name       = CASE WHEN v_set ? 'last_name' THEN v_set->>'last_name' ELSE last_name END,
        email           = CASE WHEN v_set ? 'email' THEN v_set->>'email' ELSE email END,
        phone           = CASE WHEN v_set ? 'phone' THEN v_set->>'phone' ELSE phone END,
        linkedin_url    = CASE WHEN v_set ? 'linkedin_url' THEN v_set->>'linkedin_url' ELSE linkedin_url END,
        job_title       = CASE WHEN v_set ? 'job_title' THEN v_set->>'job_title' ELSE job_title END,
        current_org     = CASE WHEN v_set ? 'current_org' THEN v_set->>'current_org' ELSE current_org END,
        location        = CASE WHEN v_set ? 'location' THEN v_set->>'location' ELSE location END,
        source          = CASE WHEN v_set ? 'source' THEN coalesce(nullif(v_set->>'source', ''), 'other') ELSE source END,
        status          = CASE WHEN v_set ? 'status' THEN v_set->>'status' ELSE status END,
        availability    = CASE WHEN v_set ? 'availability' THEN v_set->>'availability' ELSE availability END,
        needs_follow_up = CASE WHEN v_set ? 'needs_follow_up' THEN (v_set->>'needs_follow_up')::boolean ELSE needs_follow_up END,
        import_refs     = import_refs || v_refs
      WHERE id = v_id
      RETURNING * INTO v;
      v_result := 'merged';
    END IF;
  ELSE
    RAISE EXCEPTION 'Unknown import operation kind' USING ERRCODE = '22023';
  END IF;

  -- Stable ids make re-runs skip notes that already landed.
  FOR a IN SELECT * FROM jsonb_array_elements(coalesce(op->'activities', '[]'::jsonb)) LOOP
    IF a->>'type' <> 'note' THEN
      RAISE EXCEPTION 'Import only creates notes' USING ERRCODE = '22023';
    END IF;
    IF v.status = 'promoted' THEN
      EXIT;
    END IF;
    INSERT INTO common.recruiting_prospect_activity (id, prospect_id, type, body, occurred_at, original_author, import_ref, created_by)
    VALUES ((a->>'id')::uuid, v_id, 'note', a->>'body', nullif(a->>'occurred_at', '')::timestamptz,
            a->>'original_author', a->'import_ref', p_operator)
    ON CONFLICT (id) DO NOTHING;
  END LOOP;

  v_promote := op->'promote';
  IF v_promote IS NOT NULL AND jsonb_typeof(v_promote) = 'object' THEN
    v_promote := common._talent_pool_promote(p_operator, v_id, v_promote, coalesce(v_promote->>'initial_status', 'screening'));
    IF v_promote ? 'conflicts' THEN
      RAISE EXCEPTION 'Unreviewed candidate matches for this prospect: %', v_promote->'conflicts' USING ERRCODE = 'P0001';
    END IF;
    RETURN jsonb_build_object('result', v_result, 'candidate_id', v_promote->'candidate_id');
  END IF;

  RETURN jsonb_build_object('result', v_result);
END;
$$;

-- ---------------------------------------------------------------------------
-- RLS and grants
-- ---------------------------------------------------------------------------
ALTER TABLE common.talent_pool_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE common.recruiting_prospects ENABLE ROW LEVEL SECURITY;
ALTER TABLE common.recruiting_prospect_activity ENABLE ROW LEVEL SECURITY;
ALTER TABLE common.talent_pool_import_runs ENABLE ROW LEVEL SECURITY;

-- Defense-in-depth only: clients have no table privileges below.
DROP POLICY IF EXISTS "Talent Pool members read prospects" ON common.recruiting_prospects;
CREATE POLICY "Talent Pool members read prospects" ON common.recruiting_prospects
  FOR SELECT TO authenticated USING (common.talent_pool_can_access());
DROP POLICY IF EXISTS "Talent Pool members read activity" ON common.recruiting_prospect_activity;
CREATE POLICY "Talent Pool members read activity" ON common.recruiting_prospect_activity
  FOR SELECT TO authenticated USING (common.talent_pool_can_access());

REVOKE ALL ON TABLE common.talent_pool_members FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE common.recruiting_prospects FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE common.recruiting_prospect_activity FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE common.talent_pool_import_runs FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE common.talent_pool_members FROM service_role;
REVOKE ALL ON TABLE common.recruiting_prospects FROM service_role;
REVOKE ALL ON TABLE common.recruiting_prospect_activity FROM service_role;
REVOKE ALL ON TABLE common.talent_pool_import_runs FROM service_role;
-- The import dry run reads existing prospects to find matches.
GRANT SELECT ON TABLE common.recruiting_prospects TO service_role;

DO $$
DECLARE
  f text;
BEGIN
  -- Everything starts closed.
  FOREACH f IN ARRAY ARRAY[
    'common.talent_pool_normalize_linkedin(text)',
    'common.recruiting_prospects_before_write()',
    'common.recruiting_prospect_activity_before_write()',
    'common.talent_pool_can_access()',
    'common.talent_pool_is_manager()',
    'common._talent_pool_require_access()',
    'common.talent_pool_promotion_enabled()',
    'common.talent_pool_my_access()',
    'common.talent_pool_members_list()',
    'common.talent_pool_grant_access(text)',
    'common.talent_pool_revoke_access(uuid)',
    'common._talent_pool_filtered(text, text, uuid, boolean, boolean)',
    'common._talent_pool_prospect_json(common.recruiting_prospects)',
    'common.talent_pool_list(text, text, text, uuid, boolean, boolean, text, boolean, integer, integer)',
    'common.talent_pool_counts(text, text, uuid, boolean, boolean)',
    'common.talent_pool_get(uuid)',
    'common.talent_pool_activity(uuid, integer, integer)',
    'common._talent_pool_log_system(uuid, text, text, uuid)',
    'common._talent_pool_check_status(text)',
    'common.talent_pool_create(uuid, jsonb)',
    'common.talent_pool_update(uuid, jsonb, timestamptz)',
    'common.talent_pool_delete(uuid)',
    'common._talent_pool_lock_bulk(uuid[])',
    'common.talent_pool_bulk_status(uuid[], text)',
    'common.talent_pool_bulk_owner(uuid[], uuid)',
    'common.talent_pool_add_activity(uuid, uuid, text, text, timestamptz)',
    'common.talent_pool_candidate_matches(text, text, text)',
    'common._talent_pool_promote(uuid, uuid, jsonb, text)',
    'common.talent_pool_promote(uuid, jsonb)',
    'common.talent_pool_import_claim(uuid, uuid, text)',
    'common.talent_pool_import_release(uuid, uuid)',
    'common.talent_pool_import_apply(uuid, uuid, uuid, jsonb)'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated, service_role', f);
  END LOOP;

  -- Browser-callable. Each re-checks membership itself.
  FOREACH f IN ARRAY ARRAY[
    'common.talent_pool_can_access()',
    'common.talent_pool_my_access()',
    'common.talent_pool_members_list()',
    'common.talent_pool_grant_access(text)',
    'common.talent_pool_revoke_access(uuid)',
    'common.talent_pool_list(text, text, text, uuid, boolean, boolean, text, boolean, integer, integer)',
    'common.talent_pool_counts(text, text, uuid, boolean, boolean)',
    'common.talent_pool_get(uuid)',
    'common.talent_pool_activity(uuid, integer, integer)',
    'common.talent_pool_create(uuid, jsonb)',
    'common.talent_pool_update(uuid, jsonb, timestamptz)',
    'common.talent_pool_delete(uuid)',
    'common.talent_pool_bulk_status(uuid[], text)',
    'common.talent_pool_bulk_owner(uuid[], uuid)',
    'common.talent_pool_add_activity(uuid, uuid, text, text, timestamptz)',
    'common.talent_pool_candidate_matches(text, text, text)',
    'common.talent_pool_promote(uuid, jsonb)'
  ] LOOP
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', f);
  END LOOP;

  -- Import script only.
  FOREACH f IN ARRAY ARRAY[
    'common.talent_pool_promotion_enabled()',
    'common.talent_pool_import_claim(uuid, uuid, text)',
    'common.talent_pool_import_release(uuid, uuid)',
    'common.talent_pool_import_apply(uuid, uuid, uuid, jsonb)'
  ] LOOP
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', f);
  END LOOP;
END;
$$;

-- RLS policies call this as the querying role.
GRANT EXECUTE ON FUNCTION common.talent_pool_can_access() TO authenticated;

-- Superusers start with access. Everyone else is added from the page.
INSERT INTO common.talent_pool_members (user_id)
SELECT u.id FROM auth.users u
WHERE u.email_confirmed_at IS NOT NULL AND common.is_superuser_email(u.email)
ON CONFLICT (user_id) DO NOTHING;

NOTIFY pgrst, 'reload schema';
