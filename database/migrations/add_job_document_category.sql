-- Job overview now shows one tagged "Documents" list instead of separate
-- Drawings / Miscellaneous cards. The tag lives on miscellaneous_documents.
-- Values come from JOB_DOCUMENT_CATEGORIES in JobDetail.tsx (drawing, spec,
-- contract, agreement, invoice, misc). Plain text, no check constraint, so
-- new tags need no migration. Existing rows become "misc".
-- Older one_line_drawings rows are untouched; the app shows them as "Drawing".

ALTER TABLE neta_ops.miscellaneous_documents
  ADD COLUMN IF NOT EXISTS category text NOT NULL DEFAULT 'misc';

-- Make the API see the new column right away
NOTIFY pgrst, 'reload schema';
