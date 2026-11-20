-- ampOS Roles & Permissions, item 3: the Roles & permissions screen.
-- Functions the new screen calls to read people and save changes, plus a change history.
-- Every save checks common.can('admin.manage_roles') and writes a history row.
--
-- Safe while nothing else calls common.can(): picking someone's new role or ticking a
-- box is stored, but today's access (user_metadata.role) is untouched. It takes effect
-- area by area as ampOS switches over (item 7).
--
-- Rules the functions enforce:
--   * Nobody changes their own role or own extras (Super Admin excepted).
--   * Only Super Admin gives, takes away, or edits Super Admin, or ticks admin.make_super_admin.
--   * Nobody removes "Change roles and permissions" from their own role.
--   * Built-in roles can't be deleted; copies can, once nobody is on them.
--
-- History goes in a new table, not common.role_audit_logs: that one lets any signed-in
-- user insert and delete rows, so it can't be trusted as a record.

BEGIN;

-- 1. History ---------------------------------------------------------------

CREATE TABLE common.access_changes (
  id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  changed_at     timestamptz NOT NULL DEFAULT now(),
  changed_by     uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  action         text NOT NULL CHECK (action IN
                   ('person_role', 'role_ticks', 'person_extra', 'role_copied', 'role_deleted')),
  role_key       text,
  user_id        uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  permission_key text,
  detail         jsonb NOT NULL DEFAULT '{}'
);
CREATE INDEX access_changes_changed_at_idx ON common.access_changes (changed_at DESC);

ALTER TABLE common.access_changes ENABLE ROW LEVEL SECURITY;
CREATE POLICY access_changes_read ON common.access_changes FOR SELECT TO authenticated
  USING ((SELECT common.can('admin.manage_roles')));
REVOKE ALL ON common.access_changes FROM anon, authenticated;
GRANT SELECT ON common.access_changes TO authenticated;
GRANT ALL ON common.access_changes TO service_role;

-- 2. Helpers ---------------------------------------------------------------

-- Any person's effective role: their picked new role, else mapped from today's role.
CREATE FUNCTION common.role_key_for(p_user uuid) RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT coalesce(
    (SELECT ur.role_key FROM common.user_roles ur WHERE ur.user_id = p_user),
    (SELECT r.key FROM common.roles r
      WHERE (SELECT u.raw_user_meta_data->>'role' FROM auth.users u WHERE u.id = p_user)
            = ANY (r.legacy_names)
      ORDER BY r.sort_order LIMIT 1)
  );
