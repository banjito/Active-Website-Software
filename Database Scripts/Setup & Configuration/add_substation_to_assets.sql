-- Add substation column to assets table for PDF reports and other assets
-- Run this in Supabase SQL Editor

-- Add substation column if it doesn't exist
ALTER TABLE neta_ops.assets ADD COLUMN IF NOT EXISTS substation TEXT;

-- Add comment
COMMENT ON COLUMN neta_ops.assets.substation IS 'Substation name/location for the asset (used for grouping and filtering)';

-- Verify the column was added
SELECT 
    column_name,
    data_type,
    is_nullable
FROM information_schema.columns 
WHERE table_schema = 'neta_ops' 
    AND table_name = 'assets'
    AND column_name = 'substation';

-- Success message
SELECT 'Substation column added successfully!' as result;
