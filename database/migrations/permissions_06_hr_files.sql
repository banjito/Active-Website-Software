-- ampOS Roles & Permissions, item 6 (part 1b): lock the employee-documents file folder.
-- Run AFTER permissions_05_hr_lockdown.sql (it uses common.can_see_hr_files).
--
-- LIVE CHANGE. Today the folder is public (anyone with a file's address can open it)
-- and every logged-in user can read every file. After this:
--   * The folder is private. The app already opens these files with signed links,
--     so nothing in the app breaks.
--   * A file opens for: whoever uploaded it, the employee it belongs to, their
--     managers on the org chart, and HR / Super Admins.
--
-- Kept separate because Supabase sometimes refuses storage rule changes from the
-- SQL editor. If it does, nothing else is affected: make the same rule in
-- Dashboard → Storage → Policies, or send me the error.

BEGIN;

-- Paths look like employee-documents/<employee id>/<file>. Finds the employee id in the path.
CREATE FUNCTION common.can_see_hr_file(p_name text) RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  part text;
BEGIN
  IF auth.uid() IS NULL THEN RETURN false; END IF;
  IF common.can('hr.view_all') THEN RETURN true; END IF;
  FOREACH part IN ARRAY coalesce(storage.foldername(p_name), '{}') LOOP
    IF part ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
      RETURN common.can_see_hr_files(part::uuid);
    END IF;
  END LOOP;
  RETURN false;
END;
$$;
REVOKE ALL ON FUNCTION common.can_see_hr_file(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION common.can_see_hr_file(text) TO authenticated, service_role;

UPDATE storage.buckets SET public = false WHERE id = 'employee-documents';

DROP POLICY "Authenticated users can view employee documents" ON storage.objects;
CREATE POLICY "Employee documents: owner, employee, managers, HR" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'employee-documents'
    AND (owner = auth.uid() OR common.can_see_hr_file(name))
  );

COMMIT;
