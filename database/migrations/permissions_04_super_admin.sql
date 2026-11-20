-- ampOS Roles & Permissions, item 5: Super Admin is a role, not an email list.
--
-- LIVE CHANGE: common.is_superuser_email() stops reading the hardcoded list
-- (john.chambers, jack.lyons) and asks "is this person's role Super Admin?".
-- Super Admins after this: jack.lyons, brian, report-renderer (Jack, Nov 20).
-- John Chambers loses Super Admin powers (Jack OK'd, Nov 20).
--
-- Also:
--   * report-renderer is marked as a robot account.
--   * At least two PEOPLE (robots don't count) must stay Super Admin.
--   * The three Super Admins are pinned as picked roles, so a "role today"
--     change on the old screen can't quietly drop one.
--
-- All or nothing. Stops if any of the three accounts is missing.

BEGIN;

-- 1. Robot accounts -----------------------------------------------------------

CREATE TABLE common.service_accounts (
  user_id    uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  note       text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE common.service_accounts IS
  'Robot logins (e.g. the report renderer). Never count toward the two-Super-Admin minimum and get no role-change emails.';

ALTER TABLE common.service_accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY service_accounts_read ON common.service_accounts FOR SELECT TO authenticated
  USING ((SELECT common.can('admin.manage_roles')));
REVOKE ALL ON common.service_accounts FROM anon, authenticated;
GRANT SELECT ON common.service_accounts TO authenticated;
GRANT ALL ON common.service_accounts TO service_role;

INSERT INTO common.service_accounts (user_id, note)
SELECT id, 'Report renderer' FROM auth.users WHERE lower(email) = 'report-renderer@ampqes.com'
ON CONFLICT DO NOTHING;

-- 2. Pin the three Super Admins ----------------------------------------------

DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM auth.users
   WHERE lower(email) IN ('jack.lyons@ampqes.com', 'brian@ampqes.com', 'report-renderer@ampqes.com');
  IF n <> 3 THEN
    RAISE EXCEPTION 'Expected 3 Super Admin accounts, found %. Nothing was changed.', n;
  END IF;
END $$;

-- History first, so "from" is each person's role before the pin.
INSERT INTO common.access_changes (action, role_key, user_id, detail)
SELECT 'person_role', 'super_admin', id,
       jsonb_build_object('from', common.role_key_for(id), 'to', 'super_admin', 'note', 'item 5 setup')
  FROM auth.users
 WHERE lower(email) IN ('jack.lyons@ampqes.com', 'brian@ampqes.com', 'report-renderer@ampqes.com');

INSERT INTO common.user_roles (user_id, role_key, updated_at)
SELECT id, 'super_admin', now() FROM auth.users
 WHERE lower(email) IN ('jack.lyons@ampqes.com', 'brian@ampqes.com', 'report-renderer@ampqes.com')
ON CONFLICT (user_id) DO UPDATE SET role_key = 'super_admin', updated_at = now();

-- 3. At least two people stay Super Admin ------------------------------------

CREATE FUNCTION common.human_super_admin_count() RETURNS int
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT count(*)::int
  FROM auth.users u
  LEFT JOIN common.profiles p ON p.id = u.id
  WHERE common.role_key_for(u.id) = 'super_admin'
    AND NOT EXISTS (SELECT 1 FROM common.service_accounts s WHERE s.user_id = u.id)
    AND (u.banned_until IS NULL OR u.banned_until <= now())
    AND coalesce(p.is_active, true);
$$;

-- Active people (not robots) whose role is Super Admin. For role-change emails.
CREATE FUNCTION common.super_admin_emails() RETURNS text[]
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT coalesce(array_agg(u.email::text ORDER BY u.email), '{}')
  FROM auth.users u
  LEFT JOIN common.profiles p ON p.id = u.id
  WHERE common.role_key_for(u.id) = 'super_admin'
    AND NOT EXISTS (SELECT 1 FROM common.service_accounts s WHERE s.user_id = u.id)
    AND (u.banned_until IS NULL OR u.banned_until <= now())
    AND coalesce(p.is_active, true)
    AND u.email IS NOT NULL;
$$;

REVOKE ALL ON FUNCTION common.human_super_admin_count() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION common.super_admin_emails()      FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION common.human_super_admin_count() TO service_role;
GRANT EXECUTE ON FUNCTION common.super_admin_emails()      TO service_role;

CREATE FUNCTION common.guard_super_admins() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_was_super boolean;
BEGIN
  IF TG_OP IN ('UPDATE', 'DELETE') THEN
    v_was_super := OLD.role_key = 'super_admin';
  ELSE
    -- A new pick can also demote someone who was Super Admin through today's role.
    v_was_super := NEW.role_key <> 'super_admin' AND EXISTS (
      SELECT 1 FROM auth.users u, common.roles r
       WHERE u.id = NEW.user_id AND r.key = 'super_admin'
         AND u.raw_user_meta_data->>'role' = ANY (r.legacy_names));
  END IF;

  IF v_was_super AND common.human_super_admin_count() < 2 THEN
    RAISE EXCEPTION 'At least two people must stay Super Admin. Make someone else Super Admin first.';
  END IF;
  RETURN NULL;
END;
$$;

CREATE TRIGGER user_roles_keep_two_super_admins
AFTER INSERT OR UPDATE OR DELETE ON common.user_roles
FOR EACH ROW EXECUTE FUNCTION common.guard_super_admins();

-- 4. The switch: superuser = Super Admin role ---------------------------------

CREATE OR REPLACE FUNCTION common.is_superuser_email(p_email text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM auth.users u
     WHERE lower(u.email) = lower(coalesce(p_email, ''))
       AND common.role_key_for(u.id) = 'super_admin'
  );
$$;
COMMENT ON FUNCTION common.is_superuser_email(text) IS
  'True when this email''s account has the Super Admin role (common.user_roles, else today''s role). Replaced the hardcoded list Nov 20.';

COMMIT;

-- Check (expect 2, then jack, brian; then true, true, false):
--   SELECT common.human_super_admin_count();
--   SELECT common.super_admin_emails();
--   SELECT common.is_superuser_email('jack.lyons@ampqes.com'),
--          common.is_superuser_email('brian@ampqes.com'),
--          common.is_superuser_email('john.chambers@ampqes.com');
