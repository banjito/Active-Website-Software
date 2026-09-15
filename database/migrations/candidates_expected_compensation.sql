-- Careers page application asks "What is your expected compensation for this role?"
-- Free text so applicants can answer hourly or salary (e.g. "$38/hr", "$85,000/yr").

ALTER TABLE common.candidates
  ADD COLUMN IF NOT EXISTS expected_compensation text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'candidates_expected_compensation_len_check'
      AND conrelid = 'common.candidates'::regclass
  ) THEN
    ALTER TABLE common.candidates
      ADD CONSTRAINT candidates_expected_compensation_len_check
      CHECK (expected_compensation IS NULL OR char_length(expected_compensation) <= 255);
  END IF;
END;
$$;

COMMENT ON COLUMN common.candidates.expected_compensation IS 'Applicant''s expected compensation for the role, as entered on the careers page.';

NOTIFY pgrst, 'reload schema';
