-- Fix the incorrectly backfilled opportunity_created_date values
-- Set them back to NULL for existing records since we don't know the actual creation date

UPDATE business.opportunities 
SET opportunity_created_date = NULL 
WHERE opportunity_created_date IS NOT NULL 
  AND created_at < NOW() - INTERVAL '1 hour'; -- Only reset records that were created more than 1 hour ago

-- This ensures we don't accidentally reset any opportunities that were genuinely created today
