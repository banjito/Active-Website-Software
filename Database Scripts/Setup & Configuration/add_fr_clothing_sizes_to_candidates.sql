-- FR (Flame-Resistant) clothing sizes collected with Equal Employment info when applying for jobs.
-- Optional on application; can be updated in employee profile after hire.

ALTER TABLE common.candidates
ADD COLUMN IF NOT EXISTS fr_shirt_size TEXT,
ADD COLUMN IF NOT EXISTS fr_pant_size TEXT,
ADD COLUMN IF NOT EXISTS fr_jacket_size TEXT;

COMMENT ON COLUMN common.candidates.fr_shirt_size IS 'FR shirt size from job application (Equal Employment section).';
COMMENT ON COLUMN common.candidates.fr_pant_size IS 'FR pant size from job application.';
COMMENT ON COLUMN common.candidates.fr_jacket_size IS 'FR jacket size from job application.';
