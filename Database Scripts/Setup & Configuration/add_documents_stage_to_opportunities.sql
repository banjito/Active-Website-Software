-- Add documents_stage field to opportunities table
-- This field tracks the stage of documents/drawings for the opportunity
-- to help identify what will likely need to be re-bid in the future when new drawings are issued

-- Add the new column to the opportunities table
ALTER TABLE business.opportunities 
ADD COLUMN IF NOT EXISTS documents_stage TEXT;

-- Add comment to document the purpose of the field
COMMENT ON COLUMN business.opportunities.documents_stage IS 'Stage of documents/drawings for the opportunity. Options: Budgetary, Not available, Design Development, Issue for Proposal, Issue for Construction, Post Construction, 30%, 60%, 90%, 95%. Helps track what will likely need to be re-bid when new drawings are issued.';
