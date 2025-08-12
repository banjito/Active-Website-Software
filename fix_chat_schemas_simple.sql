-- Simple fix for chat RPC function schemas
-- Run this in your Supabase SQL Editor

-- 1. Move get_user_metadata to common schema
DROP FUNCTION IF EXISTS get_user_metadata(UUID);
DROP FUNCTION IF EXISTS common.get_user_metadata(UUID);

CREATE OR REPLACE FUNCTION common.get_user_metadata(p_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_result JSONB;
BEGIN
  SELECT 
    jsonb_build_object(
      'id', u.id,
      'email', u.email,
      'name', u.raw_user_meta_data->'name',
      'full_name', u.raw_user_meta_data->'full_name',
      'username', u.raw_user_meta_data->'username',
      'profile_image', u.raw_user_meta_data->'profileImage',
      'avatar_url', u.raw_user_meta_data->'avatar_url',
      'role', u.raw_user_meta_data->'role'
    ) INTO v_result
  FROM auth.users u
  WHERE u.id = p_user_id;
  
  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION common.get_user_metadata(UUID) TO authenticated;

-- 2. Move admin functions to common schema
DROP FUNCTION IF EXISTS admin_get_custom_roles();
DROP FUNCTION IF EXISTS common.admin_get_custom_roles();

CREATE OR REPLACE FUNCTION common.admin_get_custom_roles()
RETURNS SETOF common.custom_roles
SECURITY DEFINER
SET search_path = common, neta_ops, business
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY SELECT * FROM common.custom_roles;
END;
$$;

GRANT EXECUTE ON FUNCTION common.admin_get_custom_roles TO authenticated;

-- 3. Move admin_update_role to common schema
DROP FUNCTION IF EXISTS admin_update_role(TEXT, JSONB);
DROP FUNCTION IF EXISTS common.admin_update_role(TEXT, JSONB);

CREATE OR REPLACE FUNCTION common.admin_update_role(role_name TEXT, role_config JSONB)
RETURNS BOOLEAN
SECURITY DEFINER
SET search_path = common, neta_ops, business
LANGUAGE plpgsql
AS $$
DECLARE
  v_prev_config JSONB;
  v_user_id UUID;
BEGIN
  SELECT auth.uid() INTO v_user_id;
  
  SELECT config INTO v_prev_config
  FROM common.custom_roles
  WHERE name = role_name;
  
  INSERT INTO common.custom_roles (name, config, created_by)
  VALUES (role_name, role_config, v_user_id)
  ON CONFLICT (name) 
  DO UPDATE SET 
    config = role_config,
    updated_at = NOW();
  
  RETURN TRUE;
END;
$$;

GRANT EXECUTE ON FUNCTION common.admin_update_role TO authenticated;

-- 4. Move admin_delete_role to common schema
DROP FUNCTION IF EXISTS admin_delete_role(TEXT);
DROP FUNCTION IF EXISTS common.admin_delete_role(TEXT);

CREATE OR REPLACE FUNCTION common.admin_delete_role(role_name TEXT)
RETURNS BOOLEAN
SECURITY DEFINER
SET search_path = common, neta_ops, business
LANGUAGE plpgsql
AS $$
BEGIN
  DELETE FROM common.custom_roles WHERE name = role_name;
  RETURN TRUE;
END;
$$;

GRANT EXECUTE ON FUNCTION common.admin_delete_role TO authenticated;

-- 5. Temporarily modify get_user_chat_rooms to show all chat rooms for everyone
DROP FUNCTION IF EXISTS common.get_user_chat_rooms();

CREATE OR REPLACE FUNCTION common.get_user_chat_rooms()
RETURNS TABLE (
  id UUID,
  name TEXT,
  description TEXT,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ,
  unread_count BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Return all chat rooms with unread count of 0 for now
  RETURN QUERY 
  SELECT 
    cr.id,
    cr.name,
    cr.description,
    cr.created_at,
    cr.updated_at,
    0::BIGINT as unread_count
  FROM common.chat_rooms cr
  ORDER BY cr.name;
END;
$$;

GRANT EXECUTE ON FUNCTION common.get_user_chat_rooms TO authenticated; 