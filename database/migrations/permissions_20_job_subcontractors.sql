-- ampOS Roles & Permissions, item 8 part 2c: the Subcontractors card on a job.
--
--   1. common.job_subcontractors(job): who is invited to a job (staff only).
--   2. common.remove_subcontractor_from_job(job, person): needs "Invite subcontractors".
--      Someone removed from their last job is switched off (removed_at), so they
--      see nothing until invited again.
--
-- All or nothing.

BEGIN;
SET LOCAL lock_timeout = '5s';

CREATE OR REPLACE FUNCTION common.job_subcontractors(p_job uuid)
RETURNS TABLE (user_id uuid, name text, email text, company text, added_at timestamptz, last_sign_in_at timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO ''
AS $$
BEGIN
  IF NOT common.is_employee_user() THEN
    RAISE EXCEPTION 'Staff only.' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  SELECT a.user_id,
         coalesce(nullif(u.raw_user_meta_data->>'name', ''), split_part(u.email::text, '@', 1)),
         u.email::text,
         e.company,
         a.added_at,
         u.last_sign_in_at
    FROM common.external_job_access a
    JOIN common.external_users e ON e.user_id = a.user_id
    JOIN auth.users u ON u.id = a.user_id
   WHERE a.job_id = p_job AND e.removed_at IS NULL
   ORDER BY 2;
END;
$$;

CREATE OR REPLACE FUNCTION common.remove_subcontractor_from_job(p_job uuid, p_user uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $$
BEGIN
  IF NOT common.can('jobs.invite_subcontractors') THEN
    RAISE EXCEPTION 'You need the "Invite subcontractors" permission.' USING ERRCODE = '42501';
  END IF;
  DELETE FROM common.external_job_access WHERE job_id = p_job AND user_id = p_user;
  IF NOT EXISTS (SELECT 1 FROM common.external_job_access WHERE user_id = p_user) THEN
    UPDATE common.external_users
       SET removed_at = now(), removed_by = auth.uid()
     WHERE user_id = p_user AND removed_at IS NULL;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION common.job_subcontractors(uuid), common.remove_subcontractor_from_job(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION common.job_subcontractors(uuid), common.remove_subcontractor_from_job(uuid, uuid) TO authenticated, service_role;

COMMIT;

-- Check (run after): expect 2
--   select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--    where n.nspname = 'common' and p.proname in ('job_subcontractors', 'remove_subcontractor_from_job');
