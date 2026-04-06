-- Add 'subtract_from_total' to value_operation allowed values.
-- Run after job_contracts_actions_invoices_optional_file.sql (so value_operation column exists).

-- Drop existing check (Postgres often names it {table}_{column}_check)
ALTER TABLE neta_ops.job_contracts
  DROP CONSTRAINT IF EXISTS job_contracts_value_operation_check;

-- Re-add with subtract_from_total included
ALTER TABLE neta_ops.job_contracts
  ADD CONSTRAINT job_contracts_value_operation_check
  CHECK (value_operation IN ('add_to_total', 'subtract_from_total', 'subtract_from_remaining', 'add_to_remaining'));
