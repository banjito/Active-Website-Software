-- Create table for storing QuickBooks OAuth tokens per user
-- This table stores the OAuth tokens needed to make QuickBooks API calls

CREATE TABLE IF NOT EXISTS common.quickbooks_integrations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    
    -- OAuth tokens
    access_token TEXT NOT NULL,
    refresh_token TEXT NOT NULL,
    token_expires_at TIMESTAMPTZ NOT NULL,
    
    -- QuickBooks company info
    realm_id TEXT, -- QuickBooks company ID
    company_name TEXT,
    
    -- Environment (sandbox or production)
    environment TEXT DEFAULT 'sandbox' CHECK (environment IN ('sandbox', 'production')),
    
    -- Status
    is_active BOOLEAN DEFAULT true,
    
    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Ensure one active integration per user
    UNIQUE(user_id, is_active) DEFERRABLE INITIALLY DEFERRED
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_quickbooks_integrations_user_id ON common.quickbooks_integrations(user_id);
CREATE INDEX IF NOT EXISTS idx_quickbooks_integrations_realm_id ON common.quickbooks_integrations(realm_id);
CREATE INDEX IF NOT EXISTS idx_quickbooks_integrations_active ON common.quickbooks_integrations(user_id, is_active) WHERE is_active = true;

-- Enable Row Level Security
ALTER TABLE common.quickbooks_integrations ENABLE ROW LEVEL SECURITY;

-- RLS Policies
-- Users can only see their own QuickBooks integrations
CREATE POLICY "Users can view their own QuickBooks integrations"
    ON common.quickbooks_integrations
    FOR SELECT
    USING (auth.uid() = user_id);

-- Users can insert their own QuickBooks integrations
CREATE POLICY "Users can insert their own QuickBooks integrations"
    ON common.quickbooks_integrations
    FOR INSERT
    WITH CHECK (auth.uid() = user_id);

-- Users can update their own QuickBooks integrations
CREATE POLICY "Users can update their own QuickBooks integrations"
    ON common.quickbooks_integrations
    FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- Users can delete their own QuickBooks integrations
CREATE POLICY "Users can delete their own QuickBooks integrations"
    ON common.quickbooks_integrations
    FOR DELETE
    USING (auth.uid() = user_id);

-- Grant permissions
GRANT ALL ON common.quickbooks_integrations TO authenticated;

-- Create function to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION common.update_quickbooks_integrations_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to update updated_at on row update
CREATE TRIGGER update_quickbooks_integrations_updated_at
    BEFORE UPDATE ON common.quickbooks_integrations
    FOR EACH ROW
    EXECUTE FUNCTION common.update_quickbooks_integrations_updated_at();

-- Add comment
COMMENT ON TABLE common.quickbooks_integrations IS 'Stores QuickBooks OAuth tokens and company information for each user';
