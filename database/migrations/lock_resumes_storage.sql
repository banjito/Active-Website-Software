-- Lock the resumes storage folder (run after enable_rls_recruiting.sql).
--
-- Problem: anyone with the public key could list and download every
-- applicant's resume. After this, only recruiting users (Admin, Super Admin,
-- superusers, Talent Pool members) can list, change or delete resume files.
-- Uploads from the public career page still work, and existing resume links
-- still open (the folder stays "public" so saved links don't break; file
-- names are random, so they can't be guessed).
--
-- Kept in its own file because Supabase sometimes refuses rule changes on its
-- storage tables ("must be owner of table objects"). If that happens, nothing
-- else is affected; send the error and we'll do it from the Storage settings.
--
-- Safe to run more than once.

DROP POLICY IF EXISTS resumes_select ON storage.objects;
CREATE POLICY resumes_select ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'resumes' AND (SELECT common.talent_pool_can_access()));

DROP POLICY IF EXISTS resumes_update ON storage.objects;
CREATE POLICY resumes_update ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'resumes' AND (SELECT common.talent_pool_can_access()))
  WITH CHECK (bucket_id = 'resumes' AND (SELECT common.talent_pool_can_access()));

DROP POLICY IF EXISTS resumes_delete ON storage.objects;
CREATE POLICY resumes_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'resumes' AND (SELECT common.talent_pool_can_access()));

