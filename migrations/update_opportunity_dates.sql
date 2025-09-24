-- Update opportunity date fields
-- Remove expected_close_date and add new date tracking fields

-- First, add the new date columns (allowing NULL for existing records)
ALTER TABLE business.opportunities 
ADD COLUMN IF NOT EXISTS opportunity_created_date TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS letter_proposal_created_date TIMESTAMP WITH TIME ZONE;

-- Don't backfill existing records - leave them blank since we don't know the actual opportunity creation date
-- Only new opportunities will get the auto-generated date

-- Set default for future records only (noon UTC to prevent timezone shifts)
ALTER TABLE business.opportunities 
ALTER COLUMN opportunity_created_date SET DEFAULT (CURRENT_DATE || ' 12:00:00+00')::TIMESTAMP WITH TIME ZONE;

-- Add comments to document the purpose of each field
COMMENT ON COLUMN business.opportunities.opportunity_created_date IS 'Date when the opportunity was first created (auto-generated)';
COMMENT ON COLUMN business.opportunities.letter_proposal_created_date IS 'Date when the letter proposal was created/saved (auto-generated when saving letter proposal)';

-- Remove the expected_close_date column
ALTER TABLE business.opportunities 
DROP COLUMN IF EXISTS expected_close_date;

-- Create trigger function to auto-set opportunity_created_date
CREATE OR REPLACE FUNCTION set_opportunity_created_date()
RETURNS TRIGGER AS $$
BEGIN
    -- Only set on INSERT, not UPDATE
    IF TG_OP = 'INSERT' THEN
        -- Set to today at noon UTC to prevent timezone shifts when displaying dates
        NEW.opportunity_created_date := (CURRENT_DATE || ' 12:00:00+00')::TIMESTAMP WITH TIME ZONE;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to auto-set opportunity_created_date on new opportunities
DROP TRIGGER IF EXISTS trigger_set_opportunity_created_date ON business.opportunities;
CREATE TRIGGER trigger_set_opportunity_created_date
    BEFORE INSERT ON business.opportunities
    FOR EACH ROW
    EXECUTE FUNCTION set_opportunity_created_date();
