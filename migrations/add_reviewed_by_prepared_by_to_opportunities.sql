-- Add reviewed_by and prepared_by columns to opportunities table
-- These fields are optional and can be filled out after opportunity creation

-- Add the new columns
ALTER TABLE business.opportunities 
ADD COLUMN IF NOT EXISTS reviewed_by TEXT,
ADD COLUMN IF NOT EXISTS prepared_by TEXT;

-- Add comments to document the purpose of these fields
COMMENT ON COLUMN business.opportunities.reviewed_by IS 'Name of the person who reviewed the estiamte';
COMMENT ON COLUMN business.opportunities.prepared_by IS 'Name of the person who prepared the estimate (auto-populated from estimate creators)';

-- Add user_id column to estimates table to track who created each estimate
ALTER TABLE business.estimates 
ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id);

-- Add comment to document the purpose of this field
COMMENT ON COLUMN business.estimates.user_id IS 'User who created this estimate';

-- These fields are optional and don't require any constraints
-- They can be updated after opportunity creation as requested
