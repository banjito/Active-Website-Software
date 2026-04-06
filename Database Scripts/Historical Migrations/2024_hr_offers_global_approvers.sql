-- Global Approvers for Offer Approvals
-- This table stores approvers that can approve any offer letter

CREATE TABLE IF NOT EXISTS common.offer_global_approvers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    approver_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    approver_order INTEGER NOT NULL DEFAULT 1,
    is_active BOOLEAN DEFAULT TRUE,
    created_by UUID NOT NULL REFERENCES auth.users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(approver_id)
);

-- Create index for better query performance
CREATE INDEX IF NOT EXISTS idx_offer_global_approvers_approver_id ON common.offer_global_approvers(approver_id);
CREATE INDEX IF NOT EXISTS idx_offer_global_approvers_is_active ON common.offer_global_approvers(is_active);
CREATE INDEX IF NOT EXISTS idx_offer_global_approvers_approver_order ON common.offer_global_approvers(approver_order);

-- Disable Row Level Security
ALTER TABLE common.offer_global_approvers DISABLE ROW LEVEL SECURITY;

-- Grant explicit permissions
GRANT ALL ON common.offer_global_approvers TO authenticated;
GRANT ALL ON common.offer_global_approvers TO anon;

-- Create trigger for updated_at
DROP TRIGGER IF EXISTS update_offer_global_approvers_updated_at ON common.offer_global_approvers;
CREATE TRIGGER update_offer_global_approvers_updated_at
    BEFORE UPDATE ON common.offer_global_approvers
    FOR EACH ROW
    EXECUTE FUNCTION common.update_updated_at_column();

COMMENT ON TABLE common.offer_global_approvers IS 'Global list of approvers who can approve any offer letter';
