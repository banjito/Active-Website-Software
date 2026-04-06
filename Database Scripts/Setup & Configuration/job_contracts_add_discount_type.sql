-- Add 'discount' to allowed job_contracts action types.
-- Run in Supabase SQL editor. If you get "constraint does not exist", your table may use a different CHECK name; run the optional snippet at the end.

-- Drop existing type check (name may vary)
ALTER TABLE neta_ops.job_contracts
  DROP CONSTRAINT IF EXISTS job_contracts_type_check;

-- Re-add with discount included
ALTER TABLE neta_ops.job_contracts
  ADD CONSTRAINT job_contracts_type_check
  CHECK (type IN ('main', 'subcontract', 'amendment', 'change_order', 'purchase_order', 'invoice', 'discount'));
