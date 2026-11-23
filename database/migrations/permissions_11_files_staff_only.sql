-- ampOS Roles & Permissions, item 7 (part 2): files are for staff.
--
-- LIVE CHANGE. Why: file storage has ~30 old rules that say "any login" (one of them
-- covers every folder). Rules add up, so a customer login (ampOS ACCESS) could list,
-- download, change or delete any file: job documents, offer letters, certificates,
-- even other customers' report PDFs. Anyone on the internet could also add, replace
-- or delete files in the customer-assets folder.
--
-- After this:
--   * Staff (common.is_employee_user()): nothing changes.
--   * A non-staff login (customer today, subcontractor later) only reaches:
--       - its own company's brand folder (logo upload in ACCESS)
--       - files it uploaded itself in user-uploads (e.g. a profile picture)
--       - the resumes folder for applying on the careers page while logged in
--     Customers still download their reports through ACCESS (that goes through the
--     server, not their login).
--   * No login: can no longer add, change or delete in customer-assets. Public links
--     to files in public folders keep working (folders going private is separate).
--
-- How: one extra rule that every login must ALSO pass. The old rules stay; they just
-- can't let a non-staff login through any more.
--
-- All or nothing.

BEGIN;
SET LOCAL lock_timeout = '5s';

DROP POLICY IF EXISTS "Files: staff, or your own" ON storage.objects;
CREATE POLICY "Files: staff, or your own" ON storage.objects
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (
    (SELECT common.is_employee_user())
    OR (bucket_id = 'customer-brand-assets'
        AND (storage.foldername(name))[1] = (SELECT common.current_customer_id())::text)
    OR (bucket_id = 'user-uploads' AND owner = (SELECT auth.uid()))
    OR bucket_id = 'resumes'
  )
  WITH CHECK (
    (SELECT common.is_employee_user())
    OR (bucket_id = 'customer-brand-assets'
        AND (storage.foldername(name))[1] = (SELECT common.current_customer_id())::text)
    OR (bucket_id = 'user-uploads' AND owner = (SELECT auth.uid()))
    OR bucket_id = 'resumes'
  );

-- No-login changes to customer-assets (old customer logos) go. Staff keep full access
-- through their existing rules; anyone can still view the logos by link.
DROP POLICY IF EXISTS customer_assets_insert ON storage.objects;
DROP POLICY IF EXISTS customer_assets_update ON storage.objects;
DROP POLICY IF EXISTS customer_assets_delete ON storage.objects;

COMMIT;

-- Check in the app afterwards (as yourself):
--   upload and open a job document; open an equipment certificate; change your
--   profile picture; open an HR document. All should work as before.
--
-- UNDO:
--   DROP POLICY "Files: staff, or your own" ON storage.objects;
