-- Quote (opportunity) Documents card, 2026-11-23.
--
-- 1. New table business.opportunity_documents: tagged files on a quote
--    (Drawing, Spec, Bid Docs, Proposal, Contract / PO, Miscellaneous).
--    Files live in the job-documents folder under opportunities/<quote id>/.
--    Staff only. The job's Documents card also lists these once the quote is won.
-- 2. Copies the 21 real files from the old quote document list
--    (business.subcontractor_agreements), tags guessed from the file name.
--    Those old rows stay where they are; the app no longer reads that table.
-- 3. Deletes the 576 "Default Document" / "Default Subcontractor Agreement" rows.
--    They hold no file, only a broken link to a template (Jack OK'd, Nov 23).
--
-- All or nothing. Run after the app update is pushed (or before; the old list
-- simply disappears from the quote page once the app updates).

BEGIN;
SET LOCAL lock_timeout = '5s';

-- 1. Table -------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS business.opportunity_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  opportunity_id uuid NOT NULL REFERENCES business.opportunities(id) ON DELETE CASCADE,
  user_id uuid DEFAULT auth.uid(),
  name text NOT NULL,
  description text,
  category text NOT NULL DEFAULT 'misc',
  file_url text NOT NULL,
  file_path text,
  file_type text,
  file_size bigint,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS opportunity_documents_opportunity_id_idx
  ON business.opportunity_documents (opportunity_id);

ALTER TABLE business.opportunity_documents ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS opportunity_documents_staff ON business.opportunity_documents;
CREATE POLICY opportunity_documents_staff ON business.opportunity_documents
  FOR ALL TO authenticated
  USING ((SELECT common.is_employee_user()))
  WITH CHECK ((SELECT common.is_employee_user()));

REVOKE ALL ON business.opportunity_documents FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON business.opportunity_documents TO authenticated;
GRANT ALL ON business.opportunity_documents TO service_role;

-- 2. Copy the real files from the old list ------------------------------------

INSERT INTO business.opportunity_documents
  (opportunity_id, user_id, name, category, file_url, file_path, file_type, file_size, created_at, updated_at)
SELECT
  a.opportunity_id,
  a.user_id,
  coalesce(nullif(regexp_replace(a.name, '\.[^.]+$', ''), ''), a.name),
  CASE
    WHEN a.name ~* 'proposal' THEN 'proposal'
    WHEN a.name ~* '(^|[^a-z])po[_ #-]|purchase order|contract|agreement' THEN 'contract'
    WHEN a.name ~* 'spec' THEN 'spec'
    WHEN a.name ~* 'plan|drawing|diagram|riser|one.?line' THEN 'drawing'
    WHEN a.name ~* 'statement.of.work|scope|rfp|bid|equip.*list' THEN 'bid_docs'
    ELSE 'misc'
  END,
  a.file_url,
  p.path,
  o.metadata ->> 'mimetype',
  (o.metadata ->> 'size')::bigint,
  coalesce(a.upload_date, a.created_at, now()),
  now()
FROM business.subcontractor_agreements a
CROSS JOIN LATERAL (
  SELECT nullif(substring(a.file_url FROM '/job-documents/([^?]+)'), '') AS path
) p
LEFT JOIN storage.objects o
  ON o.bucket_id = 'job-documents' AND o.name = p.path
WHERE a.file_url <> '/templates/subcontractor-agreement-template.pdf'
  AND NOT EXISTS (
    SELECT 1 FROM business.opportunity_documents d
     WHERE d.opportunity_id = a.opportunity_id AND d.file_url = a.file_url
  );

-- 3. Placeholders out ---------------------------------------------------------

DELETE FROM business.subcontractor_agreements
 WHERE file_url = '/templates/subcontractor-agreement-template.pdf';

COMMIT;

-- Check (run after): expect about 21 | 0
--   select (select count(*) from business.opportunity_documents),
--          (select count(*) from business.subcontractor_agreements
--            where file_url = '/templates/subcontractor-agreement-template.pdf');