$$;
REVOKE ALL ON FUNCTION common.role_key_for(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION common.role_key_for(uuid) TO service_role;

CREATE FUNCTION common.require_manage_roles() RETURNS void
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  IF NOT common.can('admin.manage_roles') THEN
    RAISE EXCEPTION 'You don''t have permission to change roles.' USING ERRCODE = '42501';
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION common.require_manage_roles() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION common.require_manage_roles() TO service_role;

-- 3. Read: everyone, with today's role and new role --------------------------

CREATE FUNCTION common.roles_people()
RETURNS TABLE (
  id uuid, email text, name text, today_role text,
  new_role text, new_role_picked boolean, is_active boolean, last_sign_in_at timestamptz
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  PERFORM common.require_manage_roles();
  RETURN QUERY
  SELECT u.id,
         u.email::text,
         coalesce(nullif(p.full_name, ''), nullif(u.raw_user_meta_data->>'name', ''),
                  split_part(u.email::text, '@', 1)),
         nullif(u.raw_user_meta_data->>'role', ''),
         coalesce(ur.role_key,
                  (SELECT r.key FROM common.roles r
                    WHERE u.raw_user_meta_data->>'role' = ANY (r.legacy_names)
                    ORDER BY r.sort_order LIMIT 1)),
         ur.user_id IS NOT NULL,
         CASE WHEN u.banned_until IS NOT NULL AND u.banned_until > now() THEN false
              ELSE coalesce(p.is_active, true) END,
         u.last_sign_in_at
  FROM auth.users u
  LEFT JOIN common.profiles p ON p.id = u.id
  LEFT JOIN common.user_roles ur ON ur.user_id = u.id
  ORDER BY 3;
END;
$$;

-- 4. Write: set new role for one or many people -------------------------------
-- p_role NULL = clear the pick, so the new role follows today's role again.

CREATE FUNCTION common.set_people_role(p_user_ids uuid[], p_role text)
RETURNS int
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_me uuid := auth.uid();
  v_super boolean := common.can('admin.make_super_admin');
  v_uid uuid;
  v_from text;
  v_count int := 0;
BEGIN
  PERFORM common.require_manage_roles();
  IF p_user_ids IS NULL OR cardinality(p_user_ids) = 0 THEN RETURN 0; END IF;
  IF p_role IS NOT NULL AND NOT EXISTS (SELECT 1 FROM common.roles WHERE key = p_role) THEN
    RAISE EXCEPTION 'That role doesn''t exist.';
  END IF;
  IF NOT v_super AND v_me = ANY (p_user_ids) THEN
    RAISE EXCEPTION 'You can''t change your own role. Ask a Super Admin.';
  END IF;
  IF NOT v_super AND p_role = 'super_admin' THEN
    RAISE EXCEPTION 'Only a Super Admin can make someone a Super Admin.';
  END IF;

  FOREACH v_uid IN ARRAY p_user_ids LOOP
    v_from := common.role_key_for(v_uid);
    IF NOT v_super AND v_from = 'super_admin' THEN
      RAISE EXCEPTION 'Only a Super Admin can change a Super Admin''s role.';
    END IF;
    IF p_role IS NULL THEN
      DELETE FROM common.user_roles WHERE user_id = v_uid;
    ELSE
      INSERT INTO common.user_roles (user_id, role_key, updated_at, updated_by)
      VALUES (v_uid, p_role, now(), v_me)
      ON CONFLICT (user_id) DO UPDATE
        SET role_key = excluded.role_key, updated_at = now(), updated_by = v_me;
    END IF;
    INSERT INTO common.access_changes (changed_by, action, role_key, user_id, detail)
    VALUES (v_me, 'person_role', p_role, v_uid,
            jsonb_build_object('from', v_from, 'to', coalesce(p_role, common.role_key_for(v_uid)),
                               'cleared', p_role IS NULL));
    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END;
$$;

-- 5. Write: role ticks, many at once -----------------------------------------
-- p_changes: [{"role": "project_manager", "permission": "billing.edit_sov", "on": true}, ...]

CREATE FUNCTION common.save_role_ticks(p_changes jsonb)
RETURNS int
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_me uuid := auth.uid();
  v_super boolean := common.can('admin.make_super_admin');
  v_my_role text := common.my_role_key();
  c jsonb;
  v_role text;
  v_perm text;
  v_on boolean;
  v_count int := 0;
BEGIN
  PERFORM common.require_manage_roles();
  IF p_changes IS NULL OR jsonb_typeof(p_changes) <> 'array' THEN RETURN 0; END IF;

  FOR c IN SELECT * FROM jsonb_array_elements(p_changes) LOOP
    v_role := c->>'role';
    v_perm := c->>'permission';
    v_on := (c->>'on')::boolean;
    IF v_role IS NULL OR v_perm IS NULL OR v_on IS NULL THEN
      RAISE EXCEPTION 'Bad change: %', c;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM common.roles WHERE key = v_role) THEN
      RAISE EXCEPTION 'Role % doesn''t exist.', v_role;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM common.permissions WHERE key = v_perm) THEN
      RAISE EXCEPTION 'Permission % doesn''t exist.', v_perm;
    END IF;
    IF v_role = 'super_admin' THEN
      RAISE EXCEPTION 'Super Admin always has everything.';
    END IF;
    IF NOT v_super AND v_perm = 'admin.make_super_admin' THEN
      RAISE EXCEPTION 'Only a Super Admin can give out "Make someone a Super Admin".';
    END IF;
    IF NOT v_super AND v_perm = 'admin.manage_roles' AND v_role = v_my_role AND NOT v_on THEN
      RAISE EXCEPTION 'You can''t remove "Change roles and permissions" from your own role.';
    END IF;

    IF v_on THEN
      INSERT INTO common.role_permissions (role_key, permission_key)
      VALUES (v_role, v_perm) ON CONFLICT DO NOTHING;
    ELSE
      DELETE FROM common.role_permissions WHERE role_key = v_role AND permission_key = v_perm;
    END IF;
    IF FOUND THEN
      INSERT INTO common.access_changes (changed_by, action, role_key, permission_key, detail)
      VALUES (v_me, 'role_ticks', v_role, v_perm, jsonb_build_object('on', v_on));
      v_count := v_count + 1;
    END IF;
  END LOOP;
  RETURN v_count;
END;
$$;

-- 6. Write: per-person extra -------------------------------------------------
-- p_granted true = add for this person, false = take away, NULL = back to the role's tick.

CREATE FUNCTION common.set_person_extra(p_user uuid, p_permission text, p_granted boolean)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_me uuid := auth.uid();
  v_super boolean := common.can('admin.make_super_admin');
