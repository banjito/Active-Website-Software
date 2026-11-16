-- Security checklist item 12 (2026-11-16): views that bypass row security.
--
-- These views run with their owner's full rights, and logged-out visitors
-- (the "anon" role) could read them: tech emails, lab customer emails, lab job
-- budgets/notes, deleted report list, encryption config status.
--
-- Gentle fix: block logged-out visitors only. Logged-in users keep the same
-- access, so scheduling and everything techs use works unchanged.
-- The Android lab app is retired, so its views lose anon access too.
--
-- Left public on purpose: common.v_posted_job_requisitions,
-- common.v_public_application_questions, common.v_published_articles
-- (job board and articles site read them without login).

SET lock_timeout = '5s';

REVOKE ALL ON common.android_lab_customers   FROM anon;
REVOKE ALL ON common.android_lab_jobs        FROM anon;
REVOKE ALL ON public.android_lab_customers   FROM anon;
REVOKE ALL ON public.android_lab_jobs        FROM anon;
REVOKE ALL ON common.encryption_status       FROM anon;
REVOKE ALL ON neta_ops.available_technicians FROM anon;
REVOKE ALL ON neta_ops.deleted_reports_view  FROM anon;

-- Check: every row should say anon_can_read = false.
SELECT n.nspname || '.' || c.relname AS view,
       has_table_privilege('anon', c.oid, 'select') AS anon_can_read
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE (n.nspname, c.relname) IN (
  ('common','android_lab_customers'), ('common','android_lab_jobs'),
  ('public','android_lab_customers'), ('public','android_lab_jobs'),
  ('common','encryption_status'), ('neta_ops','available_technicians'),
  ('neta_ops','deleted_reports_view')
);
