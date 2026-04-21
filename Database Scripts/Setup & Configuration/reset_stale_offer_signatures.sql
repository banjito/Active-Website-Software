-- =====================================================
-- One-off cleanup: reset signature state on offers that
-- were flagged as "signed" during testing/refresh but were
-- never truly completed by a candidate.
--
-- This targets offers whose overall status is still
-- draft / pending_approval / approved / sent / expired
-- (i.e. NOT accepted or declined) but somehow have
-- signature_status = 'signed' and/or a signed_at timestamp.
-- =====================================================

UPDATE common.offers
SET signature_status = 'pending',
    signed_at = NULL,
    signature_data = NULL,
    updated_at = NOW()
WHERE status NOT IN ('accepted', 'declined')
  AND (signature_status = 'signed' OR signed_at IS NOT NULL);

-- Optional: prune e_signatures for those same offers so the audit trail
-- doesn't show phantom signatures.
DELETE FROM common.e_signatures
WHERE offer_id IN (
    SELECT id FROM common.offers WHERE status NOT IN ('accepted', 'declined')
);
