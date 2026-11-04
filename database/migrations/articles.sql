-- Articles: written in ampOS, published to ampqes.com/articles/{slug}.
--
-- Same model as careers. The website reads common.v_published_articles at build
-- time with the publishable (anon) key, and a rebuild is requested from Vercel
-- whenever something the public can see changes.
--
--   common.articles             one article, its workflow status and its content
--   common.article_publishers   extra people allowed to publish (Admins always can)
--   common.v_published_articles the public contract read by ampqes.com
--   storage bucket article-images  public cover and inline images
--
-- Workflow: draft -> in_review -> published, plus unpublish (back to draft) and
-- archive. Anyone signed in can write their own drafts and submit them. Only a
-- publisher can publish, unpublish, archive or edit someone else's article.
--
-- The slug (web address) locks the first time an article is published, so a
-- published URL never breaks. published_at is set by the first publish and never
-- moves; later edits to a live article move content_updated_at instead.
--
-- One-time setup after running this file (the deploy hook URL stays out of git):
--   SELECT vault.create_secret('<Vercel deploy hook URL>', 'ampqes_site_deploy_hook');
-- Until that secret exists, publishing still works; the site just is not rebuilt.

-- ---------------------------------------------------------------------------
-- Who may publish
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS common.article_publishers (
  user_id    uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  added_by   uuid DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE common.article_publishers IS
  'People who may publish articles to ampqes.com in addition to Admins and superusers.';

-- Admin, Super Admin or a superuser email. Read from auth.users, not the token,
-- so a demotion applies at once. Self-edits of role are blocked by
-- protect_user_role.sql.
CREATE OR REPLACE FUNCTION common.article_is_admin() RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = ''
  AS $$
  SELECT EXISTS (
    SELECT 1 FROM auth.users u
    WHERE u.id = auth.uid()
      AND u.email_confirmed_at IS NOT NULL
      AND (
        common.is_superuser_email(u.email)
        OR u.raw_user_meta_data ->> 'role' IN ('Admin', 'Super Admin')
      )
  );
$$;

CREATE OR REPLACE FUNCTION common.article_can_publish() RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = ''
  AS $$
  SELECT auth.uid() IS NOT NULL AND (
    common.article_is_admin()
    OR EXISTS (SELECT 1 FROM common.article_publishers p WHERE p.user_id = auth.uid())
  );
$$;

REVOKE ALL ON FUNCTION common.article_is_admin() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION common.article_can_publish() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION common.article_is_admin() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION common.article_can_publish() TO authenticated, service_role;

ALTER TABLE common.article_publishers ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE common.article_publishers FROM PUBLIC, anon;
GRANT SELECT, INSERT, DELETE ON TABLE common.article_publishers TO authenticated;
GRANT ALL ON TABLE common.article_publishers TO service_role;

DROP POLICY IF EXISTS "article_publishers_select" ON common.article_publishers;
CREATE POLICY "article_publishers_select" ON common.article_publishers
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "article_publishers_insert" ON common.article_publishers;
CREATE POLICY "article_publishers_insert" ON common.article_publishers
  FOR INSERT TO authenticated WITH CHECK (common.article_is_admin());

DROP POLICY IF EXISTS "article_publishers_delete" ON common.article_publishers;
CREATE POLICY "article_publishers_delete" ON common.article_publishers
  FOR DELETE TO authenticated USING (common.article_is_admin());

-- ---------------------------------------------------------------------------
-- Articles
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS common.articles (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title              text NOT NULL DEFAULT '',
  -- Lowercase words joined by hyphens. Required to submit. Locks at first publish.
  slug               text,
  -- Plain text, about 140 to 160 characters. Used for list cards and meta description.
  excerpt            text,
  -- HTML from the ampOS article editor, already cleaned to the site's allowlist.
  body_html          text NOT NULL DEFAULT '',
  cover_image_url    text,
  cover_image_alt    text,
  category           text,
  tags               text[] NOT NULL DEFAULT '{}',
  -- Byline. Profile id (same as the auth user id).
  author_id          uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  status             text NOT NULL DEFAULT 'draft'
                       CHECK (status IN ('draft', 'in_review', 'published', 'archived')),
  -- Publisher feedback when an article is sent back.
  review_notes       text,
  submitted_at       timestamptz,
  submitted_by       uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  -- First publish. Never changes after that.
  published_at       timestamptz,
  published_by       uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  -- Last change the public can see, after first publish.
  content_updated_at timestamptz,
  created_by         uuid DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  deleted_at         timestamptz,
  CONSTRAINT articles_slug_format
    CHECK (slug IS NULL OR (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND length(slug) <= 120)),
  CONSTRAINT articles_excerpt_length CHECK (excerpt IS NULL OR length(excerpt) <= 300)
);

CREATE UNIQUE INDEX IF NOT EXISTS articles_slug_key
  ON common.articles (slug) WHERE deleted_at IS NULL AND slug IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_articles_status ON common.articles (status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_articles_author_id ON common.articles (author_id);
CREATE INDEX IF NOT EXISTS idx_articles_created_by ON common.articles (created_by);

COMMENT ON TABLE common.articles IS
  'Articles for ampqes.com/articles. Public output is common.v_published_articles only.';

-- Enforces the workflow. RLS decides which rows a person can touch; this decides
-- what they may change on them. Calls with no login (SQL editor, service role)
-- skip the checks so data can be fixed by hand.
CREATE OR REPLACE FUNCTION common.articles_before_write() RETURNS trigger
  LANGUAGE plpgsql
  SET search_path = ''
  AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_publisher boolean := v_uid IS NULL OR common.article_can_publish();
BEGIN
  NEW.title := btrim(coalesce(NEW.title, ''));
  NEW.slug := nullif(lower(btrim(NEW.slug)), '');
  NEW.excerpt := nullif(btrim(NEW.excerpt), '');
  NEW.body_html := coalesce(NEW.body_html, '');
  NEW.cover_image_url := nullif(btrim(NEW.cover_image_url), '');
  NEW.cover_image_alt := nullif(btrim(NEW.cover_image_alt), '');
  NEW.category := nullif(btrim(NEW.category), '');
  NEW.tags := coalesce(NEW.tags, '{}');
  IF NEW.cover_image_url IS NULL THEN
    NEW.cover_image_alt := NULL;
  END IF;

  IF TG_OP = 'INSERT' THEN
    NEW.created_at := now();
    NEW.updated_at := now();
    IF v_uid IS NOT NULL THEN
      NEW.created_by := v_uid;
      NEW.author_id := CASE WHEN v_publisher THEN coalesce(NEW.author_id, v_uid) ELSE v_uid END;
      -- New articles always start as drafts.
      NEW.status := 'draft';
      NEW.review_notes := NULL;
      NEW.submitted_at := NULL;
      NEW.submitted_by := NULL;
      NEW.published_at := NULL;
      NEW.published_by := NULL;
      NEW.content_updated_at := NULL;
      NEW.deleted_at := NULL;
    ELSIF NEW.status = 'published' THEN
      NEW.published_at := coalesce(NEW.published_at, now());
    END IF;
    RETURN NEW;
  END IF;

  -- UPDATE
  NEW.id := OLD.id;
  NEW.created_at := OLD.created_at;
  NEW.updated_at := now();

  IF v_uid IS NOT NULL THEN
    NEW.created_by := OLD.created_by;
    NEW.submitted_at := OLD.submitted_at;
    NEW.submitted_by := OLD.submitted_by;
    NEW.published_at := OLD.published_at;
    NEW.published_by := OLD.published_by;
    NEW.content_updated_at := OLD.content_updated_at;
    IF NOT v_publisher THEN
      NEW.author_id := OLD.author_id;
      NEW.review_notes := OLD.review_notes;
    END IF;
  END IF;

  IF OLD.published_at IS NOT NULL AND NEW.slug IS DISTINCT FROM OLD.slug THEN
    RAISE EXCEPTION 'The web address of an article cannot change after it has been published.'
      USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF (NEW.status IN ('published', 'archived') OR OLD.status IN ('published', 'archived'))
       AND NOT v_publisher THEN
      RAISE EXCEPTION 'Only article publishers can publish, unpublish or archive.'
        USING ERRCODE = 'insufficient_privilege';
    END IF;

    IF NEW.status = 'in_review' THEN
      NEW.submitted_at := now();
      NEW.submitted_by := v_uid;
    END IF;

    IF NEW.status = 'published' THEN
      NEW.published_at := coalesce(OLD.published_at, NEW.published_at, now());
      NEW.published_by := coalesce(OLD.published_by, NEW.published_by, v_uid);
      NEW.review_notes := NULL;
      -- Coming back after an unpublish counts as an update, not a new date.
      IF OLD.published_at IS NOT NULL THEN
        NEW.content_updated_at := now();
      END IF;
    END IF;
  ELSIF NEW.status = 'published'
    AND ROW(NEW.title, NEW.excerpt, NEW.body_html, NEW.cover_image_url, NEW.cover_image_alt,
            NEW.category, NEW.tags, NEW.author_id)
        IS DISTINCT FROM
        ROW(OLD.title, OLD.excerpt, OLD.body_html, OLD.cover_image_url, OLD.cover_image_alt,
            OLD.category, OLD.tags, OLD.author_id) THEN
    NEW.content_updated_at := now();
  END IF;

  IF NEW.status IN ('in_review', 'published') AND NEW.deleted_at IS NULL THEN
    IF NEW.title = ''
       OR NEW.slug IS NULL
       OR NEW.excerpt IS NULL
       OR btrim(regexp_replace(regexp_replace(NEW.body_html, '<[^>]*>', '', 'g'), '&nbsp;', ' ', 'g')) = '' THEN
      RAISE EXCEPTION 'An article needs a title, web address, summary and body before it can be submitted or published.'
        USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.cover_image_url IS NOT NULL AND NEW.cover_image_alt IS NULL THEN
      RAISE EXCEPTION 'Describe the cover image (alt text) before submitting or publishing.'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_articles_before_write ON common.articles;
CREATE TRIGGER trg_articles_before_write
  BEFORE INSERT OR UPDATE ON common.articles
  FOR EACH ROW EXECUTE FUNCTION common.articles_before_write();

ALTER TABLE common.articles ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE common.articles FROM PUBLIC, anon;
-- No DELETE: articles are soft deleted with deleted_at.
GRANT SELECT, INSERT, UPDATE ON TABLE common.articles TO authenticated;
GRANT ALL ON TABLE common.articles TO service_role;

-- Everyone signed in sees live articles. Drafts are visible to their writer,
-- their byline author and publishers.
DROP POLICY IF EXISTS "articles_select" ON common.articles;
CREATE POLICY "articles_select" ON common.articles
  FOR SELECT TO authenticated
  USING (
    (status = 'published' AND deleted_at IS NULL)
    OR created_by = auth.uid()
    OR author_id = auth.uid()
    OR common.article_can_publish()
  );

-- The trigger forces created_by, author and draft status on insert.
DROP POLICY IF EXISTS "articles_insert" ON common.articles;
CREATE POLICY "articles_insert" ON common.articles
  FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid());

-- Writers edit their own drafts and in-review articles. Publishers edit anything.
DROP POLICY IF EXISTS "articles_update" ON common.articles;
CREATE POLICY "articles_update" ON common.articles
  FOR UPDATE TO authenticated
  USING (
    common.article_can_publish()
    OR ((created_by = auth.uid() OR author_id = auth.uid()) AND status IN ('draft', 'in_review'))
  )
  WITH CHECK (
    common.article_can_publish()
    OR ((created_by = auth.uid() OR author_id = auth.uid()) AND status IN ('draft', 'in_review'))
  );

-- ---------------------------------------------------------------------------
-- Public contract for ampqes.com
-- ---------------------------------------------------------------------------
-- Not security_invoker on purpose: anon has no access to common.articles or
-- common.profiles, and reads only these columns through the view. Same as
-- common.v_posted_job_requisitions.

CREATE OR REPLACE VIEW common.v_published_articles AS
 SELECT a.id,
    a.slug,
    a.title,
    a.excerpt,
    a.body_html,
    a.cover_image_url,
    a.cover_image_alt,
    p.full_name AS author_name,
    p.job_title AS author_title,
    nullif(btrim(regexp_replace(lower(coalesce(p.full_name, '')), '[^a-z0-9]+', '-', 'g'), '-'), '') AS author_slug,
    a.category,
    a.tags,
    a.published_at,
    coalesce(a.content_updated_at, a.published_at) AS updated_at
   FROM common.articles a
   LEFT JOIN common.profiles p ON p.id = a.author_id
  WHERE a.deleted_at IS NULL
    AND a.status = 'published'
    AND a.published_at IS NOT NULL
    AND a.published_at <= now()
  ORDER BY a.published_at DESC;

COMMENT ON VIEW common.v_published_articles IS
  'Public contract for ampqes.com/articles. The sole definition of a published '
  'article. Read by the anon role at website build time. Changing the WHERE '
  'clause changes what the public sees; removing or reordering columns breaks '
  'the ampqes.com build. Coordinate with that repo.';

GRANT SELECT ON common.v_published_articles TO anon;
GRANT SELECT ON common.v_published_articles TO authenticated;

-- ---------------------------------------------------------------------------
-- Rebuild ampqes.com when public output changes
-- ---------------------------------------------------------------------------
-- Fires only on publish, unpublish, archive, delete, or an edit to a live
-- article. Draft saves never rebuild the site. pg_net sends the request after
-- the save commits. A failure here only logs a warning; it never blocks a save.

CREATE OR REPLACE FUNCTION common.articles_request_site_rebuild() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path = ''
  AS $$
DECLARE
  v_url text;
BEGIN
  BEGIN
    SELECT s.decrypted_secret INTO v_url
      FROM vault.decrypted_secrets s
     WHERE s.name = 'ampqes_site_deploy_hook'
     LIMIT 1;
    IF v_url IS NULL THEN
      RAISE WARNING 'articles: vault secret ampqes_site_deploy_hook is not set, site not rebuilt';
    ELSE
      PERFORM net.http_post(
        url := v_url,
        body := '{}'::jsonb,
        headers := '{"Content-Type": "application/json"}'::jsonb,
        timeout_milliseconds := 5000
      );
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'articles: site rebuild request failed: %', SQLERRM;
  END;
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION common.articles_request_site_rebuild() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_articles_site_rebuild_insert ON common.articles;
CREATE TRIGGER trg_articles_site_rebuild_insert
  AFTER INSERT ON common.articles
  FOR EACH ROW
  WHEN (NEW.status = 'published' AND NEW.deleted_at IS NULL)
  EXECUTE FUNCTION common.articles_request_site_rebuild();

DROP TRIGGER IF EXISTS trg_articles_site_rebuild_update ON common.articles;
CREATE TRIGGER trg_articles_site_rebuild_update
  AFTER UPDATE ON common.articles
  FOR EACH ROW
  WHEN (
    ((OLD.status = 'published' AND OLD.deleted_at IS NULL)
      OR (NEW.status = 'published' AND NEW.deleted_at IS NULL))
    AND ROW(OLD.status, OLD.deleted_at, OLD.slug, OLD.title, OLD.excerpt, OLD.body_html,
            OLD.cover_image_url, OLD.cover_image_alt, OLD.category, OLD.tags,
            OLD.author_id, OLD.published_at)
        IS DISTINCT FROM
        ROW(NEW.status, NEW.deleted_at, NEW.slug, NEW.title, NEW.excerpt, NEW.body_html,
            NEW.cover_image_url, NEW.cover_image_alt, NEW.category, NEW.tags,
            NEW.author_id, NEW.published_at)
  )
  EXECUTE FUNCTION common.articles_request_site_rebuild();

DROP TRIGGER IF EXISTS trg_articles_site_rebuild_delete ON common.articles;
CREATE TRIGGER trg_articles_site_rebuild_delete
  AFTER DELETE ON common.articles
  FOR EACH ROW
  WHEN (OLD.status = 'published' AND OLD.deleted_at IS NULL)
  EXECUTE FUNCTION common.articles_request_site_rebuild();

-- ---------------------------------------------------------------------------
-- Images: public bucket so URLs keep working on the static site
-- ---------------------------------------------------------------------------
-- Files are never overwritten (each upload gets a new name), and only
-- publishers can delete, so an image on a live page cannot vanish.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('article-images', 'article-images', true, 10485760,
        ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif'])
ON CONFLICT (id) DO UPDATE
  SET public = true,
      file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "article_images_insert" ON storage.objects;
CREATE POLICY "article_images_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'article-images' AND (storage.foldername(name))[1] IS NOT NULL);

DROP POLICY IF EXISTS "article_images_delete" ON storage.objects;
CREATE POLICY "article_images_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'article-images' AND common.article_can_publish());
