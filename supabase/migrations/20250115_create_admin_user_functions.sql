-- Create admin user management functions in common schema
-- This fixes the "failed to load users" issue in the admin portal

-- 1. Create admin_get_users function in common schema
DROP FUNCTION IF EXISTS common.admin_get_users();

CREATE OR REPLACE FUNCTION common.admin_get_users()
RETURNS SETOF auth.users
SECURITY DEFINER
SET search_path = common, auth
LANGUAGE plpgsql
AS $$
DECLARE
  current_user_role TEXT;
BEGIN
  -- Get the current user's role from their user metadata in the database
  SELECT (raw_user_meta_data ->> 'role')::text INTO current_user_role
  FROM auth.users 
  WHERE id = auth.uid();
  
  -- Only allow admin users to call this function
  IF current_user_role != 'Admin' THEN
    RAISE EXCEPTION 'Access denied. Admin role required. Current role: %', COALESCE(current_user_role, 'No role');
  END IF;
  
  RETURN QUERY SELECT * FROM auth.users ORDER BY created_at DESC;
END;
$$;

-- 2. Create admin_update_user_role function in common schema
DROP FUNCTION IF EXISTS common.admin_update_user_role(UUID, TEXT);

CREATE OR REPLACE FUNCTION common.admin_update_user_role(user_id UUID, new_role TEXT)
RETURNS void
SECURITY DEFINER
SET search_path = common, auth
LANGUAGE plpgsql
AS $$
DECLARE
  current_user_role TEXT;
BEGIN
  -- Get the current user's role from their user metadata in the database
  SELECT (raw_user_meta_data ->> 'role')::text INTO current_user_role
  FROM auth.users 
  WHERE id = auth.uid();
  
  -- Only allow admin users to call this function
  IF current_user_role != 'Admin' THEN
    RAISE EXCEPTION 'Access denied. Admin role required. Current role: %', COALESCE(current_user_role, 'No role');
  END IF;
  
  UPDATE auth.users
  SET raw_user_meta_data = 
    COALESCE(raw_user_meta_data, '{}'::jsonb) || 
    jsonb_build_object('role', new_role)
  WHERE id = user_id;
END;
$$;

-- 3. Create make_user_admin function in common schema (for initial setup)
DROP FUNCTION IF EXISTS common.make_user_admin(TEXT);

CREATE OR REPLACE FUNCTION common.make_user_admin(target_email TEXT)
RETURNS void
SECURITY DEFINER
SET search_path = common, auth
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE auth.users
  SET raw_user_meta_data = 
    COALESCE(raw_user_meta_data, '{}'::jsonb) || 
    jsonb_build_object('role', 'Admin')
  WHERE email = target_email;
END;
$$;

-- Grant execute permissions to authenticated users
GRANT EXECUTE ON FUNCTION common.admin_get_users TO authenticated;
GRANT EXECUTE ON FUNCTION common.admin_update_user_role TO authenticated;
GRANT EXECUTE ON FUNCTION common.make_user_admin TO authenticated; 