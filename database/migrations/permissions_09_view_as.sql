-- ampOS Roles & Permissions, item 4: "View as" is read-only, enforced by the database.
--
-- A "View as" browser tab sends the header x-ampos-view-as on every database
-- request (src/lib/viewAs.ts). This makes the database run those requests
-- read-only, so nothing can be saved from a preview, even through functions.
-- Requests without the header are untouched.
--
-- LIVE CHANGE: the check below runs before EVERY database request from the app
-- (it only reads one header, so it's very cheap). The test in step 2 must pass
-- before it's switched on; if it fails, nothing is changed.
--
-- UNDO (if the app ever can't load data after this):
--   ALTER ROLE authenticator RESET pgrst.db_pre_request;
--   NOTIFY pgrst, 'reload config';

BEGIN;

-- 1. The check. Plain text match (no JSON parsing), so it can't error.
CREATE OR REPLACE FUNCTION common.view_as_pre_request() RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  IF coalesce(current_setting('request.headers', true), '') LIKE '%"x-ampos-view-as"%' THEN
    PERFORM pg_catalog.set_config('transaction_read_only', 'on', true);
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION common.view_as_pre_request() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION common.view_as_pre_request() TO anon, authenticated, service_role, authenticator;

-- 2. Test: with the header, a save must be refused; without it, nothing changes.
DO $$
BEGIN
  -- Without the header: still read-write.
  PERFORM common.view_as_pre_request();
  IF current_setting('transaction_read_only') <> 'off' THEN
    RAISE EXCEPTION 'View as test failed: normal requests became read-only';
  END IF;

  -- With the header: a save is refused.
  BEGIN
    PERFORM set_config('request.headers', '{"x-ampos-view-as":"neta_tech"}', true);
    PERFORM common.view_as_pre_request();
    UPDATE common.roles SET sort_order = sort_order WHERE false;
    RAISE EXCEPTION 'view_as_not_read_only';
  EXCEPTION
    WHEN read_only_sql_transaction THEN
      RAISE NOTICE 'View as test passed: saves are refused in a preview.';
  END;
END $$;

-- 3. Switch it on for the app's database requests.
ALTER ROLE authenticator SET pgrst.db_pre_request = 'common.view_as_pre_request';
NOTIFY pgrst, 'reload config';

COMMIT;

-- Check afterwards: the app loads normally for you (no View as tab open).
