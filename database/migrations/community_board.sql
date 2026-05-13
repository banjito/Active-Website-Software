-- AMP Community Board — run in Supabase SQL editor (or via your migration process).
-- Creates tables in schema `common` alongside profiles / issue_reports.
--
-- After applying:
-- 1. Create Storage bucket named `community-media` (public) in Dashboard → Storage.
-- 2. Storage bucket `community-media` (public read recommended for feed URLs).
--    Example policies (SQL, run after bucket exists):
--
--    CREATE POLICY "community_media_read"
--      ON storage.objects FOR SELECT TO public
--      USING (bucket_id = 'community-media');
--
--    CREATE POLICY "community_media_insert_own"
--      ON storage.objects FOR INSERT TO authenticated
--      WITH CHECK (
--        bucket_id = 'community-media'
--        AND (storage.foldername(name))[1] = auth.uid()::text
--      );

-- ── Tables ─────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS common.posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  body text NOT NULL DEFAULT '',
  media_urls text[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT posts_body_or_media CHECK (
    length(trim(body)) > 0 OR coalesce(cardinality(media_urls), 0) > 0
  )
);

CREATE TABLE IF NOT EXISTS common.post_reactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL REFERENCES common.posts (id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  type text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT post_reactions_type_nonempty CHECK (length(trim(type)) > 0),
  CONSTRAINT post_reactions_unique_user_type UNIQUE (post_id, user_id, type)
);

CREATE TABLE IF NOT EXISTS common.post_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL REFERENCES common.posts (id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT post_comments_body_nonempty CHECK (length(trim(body)) > 0)
);

CREATE INDEX IF NOT EXISTS posts_created_at_desc ON common.posts (created_at DESC);
CREATE INDEX IF NOT EXISTS post_reactions_post_id ON common.post_reactions (post_id);
CREATE INDEX IF NOT EXISTS post_comments_post_id_created ON common.post_comments (post_id, created_at ASC);

-- ── Row Level Security ─────────────────────────────────────────────────────

ALTER TABLE common.posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE common.post_reactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE common.post_comments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "posts_select_authenticated" ON common.posts;
CREATE POLICY "posts_select_authenticated"
  ON common.posts FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "posts_insert_own" ON common.posts;
CREATE POLICY "posts_insert_own"
  ON common.posts FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "posts_update_own" ON common.posts;
CREATE POLICY "posts_update_own"
  ON common.posts FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "posts_delete_own" ON common.posts;
CREATE POLICY "posts_delete_own"
  ON common.posts FOR DELETE TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "post_reactions_select_authenticated" ON common.post_reactions;
CREATE POLICY "post_reactions_select_authenticated"
  ON common.post_reactions FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "post_reactions_insert_own" ON common.post_reactions;
CREATE POLICY "post_reactions_insert_own"
  ON common.post_reactions FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "post_reactions_delete_own" ON common.post_reactions;
CREATE POLICY "post_reactions_delete_own"
  ON common.post_reactions FOR DELETE TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "post_comments_select_authenticated" ON common.post_comments;
CREATE POLICY "post_comments_select_authenticated"
  ON common.post_comments FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "post_comments_insert_own" ON common.post_comments;
CREATE POLICY "post_comments_insert_own"
  ON common.post_comments FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "post_comments_update_own" ON common.post_comments;
CREATE POLICY "post_comments_update_own"
  ON common.post_comments FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "post_comments_delete_own" ON common.post_comments;
CREATE POLICY "post_comments_delete_own"
  ON common.post_comments FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- ── Grants ────────────────────────────────────────────────────────────────

GRANT SELECT, INSERT, UPDATE, DELETE ON common.posts TO authenticated;
GRANT SELECT, INSERT, DELETE ON common.post_reactions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON common.post_comments TO authenticated;

-- ── Realtime (ignore errors if already member of publication) ─────────────

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE common.posts;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE common.post_comments;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
