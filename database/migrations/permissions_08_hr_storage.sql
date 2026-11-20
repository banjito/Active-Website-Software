-- ampOS Roles & Permissions, item 6 (part 3): the two HR file folders.
--
-- RUN ORDER: push the app and deploy new-applicant-notification FIRST
-- (resume links now sign themselves), then run this.
--
-- LIVE CHANGE. Why: storage has a catch-all rule, "Allow all operations for
-- authenticated users": any login can read, change or delete any file in any folder.
-- Rules add up, so the HR-only rules from part 1 didn't stop it.
--
-- This adds a second layer that must ALSO pass, only for the two HR folders:
--   resumes             open / change / delete: Talent Pool people (Admin, HR, members).
--                       Adding stays open (the public careers page uploads here).
--                       The folder goes private: old public addresses stop working.
--   employee-documents  open: the uploader, the employee, their managers, HR.
--                       add: the employee, their managers, HR, onboarding/recruiting staff.
--                       change / delete: the uploader or HR.
-- Every other folder is untouched (the job files work handles job-documents).
--
-- All or nothing.

BEGIN;
SET LOCAL lock_timeout = '5s';

UPDATE storage.buckets SET public = false WHERE id = 'resumes';

DROP POLICY IF EXISTS "HR folders: open" ON storage.objects;
CREATE POLICY "HR folders: open" ON storage.objects
  AS RESTRICTIVE FOR SELECT TO authenticated
  USING (
    CASE bucket_id
      WHEN 'resumes' THEN (SELECT common.hr_recruiting_staff())
      WHEN 'employee-documents' THEN
        owner = (SELECT auth.uid()) OR common.can_see_hr_file(name)
      ELSE true
    END
  );

DROP POLICY IF EXISTS "HR folders: add" ON storage.objects;
CREATE POLICY "HR folders: add" ON storage.objects
  AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (
    CASE bucket_id
      WHEN 'employee-documents' THEN
        common.can_see_hr_file(name)
        OR (SELECT common.hr_recruiting_staff())
        OR (SELECT common.hr_onboarding_staff())
      ELSE true
    END
  );

DROP POLICY IF EXISTS "HR folders: change" ON storage.objects;
CREATE POLICY "HR folders: change" ON storage.objects
  AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (
    CASE bucket_id
      WHEN 'resumes' THEN (SELECT common.hr_recruiting_staff())
      WHEN 'employee-documents' THEN
        owner = (SELECT auth.uid()) OR (SELECT common.can('hr.view_all'))
      ELSE true
    END
  )
  WITH CHECK (
    CASE bucket_id
      WHEN 'resumes' THEN (SELECT common.hr_recruiting_staff())
      WHEN 'employee-documents' THEN
        owner = (SELECT auth.uid()) OR (SELECT common.can('hr.view_all'))
      ELSE true
    END
  );

DROP POLICY IF EXISTS "HR folders: delete" ON storage.objects;
CREATE POLICY "HR folders: delete" ON storage.objects
  AS RESTRICTIVE FOR DELETE TO authenticated
  USING (
    CASE bucket_id
      WHEN 'resumes' THEN (SELECT common.hr_recruiting_staff())
      WHEN 'employee-documents' THEN
        owner = (SELECT auth.uid()) OR (SELECT common.can('hr.view_all'))
      ELSE true
    END
  );

COMMIT;

-- Check in the app afterwards:
--   HR / Admin: open a candidate in Candidate Tracking; the resume preview loads.
--   HR: Employee Files, open someone's document.
--   A field tech: their own Employee Files documents still open.
--   Careers page (logged out): apply with a resume; it uploads.
--
-- ROLLBACK (only if something above breaks):
--   UPDATE storage.buckets SET public = true WHERE id = 'resumes';
--   DROP POLICY "HR folders: open" ON storage.objects;
--   DROP POLICY "HR folders: add" ON storage.objects;
--   DROP POLICY "HR folders: change" ON storage.objects;
--   DROP POLICY "HR folders: delete" ON storage.objects;
