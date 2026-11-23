-- ampOS Roles & Permissions: delete the Ops Manager role (Jack, Nov 23).
--
-- Nobody is on it. Its ticks go with it; they're written into History (access_changes)
-- first, so the role could be rebuilt from there. Stops if anyone is on the role.

BEGIN;
SET LOCAL lock_timeout = '5s';

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM common.user_roles WHERE role_key = 'ops_manager')
     OR EXISTS (SELECT 1 FROM auth.users u
                 WHERE common.role_key_for(u.id) = 'ops_manager'
                   AND u.deleted_at IS NULL
                   AND (u.banned_until IS NULL OR u.banned_until <= now()))
  THEN
    RAISE EXCEPTION 'Stopped: someone is still on Ops Manager. Move them first.';
  END IF;
END $$;

INSERT INTO common.access_changes (changed_by, action, role_key, detail)
SELECT NULL, 'role_deleted', r.key,
       jsonb_build_object(
         'label', r.label,
         'ticks', (SELECT coalesce(jsonb_agg(rp.permission_key ORDER BY rp.permission_key), '[]'::jsonb)
                     FROM common.role_permissions rp WHERE rp.role_key = r.key))
  FROM common.roles r
 WHERE r.key = 'ops_manager';

DELETE FROM common.roles WHERE key = 'ops_manager';   -- its ticks go with it

COMMIT;

-- Check (run after): expect 0
--   select count(*) from common.roles where key = 'ops_manager';
