-- Add hidden column to profiles table
-- This column allows authorized users (john.chambers@ampqes.com) to hide profiles
-- for users who have been terminated or should not be visible

-- Add the column (if it doesn't exist)
ALTER TABLE common.profiles 
ADD COLUMN IF NOT EXISTS hidden BOOLEAN DEFAULT FALSE;

-- Add a comment to describe the column
COMMENT ON COLUMN common.profiles.hidden IS 'Flag to hide profile from general view. Only visible to authorized administrators.';

-- Create an index for filtering hidden profiles
CREATE INDEX IF NOT EXISTS idx_profiles_hidden ON common.profiles(hidden) WHERE hidden = TRUE;

-- Note: RLS policies should allow authorized users to update this field
-- The application logic will handle the visibility filtering based on user permissions
