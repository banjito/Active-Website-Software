-- Minimal job_contracts table - just to save PDFs
CREATE TABLE neta_ops.job_contracts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  job_id UUID NOT NULL,
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  type TEXT DEFAULT 'main',
  description TEXT,
  file_url TEXT NOT NULL,
  file_path TEXT NOT NULL,
  file_type TEXT,
  file_size INTEGER,
  status TEXT DEFAULT 'pending',
  value NUMERIC,
  start_date DATE,
  end_date DATE,
  uploaded_date TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE neta_ops.job_contracts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all for authenticated users" ON neta_ops.job_contracts
FOR ALL USING (auth.role() = 'authenticated');

GRANT ALL ON neta_ops.job_contracts TO authenticated;
