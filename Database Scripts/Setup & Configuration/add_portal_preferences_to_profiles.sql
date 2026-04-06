-- Add portal_preferences column to profiles table
-- This column stores user's home page customization preferences as JSON

-- Add the column (if it doesn't exist)
ALTER TABLE common.profiles 
ADD COLUMN IF NOT EXISTS portal_preferences JSONB DEFAULT NULL;

-- Add a comment to describe the column
COMMENT ON COLUMN common.profiles.portal_preferences IS 'JSON object storing user portal/home page preferences like section visibility';

-- Grant update permission on the column for authenticated users to update their own preferences
-- (The existing RLS policies on profiles should handle row-level access)

-- Example of what the portal_preferences JSON structure looks like:
-- {
--   "showWelcome": true,
--   "showMyShortcuts": true,
--   "showReviewShortcuts": true,
--   "showIssueShortcuts": true,
--   "showApprovedShortcuts": true,
--   "hiddenPortals": [],
--   "defaultToShowShortcuts": false,
--   "defaultToShowReviewShortcuts": false,
--   "defaultToShowIssueShortcuts": false,
--   "defaultToShowApprovedShortcuts": true
-- }



