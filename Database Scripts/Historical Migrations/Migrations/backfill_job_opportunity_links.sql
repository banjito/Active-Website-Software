-- Backfill opportunity_id for existing jobs
-- This script attempts to match existing jobs to their opportunities

-- First, let's see what we're working with
SELECT 
    'Jobs without opportunity_id' as type,
    COUNT(*) as count
FROM neta_ops.jobs 
WHERE opportunity_id IS NULL

UNION ALL

SELECT 
    'Opportunities with job_id' as type,
    COUNT(*) as count
FROM business.opportunities 
WHERE job_id IS NOT NULL;

-- Method 1: Match jobs to opportunities using job_id (reverse link)
-- This works if opportunities have job_id set
UPDATE neta_ops.jobs 
SET opportunity_id = opp.id
FROM business.opportunities opp
WHERE neta_ops.jobs.id = opp.job_id 
  AND neta_ops.jobs.opportunity_id IS NULL;

-- Method 2: Match by customer_id and similar titles (fuzzy matching)
-- This is more risky but might catch some cases
UPDATE neta_ops.jobs 
SET opportunity_id = opp.id
FROM business.opportunities opp
WHERE neta_ops.jobs.customer_id = opp.customer_id
  AND neta_ops.jobs.title ILIKE '%' || opp.title || '%'
  AND neta_ops.jobs.opportunity_id IS NULL
  AND opp.job_id IS NULL; -- Don't double-link

-- Show results
SELECT 
    'Jobs now linked to opportunities' as type,
    COUNT(*) as count
FROM neta_ops.jobs 
WHERE opportunity_id IS NOT NULL

UNION ALL

SELECT 
    'Jobs still unlinked' as type,
    COUNT(*) as count
FROM neta_ops.jobs 
WHERE opportunity_id IS NULL;

-- Show some examples of linked jobs
SELECT 
    j.id as job_id,
    j.title as job_title,
    j.opportunity_id,
    o.title as opportunity_title,
    o.quoted_amount,
    o.expected_value
FROM neta_ops.jobs j
JOIN business.opportunities o ON j.opportunity_id = o.id
LIMIT 10;
