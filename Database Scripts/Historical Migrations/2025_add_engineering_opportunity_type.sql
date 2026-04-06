-- Add 'engineering' to opportunity_type
-- Replaces the non-working 'arc_flash_study' option (never in DB) with 'Engineering'

-- Drop the existing constraint
ALTER TABLE business.opportunities
DROP CONSTRAINT IF EXISTS opportunities_opportunity_type_check;

-- Add the new constraint with 'engineering' included
ALTER TABLE business.opportunities
ADD CONSTRAINT opportunities_opportunity_type_check 
CHECK (opportunity_type IN ('large_acceptance', 'small_acceptance', 'maintenance', 'other', 'time_materials', 'engineering'));

-- Update the comment to document the new type
COMMENT ON COLUMN business.opportunities.opportunity_type IS 
'Project type classification: large_acceptance (>=$100k), small_acceptance (<$100k), maintenance, other, time_materials (T&M), or engineering. 
Acceptance projects auto-adjust based on quoted_amount.';