BEGIN
  PERFORM common.require_manage_roles();
  IF NOT EXISTS (SELECT 1 FROM common.permissions WHERE key = p_permission) THEN
    RAISE EXCEPTION 'Permission % doesn''t exist.', p_permission;
  END IF;
  IF NOT v_super AND p_user = v_me THEN
    RAISE EXCEPTION 'You can''t change your own permissions. Ask a Super Admin.';
  END IF;
  IF NOT v_super AND (p_permission = 'admin.make_super_admin'
                      OR common.role_key_for(p_user) = 'super_admin') THEN
    RAISE EXCEPTION 'Only a Super Admin can do that.';
  END IF;

  IF p_granted IS NULL THEN
    DELETE FROM common.user_permission_overrides
     WHERE user_id = p_user AND permission_key = p_permission;
  ELSE
    INSERT INTO common.user_permission_overrides (user_id, permission_key, granted, created_by)
    VALUES (p_user, p_permission, p_granted, v_me)
    ON CONFLICT (user_id, permission_key) DO UPDATE
      SET granted = excluded.granted, created_at = now(), created_by = v_me;
  END IF;

  INSERT INTO common.access_changes (changed_by, action, user_id, permission_key, detail)
  VALUES (v_me, 'person_extra', p_user, p_permission, jsonb_build_object('granted', p_granted));
END;
$$;

-- 7. Write: copy a role, delete a copy ----------------------------------------

CREATE FUNCTION common.copy_role(p_from text, p_label text)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_me uuid := auth.uid();
  v_label text := btrim(p_label);
  v_base text;
  v_key text;
  v_n int := 1;
BEGIN
  PERFORM common.require_manage_roles();
  IF p_from = 'super_admin' OR NOT EXISTS (SELECT 1 FROM common.roles WHERE key = p_from) THEN
    RAISE EXCEPTION 'Pick a role to copy (not Super Admin).';
  END IF;
  IF v_label IS NULL OR v_label = '' THEN
    RAISE EXCEPTION 'Give the new role a name.';
  END IF;
  IF EXISTS (SELECT 1 FROM common.roles WHERE lower(label) = lower(v_label)) THEN
    RAISE EXCEPTION 'A role called "%" already exists.', v_label;
  END IF;

  v_base := trim(both '_' from regexp_replace(lower(v_label), '[^a-z]+', '_', 'g'));
  IF v_base = '' THEN v_base := 'role'; END IF;
  v_key := v_base;
  WHILE EXISTS (SELECT 1 FROM common.roles WHERE key = v_key) LOOP
    v_n := v_n + 1;
    v_key := v_base || '_' || v_n;
  END LOOP;

  INSERT INTO common.roles (key, label, is_system, copied_from, sort_order)
  VALUES (v_key, v_label, false, p_from,
          (SELECT coalesce(max(sort_order), 0) + 10 FROM common.roles));
  INSERT INTO common.role_permissions (role_key, permission_key)
  SELECT v_key, rp.permission_key FROM common.role_permissions rp
   WHERE rp.role_key = p_from AND rp.permission_key <> 'admin.make_super_admin';

  INSERT INTO common.access_changes (changed_by, action, role_key, detail)
  VALUES (v_me, 'role_copied', v_key, jsonb_build_object('from', p_from, 'label', v_label));
  RETURN v_key;
END;
$$;

CREATE FUNCTION common.delete_role(p_key text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_label text;
BEGIN
  PERFORM common.require_manage_roles();
  SELECT label INTO v_label FROM common.roles WHERE key = p_key AND NOT is_system;
  IF v_label IS NULL THEN
    RAISE EXCEPTION 'Only copied roles can be deleted.';
  END IF;
  IF EXISTS (SELECT 1 FROM common.user_roles WHERE role_key = p_key) THEN
    RAISE EXCEPTION 'Move everyone off "%" first.', v_label;
  END IF;
  DELETE FROM common.roles WHERE key = p_key;
  INSERT INTO common.access_changes (changed_by, action, role_key, detail)
  VALUES (auth.uid(), 'role_deleted', p_key, jsonb_build_object('label', v_label));
END;
$$;

-- 8. Grants ------------------------------------------------------------------

REVOKE ALL ON FUNCTION common.roles_people()                     FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION common.set_people_role(uuid[], text)       FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION common.save_role_ticks(jsonb)              FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION common.set_person_extra(uuid, text, boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION common.copy_role(text, text)               FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION common.delete_role(text)                   FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION common.roles_people()                     TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION common.set_people_role(uuid[], text)       TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION common.save_role_ticks(jsonb)              TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION common.set_person_extra(uuid, text, boolean) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION common.copy_role(text, text)               TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION common.delete_role(text)                   TO authenticated, service_role;

COMMIT;
