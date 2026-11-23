-- ampOS Roles & Permissions, item 7 (part 3b): the name lookup needs a login.
--
-- common.get_user_metadata gave a person's name, email and role to anyone who knew
-- their id, without a login. Every screen that uses it (notes, comments, pictures,
-- profiles, org chart) is behind a login, so nothing in the app changes.

BEGIN;
SET LOCAL lock_timeout = '5s';
REVOKE ALL ON FUNCTION common.get_user_metadata(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION common.get_user_metadata(uuid) TO authenticated, service_role;
COMMIT;

-- Check (run after): expect false
--   select has_function_privilege('anon', 'common.get_user_metadata(uuid)', 'execute');
