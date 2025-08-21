-- Ensure the neta_ops.job_number_seq sequence is accessible to app roles
DO $$
BEGIN
  -- Grant USAGE so nextval() works during inserts
  EXECUTE 'GRANT USAGE ON SEQUENCE neta_ops.job_number_seq TO anon, authenticated';

  -- Optional: allow reading current value (not strictly required for nextval)
  EXECUTE 'GRANT SELECT ON SEQUENCE neta_ops.job_number_seq TO anon, authenticated';
END $$;

-- (Optional) Make the generator function run with owner rights to avoid role issues
-- Also set a controlled search_path to find the sequence reliably
CREATE OR REPLACE FUNCTION neta_ops.generate_job_number()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = neta_ops, public
AS $$
BEGIN
  NEW.job_number := nextval('neta_ops.job_number_seq')::text;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

