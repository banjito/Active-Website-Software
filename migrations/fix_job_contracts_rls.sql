-- Step 3: Add RLS policies (run after table creation)
ALTER TABLE neta_ops.job_contracts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Enable read access for authenticated users" ON neta_ops.job_contracts
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Enable insert access for authenticated users" ON neta_ops.job_contracts
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Enable update access for authenticated users" ON neta_ops.job_contracts
  FOR UPDATE USING (auth.role() = 'authenticated');

CREATE POLICY "Enable delete access for authenticated users" ON neta_ops.job_contracts
  FOR DELETE USING (auth.role() = 'authenticated');

GRANT ALL ON neta_ops.job_contracts TO authenticated;
