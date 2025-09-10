-- Create subcontractor_agreements table
-- Run this in your Supabase SQL editor

CREATE TABLE IF NOT EXISTS business.subcontractor_agreements (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  opportunity_id UUID REFERENCES business.opportunities(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id),
  name TEXT NOT NULL,
  file_url TEXT NOT NULL,
  upload_date TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'signed', 'expired', 'cancelled')),
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_subcontractor_agreements_opportunity_id ON business.subcontractor_agreements(opportunity_id);
CREATE INDEX IF NOT EXISTS idx_subcontractor_agreements_user_id ON business.subcontractor_agreements(user_id);
CREATE INDEX IF NOT EXISTS idx_subcontractor_agreements_status ON business.subcontractor_agreements(status);

-- Add RLS policies
ALTER TABLE business.subcontractor_agreements ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Allow authenticated users to access subcontractor agreements" ON business.subcontractor_agreements;
DROP POLICY IF EXISTS "Enable read access for authenticated users" ON business.subcontractor_agreements;
DROP POLICY IF EXISTS "Enable insert access for authenticated users" ON business.subcontractor_agreements;
DROP POLICY IF EXISTS "Enable update access for authenticated users" ON business.subcontractor_agreements;
DROP POLICY IF EXISTS "Enable delete access for authenticated users" ON business.subcontractor_agreements;

-- Create more permissive policies
CREATE POLICY "Enable read access for authenticated users" ON business.subcontractor_agreements
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Enable insert access for authenticated users" ON business.subcontractor_agreements
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Enable update access for authenticated users" ON business.subcontractor_agreements
  FOR UPDATE USING (auth.role() = 'authenticated');

CREATE POLICY "Enable delete access for authenticated users" ON business.subcontractor_agreements
  FOR DELETE USING (auth.role() = 'authenticated');
