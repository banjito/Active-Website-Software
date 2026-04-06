-- Add opportunity_type column to the opportunities table
-- This column tracks the project type: Large Acceptance, Small Acceptance, Maintenance, or Other
-- Small/Large Acceptance projects auto-adjust based on quoted_amount ($100,000 threshold)

-- Add the new column to the opportunities table
ALTER TABLE business.opportunities 
ADD COLUMN IF NOT EXISTS opportunity_type TEXT DEFAULT 'other';

-- Add check constraint to validate opportunity_type values
ALTER TABLE business.opportunities
DROP CONSTRAINT IF EXISTS opportunities_opportunity_type_check;

ALTER TABLE business.opportunities
ADD CONSTRAINT opportunities_opportunity_type_check 
CHECK (opportunity_type IN ('large_acceptance', 'small_acceptance', 'maintenance', 'other'));

-- Add comment to document the purpose of the field
COMMENT ON COLUMN business.opportunities.opportunity_type IS 
'Project type classification: large_acceptance (>=$100k), small_acceptance (<$100k), maintenance, or other. 
Acceptance projects auto-adjust based on quoted_amount.';

-- Create a function to auto-adjust opportunity type based on quoted amount
CREATE OR REPLACE FUNCTION business.auto_adjust_opportunity_type()
RETURNS TRIGGER AS $$
BEGIN
    -- Only auto-adjust if the opportunity type is in the acceptance categories
    IF NEW.opportunity_type IN ('large_acceptance', 'small_acceptance') THEN
        -- If quoted_amount is >= $100,000, set to large_acceptance
        -- If quoted_amount is < $100,000, set to small_acceptance
        IF NEW.quoted_amount IS NOT NULL AND NEW.quoted_amount >= 100000 THEN
            NEW.opportunity_type := 'large_acceptance';
        ELSIF NEW.quoted_amount IS NOT NULL AND NEW.quoted_amount < 100000 THEN
            NEW.opportunity_type := 'small_acceptance';
        END IF;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to auto-adjust opportunity type on insert or update
DROP TRIGGER IF EXISTS opportunity_type_auto_adjust ON business.opportunities;

CREATE TRIGGER opportunity_type_auto_adjust
BEFORE INSERT OR UPDATE ON business.opportunities
FOR EACH ROW
EXECUTE FUNCTION business.auto_adjust_opportunity_type();

-- Verify the migration
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'business' 
        AND table_name = 'opportunities' 
        AND column_name = 'opportunity_type'
    ) THEN
        RAISE NOTICE 'SUCCESS: opportunity_type column has been added to business.opportunities';
    ELSE
        RAISE EXCEPTION 'ERROR: opportunity_type column was not created';
    END IF;
END $$;

