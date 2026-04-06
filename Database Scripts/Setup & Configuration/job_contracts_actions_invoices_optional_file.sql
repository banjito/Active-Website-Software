-- job_contracts: optional file, invoice type, value_operation for remaining balance
-- Run in Supabase SQL editor after job_contracts table exists.

-- 1. Allow NULL file_url and file_path (attachment optional)
ALTER TABLE neta_ops.job_contracts
  ALTER COLUMN file_url DROP NOT NULL,
  ALTER COLUMN file_path DROP NOT NULL;

-- 2. Add 'invoice' and 'purchase_order' to type (default inline CHECK name is job_contracts_type_check)
ALTER TABLE neta_ops.job_contracts
  DROP CONSTRAINT IF EXISTS job_contracts_type_check;

ALTER TABLE neta_ops.job_contracts
  ADD CONSTRAINT job_contracts_type_check
  CHECK (type IN ('main', 'subcontract', 'amendment', 'change_order', 'purchase_order', 'invoice'));

-- 3. Add value_operation column for remaining balance semantics
-- 'add_to_total' = adds to total contract value (contracts, POs, change orders)
-- 'subtract_from_total' = reduces total and remaining (e.g. discount)
-- 'subtract_from_remaining' = invoices (reduces remaining balance only)
-- 'add_to_remaining' = book corrections (adds back to remaining only)
ALTER TABLE neta_ops.job_contracts
  ADD COLUMN IF NOT EXISTS value_operation TEXT DEFAULT 'add_to_total'
  CHECK (value_operation IN ('add_to_total', 'subtract_from_total', 'subtract_from_remaining', 'add_to_remaining'));

-- Backfill: existing rows use value sign (positive = add_to_total, negative = subtract_from_remaining)
UPDATE neta_ops.job_contracts
  SET value_operation = CASE
    WHEN value IS NULL THEN 'add_to_total'
    WHEN value >= 0 THEN 'add_to_total'
    ELSE 'subtract_from_remaining'
  END
  WHERE value_operation IS NULL;

-- Store absolute value for backfilled subtract rows so display is consistent
UPDATE neta_ops.job_contracts
  SET value = ABS(value)
  WHERE value_operation = 'subtract_from_remaining' AND value < 0;

COMMENT ON COLUMN neta_ops.job_contracts.value_operation IS 'add_to_total: adds to Total Contract Value; subtract_from_total: reduces contract/remaining; subtract_from_remaining: invoices; add_to_remaining: book corrections';
