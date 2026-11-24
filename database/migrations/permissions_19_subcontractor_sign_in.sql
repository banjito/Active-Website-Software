-- ampOS Roles & Permissions, item 8 part 2b: what the subcontractor invite and
-- sign-in link functions need. Nothing changes for anyone by itself.
--
--   1. external_users remembers when a sign-in link was last emailed (one a minute).
--   2. A lookup from email to an active subcontractor, for the two functions only.
--
-- All or nothing.

BEGIN;
SET LOCAL lock_timeout = '5s';

ALTER TABLE common.external_users ADD COLUMN IF NOT EXISTS last_link_sent_at timestamptz;

-- The active (not removed) subcontractor with this email, or null.
CREATE OR REPLACE FUNCTION common.subcontractor_for_email(p_email text) RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO ''
AS $$
  SELECT e.user_id
    FROM common.external_users e
    JOIN auth.users u ON u.id = e.user_id
   WHERE lower(u.email) = lower(btrim(coalesce(p_email, '')))
     AND e.removed_at IS NULL
   LIMIT 1;
$$;
REVOKE ALL ON FUNCTION common.subcontractor_for_email(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION common.subcontractor_for_email(text) TO service_role;

COMMIT;

-- Check (run after): expect 1
--   select count(*) from information_schema.columns
--    where table_schema = 'common' and table_name = 'external_users' and column_name = 'last_link_sent_at';
