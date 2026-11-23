-- Job files private: tidy-up, 2026-11-23.
--
-- The check after job_files_private.sql showed four older rules that still name
-- the job-documents folder ("any login" / "whoever uploaded it"). They can't let
-- anyone new in, because "Files: staff, or your own" (permissions_11) must also pass,
-- but they'd matter again if that rule were ever dropped. Staff keep full access
-- through the "Staff ... job files" rules.

BEGIN;
SET LOCAL lock_timeout = '5s';
DROP POLICY IF EXISTS job_documents_select ON storage.objects;
DROP POLICY IF EXISTS job_documents_insert ON storage.objects;
DROP POLICY IF EXISTS job_documents_update ON storage.objects;
DROP POLICY IF EXISTS job_documents_delete ON storage.objects;
COMMIT;
