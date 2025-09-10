-- Check and create subcontractor_agreements table
-- Run this in your Supabase SQL editor

-- First, let's check if the table exists
SELECT EXISTS (
   SELECT FROM information_schema.tables 
   WHERE table_schema = 'business' 
   AND table_name = 'subcontractor_agreements'
);

-- If the table doesn't exist, create it
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

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_subcontractor_agreements_opportunity_id ON business.subcontractor_agreements(opportunity_id);
CREATE INDEX IF NOT EXISTS idx_subcontractor_agreements_user_id ON business.subcontractor_agreements(user_id);
CREATE INDEX IF NOT EXISTS idx_subcontractor_agreements_status ON business.subcontractor_agreements(status);

-- Disable RLS completely
ALTER TABLE business.subcontractor_agreements DISABLE ROW LEVEL SECURITY;

-- Grant permissions to authenticated users
GRANT ALL ON business.subcontractor_agreements TO authenticated;
