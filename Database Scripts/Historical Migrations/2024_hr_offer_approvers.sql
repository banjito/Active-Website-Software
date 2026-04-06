-- Add Global Offer Approvers Table
-- This table stores the list of users who can approve any offer letter

CREATE TABLE IF NOT EXISTS common.offer_approvers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    approver_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    approval_order INTEGER NOT NULL DEFAULT 1,
    is_active BOOLEAN DEFAULT TRUE,
    created_by UUID NOT NULL REFERENCES auth.users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(approver_id)
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_offer_approvers_approver_id ON common.offer_approvers(approver_id);
CREATE INDEX IF NOT EXISTS idx_offer_approvers_is_active ON common.offer_approvers(is_active);

-- Disable Row Level Security
ALTER TABLE common.offer_approvers DISABLE ROW LEVEL SECURITY;

-- Grant permissions
GRANT ALL ON common.offer_approvers TO authenticated;
GRANT ALL ON common.offer_approvers TO anon;

-- Add comment
COMMENT ON TABLE common.offer_approvers IS 'Global list of approvers who can approve any offer letter';

-- Create trigger for updated_at
DROP TRIGGER IF EXISTS update_offer_approvers_updated_at ON common.offer_approvers;
CREATE TRIGGER update_offer_approvers_updated_at
    BEFORE UPDATE ON common.offer_approvers
    FOR EACH ROW
    EXECUTE FUNCTION common.update_updated_at_column();
