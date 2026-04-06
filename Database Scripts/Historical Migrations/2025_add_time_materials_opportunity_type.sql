-- Add 'time_materials' to opportunity_type enum
-- This allows tracking T&M (Time & Materials) opportunities separately from regular opportunities

-- Drop the existing constraint
ALTER TABLE business.opportunities
DROP CONSTRAINT IF EXISTS opportunities_opportunity_type_check;

-- Add the new constraint with 'time_materials' included
ALTER TABLE business.opportunities
ADD CONSTRAINT opportunities_opportunity_type_check 
CHECK (opportunity_type IN ('large_acceptance', 'small_acceptance', 'maintenance', 'other', 'time_materials'));

-- Update the comment to document the new type
COMMENT ON COLUMN business.opportunities.opportunity_type IS 
'Project type classification: large_acceptance (>=$100k), small_acceptance (<$100k), maintenance, other, or time_materials (T&M jobs). 
Acceptance projects auto-adjust based on quoted_amount.';

-- Update the auto-adjust function to exclude time_materials from auto-adjustment
CREATE OR REPLACE FUNCTION business.auto_adjust_opportunity_type()
RETURNS TRIGGER AS $$
BEGIN
    -- Only auto-adjust if the opportunity type is in the acceptance categories
    -- Don't auto-adjust time_materials, maintenance, or other types
    IF NEW.opportunity_type IN ('large_acceptance', 'small_acceptance') THEN
        -- If quoted_amount is >= $100,000, set to large_acceptance
        -- If quoted_amount is < $100,000, set to small_acceptance
        IF NEW.quoted_amount IS NOT NULL AND NEW.quoted_amount >= 100000 THEN
            NEW.opportunity_type := 'large_acceptance';
        ELSIF NEW.quoted_amount IS NOT NULL AND NEW.quoted_amount < 100000 THEN
            NEW.opportunity_type := 'small_acceptance';
        END IF;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
