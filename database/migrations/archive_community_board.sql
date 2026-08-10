-- Retire the community board WITHOUT losing anything.
--
-- The app code is gone, so these tables are already unreachable. This moves
-- them out of `common` into an `archive` schema and takes away app access.
-- Nothing is deleted. Every post, comment, reaction, and image survives.
--
-- Run this instead of drop_community_board.sql. Only run the drop later,
-- once you have gone a few months without wanting any of it back.

CREATE SCHEMA IF NOT EXISTS archive;

-- Stop realtime from broadcasting tables nothing listens to anymore.
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime DROP TABLE common.posts;
EXCEPTION
  WHEN undefined_object THEN NULL;
  WHEN undefined_table THEN NULL;
END $$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime DROP TABLE common.post_comments;
EXCEPTION
  WHEN undefined_object THEN NULL;
  WHEN undefined_table THEN NULL;
END $$;

-- Move the tables. Indexes, constraints, and data all move with them.
ALTER TABLE IF EXISTS common.posts          SET SCHEMA archive;
ALTER TABLE IF EXISTS common.post_reactions SET SCHEMA archive;
ALTER TABLE IF EXISTS common.post_comments  SET SCHEMA archive;

-- Revoke app access. The archive schema is reachable only by the service
-- role / SQL editor, so nothing in the browser can touch these again.
REVOKE ALL ON archive.posts          FROM authenticated, anon;
REVOKE ALL ON archive.post_reactions FROM authenticated, anon;
REVOKE ALL ON archive.post_comments  FROM authenticated, anon;
REVOKE ALL ON SCHEMA archive FROM authenticated, anon;

-- Leave a note for whoever finds this in two years.
COMMENT ON TABLE archive.posts IS
  'Community board, retired 2026-08-10. Feature removed from the app; data kept for reference.';

-- To undo all of this:
--   ALTER TABLE archive.posts SET SCHEMA common;  (and the other two)
--   then re-grant to authenticated.
