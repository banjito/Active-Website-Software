-- "Thank you for applying" email to career page applicants.
-- new-applicant-notification stamps this column when it sends the applicant
-- their confirmation, so each applicant gets it once no matter how many times
-- the function is called. Until this runs, the function skips the applicant
-- email (HR still gets theirs).
ALTER TABLE common.candidates
  ADD COLUMN IF NOT EXISTS confirmation_sent_at timestamptz;
