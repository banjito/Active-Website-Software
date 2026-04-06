-- Add signing_token field to offers table for public signing links
-- This allows candidates to sign offers via a secure token-based link

-- Add signing_token column if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'common' 
        AND table_name = 'offers' 
        AND column_name = 'signing_token'
    ) THEN
        ALTER TABLE common.offers 
        ADD COLUMN signing_token VARCHAR(255) UNIQUE;
        
        -- Create index for fast lookups
        CREATE INDEX IF NOT EXISTS idx_offers_signing_token 
        ON common.offers(signing_token) 
        WHERE signing_token IS NOT NULL;
    END IF;
END $$;

-- Add comment
COMMENT ON COLUMN common.offers.signing_token IS 'Unique token for public offer signing link. Generated when offer is sent.';
