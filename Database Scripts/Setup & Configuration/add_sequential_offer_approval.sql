-- =====================================================
-- Offers: Sequential Approval Support
-- Adds current_approval_step column to common.offers
-- Mirrors the sequential approval flow used by job_requisitions
-- =====================================================

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'common'
          AND table_name = 'offers'
          AND column_name = 'current_approval_step'
    ) THEN
        ALTER TABLE common.offers ADD COLUMN current_approval_step INTEGER DEFAULT 0;
    END IF;
END $$;

COMMENT ON COLUMN common.offers.current_approval_step IS 'Tracks which step of the sequential approval chain the offer is currently on (1-based). 0 when not yet submitted.';

-- Helpful index for "my pending approvals" queries
CREATE INDEX IF NOT EXISTS idx_offer_approvals_approver_status
    ON common.offer_approvals(approver_id, status);

-- Make sure approval_order ordering index exists
CREATE INDEX IF NOT EXISTS idx_offer_approvals_offer_order
    ON common.offer_approvals(offer_id, approval_order);
