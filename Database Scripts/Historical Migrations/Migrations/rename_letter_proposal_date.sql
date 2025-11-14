-- Rename letter_proposal_created_date to letter_proposal_date
-- This handles the case where the old column name was already created

-- Check if the old column exists and rename it
DO $$ 
BEGIN
    -- Check if old column exists
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'business' 
        AND table_name = 'opportunities' 
        AND column_name = 'letter_proposal_created_date'
    ) THEN
        -- Rename the column
        ALTER TABLE business.opportunities 
        RENAME COLUMN letter_proposal_created_date TO letter_proposal_date;
        
        -- Update the comment
        COMMENT ON COLUMN business.opportunities.letter_proposal_date IS 'Date when the letter proposal was created/saved (auto-generated when generating letter proposal, but editable)';
        
        RAISE NOTICE 'Column letter_proposal_created_date renamed to letter_proposal_date';
    ELSE
        RAISE NOTICE 'Column letter_proposal_created_date does not exist, no action needed';
    END IF;
END $$;
