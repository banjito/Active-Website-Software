-- Add job-related fields to opportunities table
-- These fields help track project details that will be used when converting opportunities to jobs

-- Add the new columns to the opportunities table
ALTER TABLE business.opportunities 
ADD COLUMN IF NOT EXISTS jobsite_location TEXT,
ADD COLUMN IF NOT EXISTS estimated_start_date DATE,
ADD COLUMN IF NOT EXISTS period_of_performance TEXT,
ADD COLUMN IF NOT EXISTS total_man_hours NUMERIC;

-- Add comments to document the purpose of each field
COMMENT ON COLUMN business.opportunities.jobsite_location IS 'The physical location/address where the work will be performed (different from customer address)';
COMMENT ON COLUMN business.opportunities.estimated_start_date IS 'Projected date when work is expected to begin';
COMMENT ON COLUMN business.opportunities.period_of_performance IS 'Duration or timeframe for completing the work (e.g., "2 weeks", "30 days")';
COMMENT ON COLUMN business.opportunities.total_man_hours IS 'Total estimated man hours required for the project, can be calculated from quotes';
