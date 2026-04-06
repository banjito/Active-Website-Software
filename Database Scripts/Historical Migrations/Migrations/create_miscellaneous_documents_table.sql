-- Create miscellaneous_documents table for miscellaneous document management
-- Run this in your Supabase SQL editor

-- ============================================================================
-- CREATE MISCELLANEOUS DOCUMENTS TABLE
-- ============================================================================

-- Create miscellaneous_documents table to track miscellaneous document metadata
CREATE TABLE IF NOT EXISTS neta_ops.miscellaneous_documents (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  job_id UUID REFERENCES neta_ops.jobs(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id),
  name TEXT NOT NULL,
  description TEXT,
  file_url TEXT NOT NULL,
  file_path TEXT NOT NULL,
  file_type TEXT,
  file_size INTEGER,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for faster lookups
CREATE INDEX IF NOT EXISTS idx_miscellaneous_documents_job_id ON neta_ops.miscellaneous_documents(job_id);
CREATE INDEX IF NOT EXISTS idx_miscellaneous_documents_user_id ON neta_ops.miscellaneous_documents(user_id);

-- Enable RLS
ALTER TABLE neta_ops.miscellaneous_documents ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Enable read access for authenticated users" ON neta_ops.miscellaneous_documents;
DROP POLICY IF EXISTS "Enable insert access for authenticated users" ON neta_ops.miscellaneous_documents;
DROP POLICY IF EXISTS "Enable update access for authenticated users" ON neta_ops.miscellaneous_documents;
DROP POLICY IF EXISTS "Enable delete access for authenticated users" ON neta_ops.miscellaneous_documents;

-- Create RLS policies for miscellaneous_documents
CREATE POLICY "Enable read access for authenticated users" ON neta_ops.miscellaneous_documents
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Enable insert access for authenticated users" ON neta_ops.miscellaneous_documents
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Enable update access for authenticated users" ON neta_ops.miscellaneous_documents
  FOR UPDATE USING (auth.role() = 'authenticated');

CREATE POLICY "Enable delete access for authenticated users" ON neta_ops.miscellaneous_documents
  FOR DELETE USING (auth.role() = 'authenticated');

-- Grant permissions
GRANT ALL ON neta_ops.miscellaneous_documents TO authenticated;

-- ============================================================================
-- CREATE UPDATED_AT TRIGGER
-- ============================================================================

-- Create trigger for miscellaneous_documents updated_at
DROP TRIGGER IF EXISTS update_miscellaneous_documents_updated_at ON neta_ops.miscellaneous_documents;

CREATE TRIGGER update_miscellaneous_documents_updated_at
BEFORE UPDATE ON neta_ops.miscellaneous_documents
FOR EACH ROW
EXECUTE FUNCTION neta_ops.update_updated_at_column();

-- ============================================================================
-- VERIFICATION
-- ============================================================================

-- Verify table was created
SELECT table_name, column_name, data_type 
FROM information_schema.columns 
WHERE table_schema = 'neta_ops' AND table_name = 'miscellaneous_documents'
ORDER BY ordinal_position;

-- Show success message
SELECT 'Miscellaneous documents table created successfully!' as status;
