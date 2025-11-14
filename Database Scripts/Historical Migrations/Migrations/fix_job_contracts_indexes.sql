-- Step 2: Add indexes (run after table creation)
CREATE INDEX IF NOT EXISTS idx_job_contracts_job_id ON neta_ops.job_contracts(job_id);
CREATE INDEX IF NOT EXISTS idx_job_contracts_user_id ON neta_ops.job_contracts(user_id);
CREATE INDEX IF NOT EXISTS idx_job_contracts_status ON neta_ops.job_contracts(status);
CREATE INDEX IF NOT EXISTS idx_job_contracts_type ON neta_ops.job_contracts(type);
