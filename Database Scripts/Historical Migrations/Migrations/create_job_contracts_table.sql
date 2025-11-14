-- Create job_contracts table for contract management
-- Run this in your Supabase SQL editor to fix the 404 error

-- ============================================================================
-- CREATE JOB CONTRACTS TABLE
-- ============================================================================

-- Create job_contracts table to track contract metadata
CREATE TABLE IF NOT EXISTS neta_ops.job_contracts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  job_id UUID REFERENCES neta_ops.jobs(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id),
  name TEXT NOT NULL,
  type TEXT DEFAULT 'main' CHECK (type IN ('main', 'subcontract', 'amendment', 'change_order')),
  description TEXT,
  file_url TEXT NOT NULL,
  file_path TEXT NOT NULL,
  file_type TEXT,
  file_size INTEGER,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'signed', 'expired', 'cancelled')),
  value NUMERIC,
  start_date DATE,
  end_date DATE,
  uploaded_date TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for faster lookups
CREATE INDEX IF NOT EXISTS idx_job_contracts_job_id ON neta_ops.job_contracts(job_id);
CREATE INDEX IF NOT EXISTS idx_job_contracts_user_id ON neta_ops.job_contracts(user_id);
CREATE INDEX IF NOT EXISTS idx_job_contracts_status ON neta_ops.job_contracts(status);
CREATE INDEX IF NOT EXISTS idx_job_contracts_type ON neta_ops.job_contracts(type);

-- Enable RLS
ALTER TABLE neta_ops.job_contracts ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Enable read access for authenticated users" ON neta_ops.job_contracts;
DROP POLICY IF EXISTS "Enable insert access for authenticated users" ON neta_ops.job_contracts;
DROP POLICY IF EXISTS "Enable update access for authenticated users" ON neta_ops.job_contracts;
DROP POLICY IF EXISTS "Enable delete access for authenticated users" ON neta_ops.job_contracts;

-- Create RLS policies for job_contracts
CREATE POLICY "Enable read access for authenticated users" ON neta_ops.job_contracts
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Enable insert access for authenticated users" ON neta_ops.job_contracts
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Enable update access for authenticated users" ON neta_ops.job_contracts
  FOR UPDATE USING (auth.role() = 'authenticated');

CREATE POLICY "Enable delete access for authenticated users" ON neta_ops.job_contracts
  FOR DELETE USING (auth.role() = 'authenticated');

-- Grant permissions
GRANT ALL ON neta_ops.job_contracts TO authenticated;

-- ============================================================================
-- CREATE UPDATED_AT TRIGGER
-- ============================================================================

-- Create or update trigger function for updated_at (if it doesn't exist)
CREATE OR REPLACE FUNCTION neta_ops.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for job_contracts updated_at
DROP TRIGGER IF EXISTS update_job_contracts_updated_at ON neta_ops.job_contracts;

CREATE TRIGGER update_job_contracts_updated_at
BEFORE UPDATE ON neta_ops.job_contracts
FOR EACH ROW
EXECUTE FUNCTION neta_ops.update_updated_at_column();

-- ============================================================================
-- VERIFICATION
-- ============================================================================

-- Verify table was created
SELECT table_name, column_name, data_type 
FROM information_schema.columns 
WHERE table_schema = 'neta_ops' AND table_name = 'job_contracts'
ORDER BY ordinal_position;

-- Show success message
SELECT 'Job contracts table created successfully!' as status;
