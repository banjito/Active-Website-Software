-- Add urgency classification to assets table
-- Run this in Supabase SQL Editor

-- Add urgency column to assets table (if it doesn't exist)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_schema = 'neta_ops' 
        AND table_name = 'assets' 
        AND column_name = 'urgency'
    ) THEN
        ALTER TABLE neta_ops.assets 
        ADD COLUMN urgency TEXT DEFAULT 'normal' 
        CHECK (urgency IN ('normal', 'critical'));
        
        -- Update existing records to have default urgency
        UPDATE neta_ops.assets SET urgency = 'normal' WHERE urgency IS NULL;
        
        COMMENT ON COLUMN neta_ops.assets.urgency IS 'Urgency classification for asset processing: normal (default) or critical (requires immediate attention)';
    END IF;
END $$;

-- Create index for performance on urgency queries
CREATE INDEX IF NOT EXISTS idx_assets_urgency ON neta_ops.assets(urgency) WHERE urgency = 'critical';

-- Verify the column was added
SELECT 
    column_name,
    data_type,
    column_default,
    is_nullable
FROM information_schema.columns 
WHERE table_schema = 'neta_ops' 
    AND table_name = 'assets'
    AND column_name = 'urgency';

-- Success message
SELECT 'Asset urgency column added successfully!' as result;

