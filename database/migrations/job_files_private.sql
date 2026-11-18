-- Job files private (Job Documents scope item 1), 2026-11-18.
--
-- RUN ORDER: deploy the app update first (it signs job-file links), check a
-- job document, a job picture and a report with photos still open, THEN run
-- this. Afterwards publish one report with photos (a regular report and a
-- custom form) and check the photos are in the PDF.
--
-- What it does:
--   * job-documents bucket goes private: old public addresses stop working.
--   * Only staff (common.is_employee_user) can open, upload or change job files.
--   * Delete: whoever uploaded the file, PMs and admins (common.is_pm_or_admin).
--   * The "Allow all operations for authenticated users" catch-all (any login,
--     every bucket, including non-staff logins) no longer covers job-documents.
--     Other buckets keep it for now.
--   * common.file_share_links logs every 7-day "Share link".

SET lock_timeout = '5s';

BEGIN;

-- 1. Bucket private.
UPDATE storage.buckets SET public = false WHERE id = 'job-documents';

-- 2. Take job-documents out of the catch-all.
DROP POLICY IF EXISTS "Allow all operations for authenticated users" ON storage.objects;
CREATE POLICY "Allow all operations for authenticated users" ON storage.objects
  FOR ALL TO public
  USING (auth.role() = 'authenticated' AND bucket_id <> 'job-documents')
  WITH CHECK (auth.role() = 'authenticated' AND bucket_id <> 'job-documents');

-- 3. Old job-documents rules out.
DROP POLICY IF EXISTS "Allow public read from job-documents" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated uploads to job-documents" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can view job documents" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload job documents" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can update job documents" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete job documents" ON storage.objects;

-- 4. New rules.
DROP POLICY IF EXISTS "Staff read job files" ON storage.objects;
CREATE POLICY "Staff read job files" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'job-documents' AND common.is_employee_user());

DROP POLICY IF EXISTS "Staff upload job files" ON storage.objects;
CREATE POLICY "Staff upload job files" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'job-documents' AND common.is_employee_user());

DROP POLICY IF EXISTS "Staff update job files" ON storage.objects;
CREATE POLICY "Staff update job files" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'job-documents' AND common.is_employee_user())
  WITH CHECK (bucket_id = 'job-documents' AND common.is_employee_user());

DROP POLICY IF EXISTS "Uploader, PMs and admins delete job files" ON storage.objects;
CREATE POLICY "Uploader, PMs and admins delete job files" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'job-documents'
    AND common.is_employee_user()
    AND (owner_id = auth.uid()::text OR common.is_pm_or_admin())
  );

-- 5. Share link log. No foreign key to neta_ops.jobs on purpose (busy table).
CREATE TABLE IF NOT EXISTS common.file_share_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bucket text NOT NULL,
  path text NOT NULL,
  file_name text,
  job_id uuid,
  expires_at timestamptz NOT NULL,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS file_share_links_job_id_idx ON common.file_share_links (job_id);

ALTER TABLE common.file_share_links ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Staff add share links" ON common.file_share_links;
CREATE POLICY "Staff add share links" ON common.file_share_links
  FOR INSERT TO authenticated
  WITH CHECK (common.is_employee_user() AND created_by = auth.uid());

DROP POLICY IF EXISTS "Staff read share links" ON common.file_share_links;
CREATE POLICY "Staff read share links" ON common.file_share_links
  FOR SELECT TO authenticated
  USING (common.is_employee_user());

REVOKE ALL ON common.file_share_links FROM anon;
GRANT SELECT, INSERT ON common.file_share_links TO authenticated;
GRANT ALL ON common.file_share_links TO service_role;

COMMIT;

-- 6. Check. Expect: bucket public = false, and the only rules that can reach
--    job-documents are the four "job files" rules plus the narrowed catch-all.
--    Anything else listed here (added after the July export) needs a look.
SELECT id, public FROM storage.buckets WHERE id = 'job-documents';

SELECT policyname, cmd, roles, qual, with_check
  FROM pg_policies
 WHERE schemaname = 'storage' AND tablename = 'objects'
   AND (
     coalesce(qual, '') || coalesce(with_check, '') LIKE '%job-documents%'
     OR coalesce(qual, '') || coalesce(with_check, '') NOT LIKE '%bucket_id%'
   )
 ORDER BY policyname;

-- ROLLBACK (only if published report PDFs lose their photos): makes the
-- bucket public again; the new rules can stay.
--   UPDATE storage.buckets SET public = true WHERE id = 'job-documents';
--   CREATE POLICY "Allow public read from job-documents" ON storage.objects
--     FOR SELECT TO public USING (bucket_id = 'job-documents');
