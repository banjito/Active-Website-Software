-- Fix permissions for customer satisfaction materialized view
-- This fixes the issue where users can't delete customers due to materialized view permissions

-- Drop the existing trigger that causes permission issues
DROP TRIGGER IF EXISTS refresh_satisfaction_scores ON common.customer_surveys;

-- Drop the existing function
DROP FUNCTION IF EXISTS common.refresh_customer_satisfaction_scores();

-- Recreate the function with SECURITY DEFINER to run with elevated privileges
CREATE OR REPLACE FUNCTION common.refresh_customer_satisfaction_scores()
RETURNS TRIGGER 
SECURITY DEFINER
SET search_path = common, public
AS $$
BEGIN
  REFRESH MATERIALIZED VIEW common.customer_satisfaction_scores;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Recreate the trigger
CREATE TRIGGER refresh_satisfaction_scores
AFTER INSERT OR UPDATE OR DELETE ON common.customer_surveys
FOR EACH STATEMENT
EXECUTE FUNCTION common.refresh_customer_satisfaction_scores();

-- Also add a trigger for customer deletions to refresh the view
CREATE TRIGGER refresh_satisfaction_scores_on_customer_delete
AFTER DELETE ON common.customers
FOR EACH STATEMENT
EXECUTE FUNCTION common.refresh_customer_satisfaction_scores();

-- Grant necessary permissions to authenticated users
GRANT SELECT ON common.customer_satisfaction_scores TO authenticated;

-- Add a comment explaining the fix
COMMENT ON FUNCTION common.refresh_customer_satisfaction_scores() IS 'Refreshes customer satisfaction materialized view with elevated privileges to avoid permission errors'; 