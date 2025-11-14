-- Fix quoted_amount field to only contain actual quoted amounts, not expected values
-- This will set quoted_amount to NULL for records where it equals expected_value
-- (assuming these were incorrectly populated)

UPDATE business.opportunities 
SET quoted_amount = NULL 
WHERE quoted_amount = expected_value 
   OR quoted_amount IS NOT NULL 
   AND expected_value IS NOT NULL 
   AND quoted_amount = expected_value;

-- Show the results
SELECT 
    id,
    title,
    expected_value,
    quoted_amount,
    CASE 
        WHEN expected_value = quoted_amount THEN 'SAME - NEEDS FIX'
        WHEN quoted_amount IS NULL THEN 'NULL - CORRECT'
        WHEN expected_value IS NULL THEN 'EXPECTED_NULL'
        ELSE 'DIFFERENT - OK'
    END as status
FROM business.opportunities 
WHERE expected_value IS NOT NULL OR quoted_amount IS NOT NULL
ORDER BY created_at DESC
LIMIT 20;
