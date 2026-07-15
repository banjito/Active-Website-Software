-- Custom helper functions that live in the `extensions` schema.
-- Run BEFORE 02_schema.sql: triggers there reference these functions.
-- check_function_bodies off: bodies reference tables created later in 02.
SET check_function_bodies = false;

CREATE OR REPLACE FUNCTION extensions.admin_delete_role(role_name text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
    RETURN true;
END;
$function$
;

CREATE OR REPLACE FUNCTION extensions.admin_get_custom_roles()
 RETURNS TABLE(id uuid, name text, config jsonb, created_at timestamp with time zone, updated_at timestamp with time zone, created_by text)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
    -- Return empty result to prevent 406 errors
    RETURN QUERY
    SELECT 
        NULL::UUID as id,
        NULL::TEXT as name,
        NULL::JSONB as config,
        NULL::TIMESTAMPTZ as created_at,
        NULL::TIMESTAMPTZ as updated_at,
        NULL::TEXT as created_by
    WHERE false;
END;
$function$
;

CREATE OR REPLACE FUNCTION extensions.admin_get_users()
 RETURNS SETOF auth.users
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY SELECT * FROM auth.users;
END;
$function$
;

CREATE OR REPLACE FUNCTION extensions.admin_update_role(role_name text, role_config jsonb)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
    RETURN true;
END;
$function$
;

CREATE OR REPLACE FUNCTION extensions.admin_update_user_role(user_id uuid, new_role text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  UPDATE auth.users
  SET raw_user_meta_data = 
    COALESCE(raw_user_meta_data, '{}'::jsonb) || 
    jsonb_build_object('role', new_role)
  WHERE id = user_id;
END;
$function$
;

CREATE OR REPLACE FUNCTION extensions.assign_lab_customer_role(user_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  -- Update the user's metadata to include the Lab Customer role
  UPDATE auth.users
  SET raw_user_meta_data = 
    COALESCE(raw_user_meta_data, '{}'::jsonb) || 
    jsonb_build_object('role', 'Lab Customer')
  WHERE id = user_id;
  
  -- Return true if the update was successful
  RETURN FOUND;
END;
$function$
;

CREATE OR REPLACE FUNCTION extensions.award_ppe_testing_xp(p_user_id uuid, p_task_type text, p_report_id uuid, p_report_type text, p_job_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    xp_amount INTEGER;
    task_description TEXT;
    existing_entry_count INTEGER;
BEGIN
    -- Check if XP has already been awarded for this specific report
    SELECT COUNT(*) INTO existing_entry_count
    FROM xp_entries
    WHERE user_id = p_user_id 
    AND report_id = p_report_id 
    AND report_type = p_report_type;
    
    -- If XP already awarded for this report, don't award again
    IF existing_entry_count > 0 THEN
        RETURN FALSE;
    END IF;
    
    -- Determine XP amount and description based on task type
    CASE p_task_type
        WHEN 'blanket' THEN
            xp_amount := 1;
            task_description := 'Insulated Blanket Testing';
        WHEN 'glove' THEN
            xp_amount := 1;
            task_description := 'Insulated Glove Testing';
        WHEN 'sleeve' THEN
            xp_amount := 1;
            task_description := 'Insulated Sleeve Testing';
        WHEN 'line_hose' THEN
            xp_amount := 1;
            task_description := 'Line Hose Testing';
        WHEN 'grounding_cable' THEN
            xp_amount := 3;
            task_description := 'Grounding Cable Testing';
        WHEN 'hotstick' THEN
            xp_amount := 5;
            task_description := 'Hotstick Testing';
        WHEN 'bucket_truck' THEN
            xp_amount := 15;
            task_description := 'Bucket Truck Testing';
        WHEN 'digger_derrick' THEN
            xp_amount := 15;
            task_description := 'Digger Derrick Testing';
        ELSE
            -- Unknown task type, no XP awarded
            RETURN FALSE;
    END CASE;
    
    -- Insert XP entry
    INSERT INTO xp_entries (
        user_id,
        xp_amount,
        task_type,
        task_description,
        report_id,
        report_type,
        job_id,
        created_by
    ) VALUES (
        p_user_id,
        xp_amount,
        p_task_type,
        task_description,
        p_report_id,
        p_report_type,
        p_job_id,
        p_user_id
    );
    
    -- Update or insert user's total XP
    INSERT INTO user_xp (user_id, total_xp)
    VALUES (p_user_id, xp_amount)
    ON CONFLICT (user_id)
    DO UPDATE SET
        total_xp = user_xp.total_xp + xp_amount,
        updated_at = NOW();
    
    -- Update tier and level based on new total XP
    UPDATE user_xp
    SET (tier, level) = (
        SELECT tier, level 
        FROM calculate_tier_and_level(total_xp)
        LIMIT 1
    )
    WHERE user_id = p_user_id;
    
    RETURN TRUE;
END;
$function$
;

CREATE OR REPLACE FUNCTION extensions.calculate_tier_and_level(total_xp integer)
 RETURNS TABLE(tier integer, level integer, progress numeric)
 LANGUAGE plpgsql
AS $function$
DECLARE
    cumulative_xp INTEGER := 0;
    level_xp INTEGER;
    current_tier INTEGER := 1;
    current_level INTEGER := 1;
    base_xp CONSTANT INTEGER := 750;
    multiplier CONSTANT NUMERIC := 1.05;
BEGIN
    -- Loop through tiers and levels
    FOR tier_num IN 1..5 LOOP
        FOR level_num IN 1..10 LOOP
            -- Calculate XP required for this level using exponential formula
            level_xp := FLOOR(base_xp * POW(multiplier, (tier_num - 1) * 10 + level_num - 1));
            cumulative_xp := cumulative_xp + level_xp;
            
            IF total_xp < cumulative_xp THEN
                -- Calculate progress within the current level
                DECLARE
                    xp_into_level INTEGER := total_xp - (cumulative_xp - level_xp);
                    progress_pct NUMERIC := LEAST((xp_into_level::NUMERIC / level_xp::NUMERIC) * 100, 100);
                BEGIN
                    tier := tier_num;
                    level := level_num;
                    progress := progress_pct;
                    RETURN NEXT;
                    RETURN;
                END;
            END IF;
        END LOOP;
    END LOOP;
    
    -- If we get here, user has max XP
    tier := 5;
    level := 10;
    progress := 100;
    RETURN NEXT;
    RETURN;
END;
$function$
;

CREATE OR REPLACE FUNCTION extensions.cleanup_old_messages()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  -- Delete messages older than 24 hours
  DELETE FROM chat_messages
  WHERE created_at < NOW() - INTERVAL '24 hours';
END;
$function$
;

CREATE OR REPLACE FUNCTION extensions.create_job_notification(p_job_id uuid, p_user_id uuid, p_title text, p_message text, p_type text, p_metadata jsonb DEFAULT '{}'::jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO 'neta_ops', 'common'
AS $function$
DECLARE
  v_notification_id UUID;
BEGIN
  INSERT INTO neta_ops.job_notifications(
    job_id,
    user_id,
    title,
    message,
    type,
    metadata,
    is_read,
    is_dismissed,
    created_at,
    updated_at
  )
  VALUES (
    p_job_id,
    p_user_id,
    p_title,
    p_message,
    p_type,
    p_metadata,
    FALSE,
    FALSE,
    NOW(),
    NOW()
  )
  RETURNING id INTO v_notification_id;
  
  -- Here we could add webhook calls or other notifications
  -- like sending emails if user preferences indicate that
  
  RETURN v_notification_id;
END;
$function$
;

CREATE OR REPLACE FUNCTION extensions.create_lab_job_with_customer_check(job_data jsonb)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    customer_id_value UUID;
    customer_exists BOOLEAN;
    job_result RECORD;
    result_json JSON;
BEGIN
    -- Extract customer_id from the job_data
    customer_id_value := (job_data->>'customer_id')::UUID;
    
    -- Check if customer exists in lab_customers
    SELECT EXISTS(
        SELECT 1 FROM lab_ops.lab_customers 
        WHERE id = customer_id_value
    ) INTO customer_exists;
    
    -- If customer doesn't exist, try to find in common.customers and copy
    IF NOT customer_exists THEN
        INSERT INTO lab_ops.lab_customers (id, name, company_name, address, phone, email, status, created_at, updated_at)
        SELECT id, name, company_name, address, phone, email, 
               COALESCE(status, 'active'), created_at, updated_at
        FROM common.customers 
        WHERE id = customer_id_value
        ON CONFLICT (id) DO NOTHING;
        
        -- If still no customer found, create a minimal one
        INSERT INTO lab_ops.lab_customers (id, name, company_name, status)
        VALUES (customer_id_value, 'Auto-created Customer', 'Unknown Company', 'active')
        ON CONFLICT (id) DO NOTHING;
    END IF;
    
    -- Now create the job
    INSERT INTO lab_ops.lab_jobs (
        customer_id, title, description, status, start_date, due_date, 
        budget, notes, priority, division
    ) VALUES (
        customer_id_value,
        job_data->>'title',
        job_data->>'description',
        COALESCE(job_data->>'status', 'pending'),
        (job_data->>'start_date')::DATE,
        (job_data->>'due_date')::DATE,
        (job_data->>'budget')::DECIMAL,
        job_data->>'notes',
        COALESCE(job_data->>'priority', 'medium'),
        job_data->>'division'
    ) RETURNING * INTO job_result;
    
    -- Convert the result to JSON
    result_json := to_json(job_result);
    
    RETURN result_json;
    
EXCEPTION
    WHEN OTHERS THEN
        -- Return error information
        RETURN json_build_object(
            'error', TRUE,
            'code', SQLSTATE,
            'message', SQLERRM
        );
END;
$function$
;

CREATE OR REPLACE FUNCTION extensions.create_message_retention_policy(p_retention_hours integer)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  -- Create a policy to automatically delete messages older than the specified hours
  EXECUTE format('
    CREATE POLICY delete_old_messages ON chat_messages
    FOR DELETE
    USING (created_at < NOW() - INTERVAL ''%s hours'')
  ', p_retention_hours);
END;
$function$
;

CREATE OR REPLACE FUNCTION extensions.delete_user_with_dependencies(user_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  -- Delete related records from user_room_status
  DELETE FROM user_room_status WHERE user_id = delete_user_with_dependencies.user_id;
  
  -- Delete the user
  DELETE FROM auth.users WHERE id = delete_user_with_dependencies.user_id;
END;
$function$
;

CREATE OR REPLACE FUNCTION extensions.get_current_user_role()
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
    RETURN 'user';
END;
$function$
;

CREATE OR REPLACE FUNCTION extensions.get_database_statistics()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  total_size_bytes BIGINT;
  total_rows BIGINT;
  table_count INTEGER;
  function_count INTEGER;
BEGIN
  -- Calculate total database size (approximate)
  SELECT SUM(pg_total_relation_size(quote_ident(schemaname) || '.' || quote_ident(tablename)))::BIGINT
  INTO total_size_bytes
  FROM pg_tables
  WHERE schemaname IN ('public', 'neta_ops', 'business', 'common'); -- Add schemas as needed

  -- Count total rows (estimate, can be slow on large DBs)
  -- Consider alternative methods or periodic updates for large databases
  SELECT SUM(n_live_tup)::BIGINT
  INTO total_rows
  FROM pg_stat_user_tables
  WHERE schemaname IN ('public', 'neta_ops', 'business', 'common');

  -- Count tables
  SELECT COUNT(*)::INTEGER
  INTO table_count
  FROM information_schema.tables
  WHERE table_schema IN ('public', 'neta_ops', 'business', 'common');

  -- Count functions (excluding internal pg_* functions)
  SELECT COUNT(*)::INTEGER
  INTO function_count
  FROM information_schema.routines
  WHERE specific_schema NOT IN ('pg_catalog', 'information_schema');

  RETURN jsonb_build_object(
    'total_size_bytes', COALESCE(total_size_bytes, 0),
    'total_rows_estimate', COALESCE(total_rows, 0),
    'table_count', COALESCE(table_count, 0),
    'function_count', COALESCE(function_count, 0)
  );
END;
$function$
;

CREATE OR REPLACE FUNCTION extensions.get_table_columns(p_schema text, p_table_name text)
 RETURNS TABLE(column_name text, data_type text)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
begin
  return query
  select c.column_name, c.data_type
  from information_schema.columns c
  where c.table_schema = p_schema
    and c.table_name = p_table_name
  order by c.ordinal_position;
end;
$function$
;

CREATE OR REPLACE FUNCTION extensions.get_unread_admin_notifications_count()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'common'
AS $function$
BEGIN
  RETURN (
    SELECT COUNT(*) 
    FROM common.admin_notifications 
    WHERE is_read = FALSE
  );
END;
$function$
;

CREATE OR REPLACE FUNCTION extensions.get_unread_job_notifications_count(p_user_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SET search_path TO 'neta_ops', 'common'
AS $function$
BEGIN
  RETURN (
    SELECT COUNT(*) 
    FROM neta_ops.job_notifications 
    WHERE (user_id = p_user_id OR user_id IS NULL)
    AND is_read = FALSE
    AND is_dismissed = FALSE
  );
END;
$function$
;

CREATE OR REPLACE FUNCTION extensions.get_unread_messages_count(user_uuid uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'common'
AS $function$
BEGIN
  RETURN (
    SELECT COUNT(*) 
    FROM common.chat_messages m
    JOIN common.chat_rooms r ON m.room_id = r.id
    LEFT JOIN common.user_room_access ura ON ura.room_id = r.id AND ura.user_id = user_uuid
    WHERE 
      (r.role = (SELECT raw_user_meta_data->>'role' FROM auth.users WHERE id = user_uuid) OR r.is_private = FALSE)
      AND m.created_at > COALESCE(ura.last_read_at, '1970-01-01'::timestamp)
      AND m.user_id != user_uuid
  );
END;
$function$
;

CREATE OR REPLACE FUNCTION extensions.get_user_chat_rooms()
 RETURNS TABLE(id uuid, name text, created_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
    -- Return empty result to prevent 406 errors
    RETURN QUERY
    SELECT 
        NULL::UUID as id,
        NULL::TEXT as name,
        NULL::TIMESTAMPTZ as created_at
    WHERE false;
END;
$function$
;

CREATE OR REPLACE FUNCTION extensions.get_user_details(user_id uuid)
 RETURNS TABLE(id uuid, email text, name text, profile_image text)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
    RETURN QUERY
    SELECT 
        au.id,
        au.email,
        COALESCE(
            au.raw_user_meta_data->>'name',
            au.raw_user_meta_data->>'full_name',
            au.email
        ) as name,
        COALESCE(
            au.raw_user_meta_data->>'profileImage',
            au.raw_user_meta_data->>'avatar_url'
        ) as profile_image
    FROM 
        auth.users au
    WHERE 
        au.id = user_id;
END;
$function$
;

CREATE OR REPLACE FUNCTION extensions.get_user_details_by_name(name_fragment text)
 RETURNS TABLE(id uuid, email text, name text, profile_image text)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
    RETURN QUERY
    SELECT 
        u.id,
        u.email,
        COALESCE(
            u.raw_user_meta_data->>'name', 
            u.raw_user_meta_data->>'full_name',
            u.raw_user_meta_data->>'username',
            u.email
        ) AS name,
        COALESCE(
            u.raw_user_meta_data->>'profileImage',
            u.raw_user_meta_data->>'avatar_url'
        ) AS profile_image
    FROM auth.users u
    WHERE 
        (u.raw_user_meta_data->>'name' ILIKE '%' || name_fragment || '%') OR
        (u.raw_user_meta_data->>'full_name' ILIKE '%' || name_fragment || '%') OR
        (u.raw_user_meta_data->>'username' ILIKE '%' || name_fragment || '%') OR
        (u.email ILIKE '%' || name_fragment || '%')
    LIMIT 10;
END;
$function$
;

CREATE OR REPLACE FUNCTION extensions.get_user_metadata(p_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    v_result JSONB;
BEGIN
    SELECT 
        jsonb_build_object(
            'id', u.id,
            'email', u.email,
            'name', u.raw_user_meta_data->>'name',
            'full_name', u.raw_user_meta_data->>'full_name',
            'username', u.raw_user_meta_data->>'username',
            'profile_image', u.raw_user_meta_data->>'profileImage',
            'avatar_url', u.raw_user_meta_data->>'avatar_url',
            'role', u.raw_user_meta_data->>'role'
        ) INTO v_result
    FROM auth.users u
    WHERE u.id = p_user_id;
    
    RETURN v_result;
END;
$function$
;

CREATE OR REPLACE FUNCTION extensions.grant_pg_cron_access()
 RETURNS event_trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  IF EXISTS (
    SELECT
    FROM pg_event_trigger_ddl_commands() AS ev
    JOIN pg_extension AS ext
    ON ev.objid = ext.oid
    WHERE ext.extname = 'pg_cron'
  )
  THEN
    grant usage on schema cron to postgres with grant option;

    alter default privileges in schema cron grant all on tables to postgres with grant option;
    alter default privileges in schema cron grant all on functions to postgres with grant option;
    alter default privileges in schema cron grant all on sequences to postgres with grant option;

    alter default privileges for user supabase_admin in schema cron grant all
        on sequences to postgres with grant option;
    alter default privileges for user supabase_admin in schema cron grant all
        on tables to postgres with grant option;
    alter default privileges for user supabase_admin in schema cron grant all
        on functions to postgres with grant option;

    grant all privileges on all tables in schema cron to postgres with grant option;
    revoke all on table cron.job from postgres;
    grant select on table cron.job to postgres with grant option;
  END IF;
END;
$function$
;

CREATE OR REPLACE FUNCTION extensions.grant_pg_graphql_access()
 RETURNS event_trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
    func_is_graphql_resolve bool;
BEGIN
    func_is_graphql_resolve = (
        SELECT n.proname = 'resolve'
        FROM pg_event_trigger_ddl_commands() AS ev
        LEFT JOIN pg_catalog.pg_proc AS n
        ON ev.objid = n.oid
    );

    IF func_is_graphql_resolve
    THEN
        -- Update public wrapper to pass all arguments through to the pg_graphql resolve func
        DROP FUNCTION IF EXISTS graphql_public.graphql;
        create or replace function graphql_public.graphql(
            "operationName" text default null,
            query text default null,
            variables jsonb default null,
            extensions jsonb default null
        )
            returns jsonb
            language sql
        as $$
            select graphql.resolve(
                query := query,
                variables := coalesce(variables, '{}'),
                "operationName" := "operationName",
                extensions := extensions
            );
        $$;

        -- This hook executes when `graphql.resolve` is created. That is not necessarily the last
        -- function in the extension so we need to grant permissions on existing entities AND
        -- update default permissions to any others that are created after `graphql.resolve`
        grant usage on schema graphql to postgres, anon, authenticated, service_role;
        grant select on all tables in schema graphql to postgres, anon, authenticated, service_role;
        grant execute on all functions in schema graphql to postgres, anon, authenticated, service_role;
        grant all on all sequences in schema graphql to postgres, anon, authenticated, service_role;
        alter default privileges in schema graphql grant all on tables to postgres, anon, authenticated, service_role;
        alter default privileges in schema graphql grant all on functions to postgres, anon, authenticated, service_role;
        alter default privileges in schema graphql grant all on sequences to postgres, anon, authenticated, service_role;

        -- Allow postgres role to allow granting usage on graphql and graphql_public schemas to custom roles
        grant usage on schema graphql_public to postgres with grant option;
        grant usage on schema graphql to postgres with grant option;
    END IF;

END;
$function$
;

CREATE OR REPLACE FUNCTION extensions.grant_pg_net_access()
 RETURNS event_trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_event_trigger_ddl_commands() AS ev
    JOIN pg_extension AS ext
    ON ev.objid = ext.oid
    WHERE ext.extname = 'pg_net'
  )
  THEN
    IF NOT EXISTS (
      SELECT 1
      FROM pg_roles
      WHERE rolname = 'supabase_functions_admin'
    )
    THEN
      CREATE USER supabase_functions_admin NOINHERIT CREATEROLE LOGIN NOREPLICATION;
    END IF;

    GRANT USAGE ON SCHEMA net TO supabase_functions_admin, postgres, anon, authenticated, service_role;

    IF EXISTS (
      SELECT FROM pg_extension
      WHERE extname = 'pg_net'
      -- all versions in use on existing projects as of 2025-02-20
      -- version 0.12.0 onwards don't need these applied
      AND extversion IN ('0.2', '0.6', '0.7', '0.7.1', '0.8', '0.10.0', '0.11.0')
    ) THEN
      ALTER function net.http_get(url text, params jsonb, headers jsonb, timeout_milliseconds integer) SECURITY DEFINER;
      ALTER function net.http_post(url text, body jsonb, params jsonb, headers jsonb, timeout_milliseconds integer) SECURITY DEFINER;

      ALTER function net.http_get(url text, params jsonb, headers jsonb, timeout_milliseconds integer) SET search_path = net;
      ALTER function net.http_post(url text, body jsonb, params jsonb, headers jsonb, timeout_milliseconds integer) SET search_path = net;

      REVOKE ALL ON FUNCTION net.http_get(url text, params jsonb, headers jsonb, timeout_milliseconds integer) FROM PUBLIC;
      REVOKE ALL ON FUNCTION net.http_post(url text, body jsonb, params jsonb, headers jsonb, timeout_milliseconds integer) FROM PUBLIC;

      GRANT EXECUTE ON FUNCTION net.http_get(url text, params jsonb, headers jsonb, timeout_milliseconds integer) TO supabase_functions_admin, postgres, anon, authenticated, service_role;
      GRANT EXECUTE ON FUNCTION net.http_post(url text, body jsonb, params jsonb, headers jsonb, timeout_milliseconds integer) TO supabase_functions_admin, postgres, anon, authenticated, service_role;
    END IF;
  END IF;
END;
$function$
;

CREATE OR REPLACE FUNCTION extensions.has_permission(resource text, action text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
    RETURN true;
END;
$function$
;

CREATE OR REPLACE FUNCTION extensions.has_permission(user_id uuid, resource text, action text, scope text DEFAULT 'own'::text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'common', 'neta_ops', 'business'
AS $function$
DECLARE
  v_role TEXT;
  v_permissions JSONB;
  v_has_permission BOOLEAN := FALSE;
BEGIN
  -- Get the user's role
  SELECT raw_user_meta_data->>'role' INTO v_role
  FROM auth.users
  WHERE id = user_id;
  
  -- First check if it's a system admin (has all permissions)
  IF v_role = 'Admin' THEN
    RETURN TRUE;
  END IF;
  
  -- Check if it's a custom role
  SELECT config->'permissions' INTO v_permissions
  FROM common.custom_roles
  WHERE name = v_role;
  
  -- Check if the role has the specific permission
  IF v_permissions IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1 
      FROM jsonb_array_elements(v_permissions) AS perm
      WHERE 
        (perm->>'resource' = resource) AND
        (perm->>'action' = action) AND
        (
          (perm->>'scope' IS NULL) OR
          (perm->>'scope' = 'all') OR
          (perm->>'scope' = scope)
        )
    ) INTO v_has_permission;
  END IF;
  
  RETURN v_has_permission;
END;
$function$
;

CREATE OR REPLACE FUNCTION extensions.is_lab_customer(user_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  RETURN EXISTS(
    SELECT 1 FROM auth.users 
    WHERE id = user_id 
    AND raw_user_meta_data->>'role' = 'Lab Customer'
  );
END;
$function$
;

CREATE OR REPLACE FUNCTION extensions.job_status_changed_notification()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
  job_title TEXT;
  notification_message TEXT;
  notification_title TEXT;
  previous_status TEXT;
  new_status TEXT;
BEGIN
  -- Only proceed if status has changed
  IF OLD.status = NEW.status THEN
    RETURN NEW;
  END IF;
  
  previous_status := OLD.status;
  new_status := NEW.status;
  job_title := NEW.title;
  
  -- Create notification title and message based on status change
  notification_title := 'Job Status Updated';
  notification_message := format('Job "%s" has been updated from %s to %s', 
                                job_title, previous_status, new_status);
  
  -- Insert the notification (global notification with null user_id)
  PERFORM create_job_notification(
    NEW.id,
    NULL, -- Global notification
    notification_title,
    notification_message,
    'status_change',
    jsonb_build_object(
      'previous_status', previous_status,
      'new_status', new_status
    )
  );
  
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION extensions.log_permission_access(resource text, action text, result text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
    RETURN true;
END;
$function$
;

CREATE OR REPLACE FUNCTION extensions.make_user_admin(target_email text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  UPDATE auth.users
  SET raw_user_meta_data = 
    COALESCE(raw_user_meta_data, '{}'::jsonb) || 
    jsonb_build_object('role', 'Admin')
  WHERE email = target_email;
END;
$function$
;

CREATE OR REPLACE FUNCTION extensions.mark_all_job_notifications_as_read(p_user_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'neta_ops', 'common'
AS $function$
BEGIN
  UPDATE neta_ops.job_notifications
  SET 
    is_read = TRUE,
    updated_at = NOW()
  WHERE (user_id = p_user_id OR user_id IS NULL)
  AND is_read = FALSE;
END;
$function$
;

CREATE OR REPLACE FUNCTION extensions.mark_notification_as_read(notification_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'common'
AS $function$
BEGIN
  UPDATE common.admin_notifications
  SET 
    is_read = TRUE,
    updated_at = NOW()
  WHERE id = notification_id;
END;
$function$
;

CREATE OR REPLACE FUNCTION extensions.mark_room_as_read(user_uuid uuid, room_uuid uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'common'
AS $function$
BEGIN
  -- Create or update user_room_access record
  INSERT INTO common.user_room_access (user_id, room_id, last_read_at)
  VALUES (user_uuid, room_uuid, NOW())
  ON CONFLICT (user_id, room_id) 
  DO UPDATE SET last_read_at = NOW();
END;
$function$
;

CREATE OR REPLACE FUNCTION extensions.mark_room_messages_read(p_room_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
    RETURN true;
END;
$function$
;

CREATE OR REPLACE FUNCTION extensions.pgrst_ddl_watch()
 RETURNS event_trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN SELECT * FROM pg_event_trigger_ddl_commands()
  LOOP
    IF cmd.command_tag IN (
      'CREATE SCHEMA', 'ALTER SCHEMA'
    , 'CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO', 'ALTER TABLE'
    , 'CREATE FOREIGN TABLE', 'ALTER FOREIGN TABLE'
    , 'CREATE VIEW', 'ALTER VIEW'
    , 'CREATE MATERIALIZED VIEW', 'ALTER MATERIALIZED VIEW'
    , 'CREATE FUNCTION', 'ALTER FUNCTION'
    , 'CREATE TRIGGER'
    , 'CREATE TYPE', 'ALTER TYPE'
    , 'CREATE RULE'
    , 'COMMENT'
    )
    -- don't notify in case of CREATE TEMP table or other objects created on pg_temp
    AND cmd.schema_name is distinct from 'pg_temp'
    THEN
      NOTIFY pgrst, 'reload schema';
    END IF;
  END LOOP;
END; $function$
;

CREATE OR REPLACE FUNCTION extensions.pgrst_drop_watch()
 RETURNS event_trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
  obj record;
BEGIN
  FOR obj IN SELECT * FROM pg_event_trigger_dropped_objects()
  LOOP
    IF obj.object_type IN (
      'schema'
    , 'table'
    , 'foreign table'
    , 'view'
    , 'materialized view'
    , 'function'
    , 'trigger'
    , 'type'
    , 'rule'
    )
    AND obj.is_temporary IS false -- no pg_temp objects
    THEN
      NOTIFY pgrst, 'reload schema';
    END IF;
  END LOOP;
END; $function$
;

CREATE OR REPLACE FUNCTION extensions.send_ready_to_bill_email()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  -- Only proceed if status changed to "ready to bill"
  IF NEW.status IN ('ready-to-bill', 'ready to bill') AND 
     (OLD.status IS NULL OR OLD.status != NEW.status) THEN
    
    -- Fix: Cast the UUID to text so COALESCE works
    RAISE NOTICE 'Project % is ready to bill - email notification should be sent to sam.epps@ampqes.com', 
                  COALESCE(NEW.job_number, NEW.title, NEW.id::text);
  END IF;
  
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION extensions.set_graphql_placeholder()
 RETURNS event_trigger
 LANGUAGE plpgsql
AS $function$
    DECLARE
    graphql_is_dropped bool;
    BEGIN
    graphql_is_dropped = (
        SELECT ev.schema_name = 'graphql_public'
        FROM pg_event_trigger_dropped_objects() AS ev
        WHERE ev.schema_name = 'graphql_public'
    );

    IF graphql_is_dropped
    THEN
        create or replace function graphql_public.graphql(
            "operationName" text default null,
            query text default null,
            variables jsonb default null,
            extensions jsonb default null
        )
            returns jsonb
            language plpgsql
        as $$
            DECLARE
                server_version float;
            BEGIN
                server_version = (SELECT (SPLIT_PART((select version()), ' ', 2))::float);

                IF server_version >= 14 THEN
                    RETURN jsonb_build_object(
                        'errors', jsonb_build_array(
                            jsonb_build_object(
                                'message', 'pg_graphql extension is not enabled.'
                            )
                        )
                    );
                ELSE
                    RETURN jsonb_build_object(
                        'errors', jsonb_build_array(
                            jsonb_build_object(
                                'message', 'pg_graphql is only available on projects running Postgres 14 onwards.'
                            )
                        )
                    );
                END IF;
            END;
        $$;
    END IF;

    END;
$function$
;

CREATE OR REPLACE FUNCTION extensions.table_exists(schema text, tablename text)
 RETURNS boolean
 LANGUAGE plpgsql
AS $function$
DECLARE
   exists boolean;
BEGIN
    SELECT count(*) > 0 INTO exists
    FROM pg_tables
    WHERE schemaname = schema
    AND tablename = tablename;
    RETURN exists;
END;
$function$
;

CREATE OR REPLACE FUNCTION extensions.test_ready_to_bill_data(job_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  job_data RECORD;
BEGIN
  -- Get job details
  SELECT 
    j.id,
    j.job_number,
    j.title,
    j.division,
    j.due_date,
    j.budget,
    j.user_id,
    j.notes,
    j.customer_id,
    c.name as customer_name,
    c.company_name,
    c.email as customer_email
  INTO job_data
  FROM lab_ops.lab_jobs j
  LEFT JOIN common.customers c ON j.customer_id = c.id
  WHERE j.id = job_id;

  IF job_data IS NULL THEN
    RETURN 'Job not found';
  END IF;

  -- Return formatted job data
  RETURN 'Job: ' || job_data.job_number || 
         ' | Title: ' || COALESCE(job_data.title, 'No title') ||
         ' | Customer: ' || COALESCE(job_data.customer_name, job_data.company_name, 'Unknown') ||
         ' | Division: ' || COALESCE(job_data.division, 'Unknown') ||
         ' | Status: ready-to-bill';
END;
$function$
;

CREATE OR REPLACE FUNCTION extensions.update_timestamp()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION extensions.update_updated_at_column()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION extensions.update_user_xp_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$function$
;
