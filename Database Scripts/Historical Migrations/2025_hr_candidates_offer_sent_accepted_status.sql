-- Add 'offer_sent' and 'offer_accepted' to candidate status for tracking when offers are sent/accepted

ALTER TABLE common.candidates DROP CONSTRAINT IF EXISTS candidates_status_check;

ALTER TABLE common.candidates
  ADD CONSTRAINT candidates_status_check
  CHECK (status IN ('new', 'screening', 'interview', 'offer', 'offer_sent', 'offer_accepted', 'hired', 'rejected'));

COMMENT ON COLUMN common.candidates.status IS 'Pipeline status: new, screening, interview, offer, offer_sent (offer letter sent), offer_accepted (candidate accepted), hired, rejected';
