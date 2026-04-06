-- HR Portal - Offers System
-- Schema for offer letters, approvals, e-signatures, and compensation details

-- Offer Templates Table
CREATE TABLE IF NOT EXISTS common.offer_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    template_content TEXT NOT NULL,
    is_default BOOLEAN DEFAULT FALSE,
    created_by UUID NOT NULL REFERENCES auth.users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Offers Table
CREATE TABLE IF NOT EXISTS common.offers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    candidate_id UUID NOT NULL REFERENCES common.candidates(id) ON DELETE CASCADE,
    requisition_id UUID REFERENCES common.job_requisitions(id),
    template_id UUID REFERENCES common.offer_templates(id),
    
    -- Position Details
    position_title VARCHAR(255) NOT NULL,
    department VARCHAR(100) NOT NULL,
    employment_type VARCHAR(50) NOT NULL CHECK (employment_type IN ('full-time', 'part-time', 'contract', 'temporary')),
    start_date DATE,
    location VARCHAR(255),
    reporting_manager VARCHAR(255),
    
    -- Compensation Details
    base_salary DECIMAL(10, 2),
    salary_currency VARCHAR(3) DEFAULT 'USD',
    pay_frequency VARCHAR(20) CHECK (pay_frequency IN ('hourly', 'weekly', 'bi-weekly', 'monthly', 'annual')),
    bonus_amount DECIMAL(10, 2),
    bonus_description TEXT,
    equity_compensation TEXT,
    benefits_summary TEXT,
    
    -- Offer Status
    status VARCHAR(20) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'pending_approval', 'approved', 'sent', 'accepted', 'declined', 'expired', 'withdrawn')),
    
    -- Offer Letter Content
    offer_letter_content TEXT,
    custom_fields JSONB DEFAULT '{}',
    
    -- Dates
    offer_date DATE,
    expiration_date DATE,
    sent_date TIMESTAMP WITH TIME ZONE,
    accepted_date TIMESTAMP WITH TIME ZONE,
    declined_date TIMESTAMP WITH TIME ZONE,
    
    -- E-Signature
    signature_status VARCHAR(20) DEFAULT 'pending' CHECK (signature_status IN ('pending', 'signed', 'declined')),
    signature_data JSONB,
    signed_at TIMESTAMP WITH TIME ZONE,
    
    -- Metadata
    created_by UUID NOT NULL REFERENCES auth.users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Offer Approvals Table
CREATE TABLE IF NOT EXISTS common.offer_approvals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    offer_id UUID NOT NULL REFERENCES common.offers(id) ON DELETE CASCADE,
    approver_id UUID NOT NULL REFERENCES auth.users(id),
    approval_order INTEGER NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'skipped')),
    comments TEXT,
    approved_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Global Offer Approvers Table
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

-- E-Signatures Table
CREATE TABLE IF NOT EXISTS common.e_signatures (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    offer_id UUID NOT NULL REFERENCES common.offers(id) ON DELETE CASCADE,
    signer_type VARCHAR(20) NOT NULL CHECK (signer_type IN ('candidate', 'manager', 'hr')),
    signer_id UUID,
    signer_email VARCHAR(255),
    signer_name VARCHAR(255),
    signature_image TEXT,
    signature_data JSONB,
    ip_address VARCHAR(45),
    user_agent TEXT,
    signed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_offers_candidate_id ON common.offers(candidate_id);
CREATE INDEX IF NOT EXISTS idx_offers_requisition_id ON common.offers(requisition_id);
CREATE INDEX IF NOT EXISTS idx_offers_status ON common.offers(status);
CREATE INDEX IF NOT EXISTS idx_offers_created_by ON common.offers(created_by);
CREATE INDEX IF NOT EXISTS idx_offer_approvals_offer_id ON common.offer_approvals(offer_id);
CREATE INDEX IF NOT EXISTS idx_offer_approvals_approver_id ON common.offer_approvals(approver_id);
CREATE INDEX IF NOT EXISTS idx_offer_approvals_status ON common.offer_approvals(status);
CREATE INDEX IF NOT EXISTS idx_e_signatures_offer_id ON common.e_signatures(offer_id);
CREATE INDEX IF NOT EXISTS idx_offer_templates_is_default ON common.offer_templates(is_default);
CREATE INDEX IF NOT EXISTS idx_offer_approvers_approver_id ON common.offer_approvers(approver_id);
CREATE INDEX IF NOT EXISTS idx_offer_approvers_is_active ON common.offer_approvers(is_active);

-- Disable Row Level Security - no restrictions needed (matching pattern from other HR tables)
ALTER TABLE common.offer_templates DISABLE ROW LEVEL SECURITY;
ALTER TABLE common.offers DISABLE ROW LEVEL SECURITY;
ALTER TABLE common.offer_approvals DISABLE ROW LEVEL SECURITY;
ALTER TABLE common.offer_approvers DISABLE ROW LEVEL SECURITY;
ALTER TABLE common.e_signatures DISABLE ROW LEVEL SECURITY;

-- Grant explicit permissions to authenticated users
GRANT ALL ON common.offer_templates TO authenticated;
GRANT ALL ON common.offer_templates TO anon;
GRANT ALL ON common.offers TO authenticated;
GRANT ALL ON common.offers TO anon;
GRANT ALL ON common.offer_approvals TO authenticated;
GRANT ALL ON common.offer_approvals TO anon;
GRANT ALL ON common.offer_approvers TO authenticated;
GRANT ALL ON common.offer_approvers TO anon;
GRANT ALL ON common.e_signatures TO authenticated;
GRANT ALL ON common.e_signatures TO anon;

-- Add comments
COMMENT ON TABLE common.offer_templates IS 'Templates for offer letters with customizable content';
COMMENT ON TABLE common.offers IS 'Job offers with compensation details and approval workflow';
COMMENT ON TABLE common.offer_approvals IS 'Approval workflow for offers requiring manager/HR sign-off';
COMMENT ON TABLE common.offer_approvers IS 'Global list of approvers who can approve any offer letter';
COMMENT ON TABLE common.e_signatures IS 'Electronic signatures for offer acceptance';

-- Create triggers for updated_at
DROP TRIGGER IF EXISTS update_offer_templates_updated_at ON common.offer_templates;
CREATE TRIGGER update_offer_templates_updated_at
    BEFORE UPDATE ON common.offer_templates
    FOR EACH ROW
    EXECUTE FUNCTION common.update_updated_at_column();

DROP TRIGGER IF EXISTS update_offers_updated_at ON common.offers;
CREATE TRIGGER update_offers_updated_at
    BEFORE UPDATE ON common.offers
    FOR EACH ROW
    EXECUTE FUNCTION common.update_updated_at_column();

DROP TRIGGER IF EXISTS update_offer_approvals_updated_at ON common.offer_approvals;
CREATE TRIGGER update_offer_approvals_updated_at
    BEFORE UPDATE ON common.offer_approvals
    FOR EACH ROW
    EXECUTE FUNCTION common.update_updated_at_column();

DROP TRIGGER IF EXISTS update_offer_approvers_updated_at ON common.offer_approvers;
CREATE TRIGGER update_offer_approvers_updated_at
    BEFORE UPDATE ON common.offer_approvers
    FOR EACH ROW
    EXECUTE FUNCTION common.update_updated_at_column();
