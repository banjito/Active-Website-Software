-- Remove the NOT NULL constraint from opportunity_created_date if it exists
-- This allows existing records to have NULL values

ALTER TABLE business.opportunities 
ALTER COLUMN opportunity_created_date DROP NOT NULL;

-- Set all existing records to NULL since we don't know their actual creation date
UPDATE business.opportunities 
SET opportunity_created_date = NULL 
WHERE opportunity_created_date IS NOT NULL;

-- Set default for future records
ALTER TABLE business.opportunities 
ALTER COLUMN opportunity_created_date SET DEFAULT NOW();
