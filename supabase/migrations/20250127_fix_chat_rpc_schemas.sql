-- Fix chat RPC function schemas
-- Move get_user_metadata to common schema and ensure all chat functions are properly located

-- Drop the existing get_user_metadata function if it exists in the default schema
DROP FUNCTION IF EXISTS get_user_metadata(UUID);
DROP FUNCTION IF EXISTS common.get_user_metadata(UUID);

-- Create get_user_metadata in the common schema
CREATE OR REPLACE FUNCTION common.get_user_metadata(p_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER -- Run with the privileges of the function creator
AS $$
DECLARE
  v_result JSONB;
BEGIN
  -- Get the user data from auth.users
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

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION common.get_user_metadata(UUID) TO authenticated;

-- Ensure mark_room_messages_read is in the common schema
-- Drop existing function first to handle return type changes
DROP FUNCTION IF EXISTS common.mark_room_messages_read(UUID);
DROP FUNCTION IF EXISTS mark_room_messages_read(UUID);

CREATE OR REPLACE FUNCTION common.mark_room_messages_read(p_room_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Update all unread messages in the room to read for the current user
  UPDATE common.chat_messages 
  SET read_at = NOW() 
  WHERE room_id = p_room_id 
    AND user_id != auth.uid() 
    AND read_at IS NULL;
  
  RETURN TRUE;
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION common.mark_room_messages_read(UUID) TO authenticated;

-- Ensure admin role functions are in the common schema
-- Move admin_get_custom_roles to common schema if it's not already there
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

-- Move admin_update_role to common schema if it's not already there
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
  v_ip TEXT;
  v_user_agent TEXT;
BEGIN
  -- Get the current user ID
  SELECT auth.uid() INTO v_user_id;
  
  -- Get IP and user agent from request headers (if available)
  v_ip := coalesce(current_setting('request.headers', true)::json->>'x-forwarded-for', 'unknown');
  v_user_agent := coalesce(current_setting('request.headers', true)::json->>'user-agent', 'unknown');
  
  -- Get previous config if exists
  SELECT config INTO v_prev_config
  FROM common.custom_roles
  WHERE name = role_name;
  
  -- Insert or update the role
  INSERT INTO common.custom_roles (name, config, created_by)
  VALUES (role_name, role_config, v_user_id)
  ON CONFLICT (name) 
  DO UPDATE SET 
    config = role_config,
    updated_at = NOW();
  
  -- Log the change
  INSERT INTO common.role_audit_logs
    (role_name, action, previous_config, new_config, user_id, ip_address, user_agent)
  VALUES
    (role_name, 
     CASE WHEN v_prev_config IS NULL THEN 'create' ELSE 'update' END,
     v_prev_config,
     role_config,
     v_user_id,
     v_ip,
     v_user_agent);
  
  RETURN TRUE;
END;
$$;

-- Move admin_delete_role to common schema if it's not already there
DROP FUNCTION IF EXISTS admin_delete_role(TEXT);
DROP FUNCTION IF EXISTS common.admin_delete_role(TEXT);

CREATE OR REPLACE FUNCTION common.admin_delete_role(role_name TEXT)
RETURNS BOOLEAN
SECURITY DEFINER
SET search_path = common, neta_ops, business
LANGUAGE plpgsql
AS $$
DECLARE
  v_prev_config JSONB;
  v_user_id UUID;
  v_ip TEXT;
  v_user_agent TEXT;
BEGIN
  -- Get the current user ID
  SELECT auth.uid() INTO v_user_id;
  
  -- Get IP and user agent from request headers (if available)
  v_ip := coalesce(current_setting('request.headers', true)::json->>'x-forwarded-for', 'unknown');
  v_user_agent := coalesce(current_setting('request.headers', true)::json->>'user-agent', 'unknown');
  
  -- Get previous config for audit log
  SELECT config INTO v_prev_config
  FROM common.custom_roles
  WHERE name = role_name;
  
  -- If role doesn't exist, return false
  IF v_prev_config IS NULL THEN
    RETURN FALSE;
  END IF;
  
  -- Delete the role
  DELETE FROM common.custom_roles
  WHERE name = role_name;
  
  -- Log the deletion
  INSERT INTO common.role_audit_logs
    (role_name, action, previous_config, user_id, ip_address, user_agent)
  VALUES
    (role_name, 'delete', v_prev_config, v_user_id, v_ip, v_user_agent);
  
  RETURN TRUE;
END;
$$;

-- Grant execute permissions for admin functions
GRANT EXECUTE ON FUNCTION common.admin_get_custom_roles TO authenticated;
GRANT EXECUTE ON FUNCTION common.admin_update_role TO authenticated;
GRANT EXECUTE ON FUNCTION common.admin_delete_role TO authenticated;

-- Add comments for documentation
COMMENT ON FUNCTION common.get_user_metadata IS 'Gets user metadata from auth.users for a specific user ID';
COMMENT ON FUNCTION common.mark_room_messages_read IS 'Marks all messages in a room as read for the current user';
COMMENT ON FUNCTION common.admin_get_custom_roles IS 'Gets all custom roles (admin only)';
COMMENT ON FUNCTION common.admin_update_role IS 'Updates or creates a custom role (admin only)';
COMMENT ON FUNCTION common.admin_delete_role IS 'Deletes a custom role (admin only)'; 