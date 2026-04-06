-- Add review columns to assets table for approval workflow
-- Run this in Supabase SQL Editor

-- Add review_comments column if it doesn't exist
ALTER TABLE neta_ops.assets ADD COLUMN IF NOT EXISTS review_comments TEXT;

-- Add reviewed_at column if it doesn't exist
ALTER TABLE neta_ops.assets ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ;

-- Add reviewed_by column if it doesn't exist (stores user UUID who reviewed)
ALTER TABLE neta_ops.assets ADD COLUMN IF NOT EXISTS reviewed_by UUID;

-- Add comments
COMMENT ON COLUMN neta_ops.assets.review_comments IS 'Comments from reviewer when approving or rejecting an asset';
COMMENT ON COLUMN neta_ops.assets.reviewed_at IS 'Timestamp when the asset was reviewed';
COMMENT ON COLUMN neta_ops.assets.reviewed_by IS 'UUID of the user who reviewed the asset';

-- Verify the columns were added
SELECT 
    column_name,
    data_type,
    is_nullable
FROM information_schema.columns 
WHERE table_schema = 'neta_ops' 
    AND table_name = 'assets'
    AND column_name IN ('review_comments', 'reviewed_at', 'reviewed_by');

-- Success message
SELECT 'Review columns added successfully!' as result;

