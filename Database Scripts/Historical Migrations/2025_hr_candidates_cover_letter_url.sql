-- Add cover_letter_url to candidates table for uploaded cover letter files
-- cover_letter (TEXT) remains for pasted text; cover_letter_url stores URL of uploaded PDF/DOC

ALTER TABLE common.candidates
ADD COLUMN IF NOT EXISTS cover_letter_url TEXT;

COMMENT ON COLUMN common.candidates.cover_letter_url IS 'URL to uploaded cover letter file (PDF/DOC/DOCX) in resumes storage bucket';
