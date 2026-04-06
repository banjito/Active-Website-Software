-- Add interview_stage column to existing interviews table
-- Migration script for adding interview stage field

-- Add interview_stage column if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_schema = 'common' 
        AND table_name = 'interviews' 
        AND column_name = 'interview_stage'
    ) THEN
        ALTER TABLE common.interviews 
        ADD COLUMN interview_stage VARCHAR(50) NOT NULL DEFAULT 'initial_culture' 
        CHECK (interview_stage IN ('initial_culture', 'technical', 'final'));
    END IF;
END $$;

-- Add comment
COMMENT ON COLUMN common.interviews.interview_stage IS 'Stage of the interview: initial_culture (30 min default), technical (60 min default), or final (60 min default)';
