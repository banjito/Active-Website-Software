-- Talent Pool CSV import (Talent Pool page > Import CSV).
--
-- Needs database/migrations/talent_pool.sql applied first. Rows are created
-- through talent_pool_create and talent_pool_add_activity like the Add
-- Prospect form; this only adds the read the preview needs to flag
-- duplicates before anything is written.

-- Existing prospects sharing an email, LinkedIn URL, or name key with the
-- incoming rows. Name keys use the same rule as nameKey() in
-- src/lib/talentPool/normalize.ts: lowercase, letters only, "first last".
CREATE OR REPLACE FUNCTION common.talent_pool_identity_matches(
  p_emails text[], p_linkedin_urls text[], p_name_keys text[]
) RETURNS jsonb
  LANGUAGE plpgsql STABLE SECURITY DEFINER
  SET search_path = ''
  AS $$
BEGIN
  PERFORM common._talent_pool_require_access();
  IF coalesce(cardinality(p_emails), 0) + coalesce(cardinality(p_linkedin_urls), 0)
     + coalesce(cardinality(p_name_keys), 0) > 10000 THEN
    RAISE EXCEPTION 'Too many rows to check at once' USING ERRCODE = '22023';
  END IF;
  RETURN coalesce((
    SELECT jsonb_agg(jsonb_build_object(
      'id', r.id, 'first_name', r.first_name, 'last_name', r.last_name,
      'email', r.email, 'linkedin_url', r.linkedin_url, 'status', r.status
    ))
    FROM common.recruiting_prospects r
    WHERE lower(r.email) = ANY (coalesce(p_emails, '{}'))
       OR r.linkedin_url = ANY (coalesce(p_linkedin_urls, '{}'))
       OR (r.last_name IS NOT NULL
           AND regexp_replace(lower(r.first_name), '[^a-z]', '', 'g') || ' '
               || regexp_replace(lower(r.last_name), '[^a-z]', '', 'g') = ANY (coalesce(p_name_keys, '{}')))
  ), '[]'::jsonb);
END;
$$;

REVOKE ALL ON FUNCTION common.talent_pool_identity_matches(text[], text[], text[])
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION common.talent_pool_identity_matches(text[], text[], text[]) TO authenticated;

NOTIFY pgrst, 'reload schema';
