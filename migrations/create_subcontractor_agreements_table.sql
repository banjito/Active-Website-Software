-- Create subcontractor_agreements table
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

-- Policy for users to see documents for opportunities they have access to
CREATE POLICY "Users can view subcontractor agreements" ON business.subcontractor_agreements
  FOR SELECT USING (
    auth.uid() IN (
      SELECT user_id FROM business.opportunity_permissions 
      WHERE opportunity_id = business.subcontractor_agreements.opportunity_id
    ) OR 
    auth.uid() IN (
      SELECT user_id FROM business.opportunities 
      WHERE id = business.subcontractor_agreements.opportunity_id
    )
  );

-- Policy for users to insert documents for opportunities they have access to
CREATE POLICY "Users can insert subcontractor agreements" ON business.subcontractor_agreements
  FOR INSERT WITH CHECK (
    auth.uid() IN (
      SELECT user_id FROM business.opportunity_permissions 
      WHERE opportunity_id = business.subcontractor_agreements.opportunity_id
    ) OR 
    auth.uid() IN (
      SELECT user_id FROM business.opportunities 
      WHERE id = business.subcontractor_agreements.opportunity_id
    )
  );

-- Policy for users to update documents they created
CREATE POLICY "Users can update subcontractor agreements" ON business.subcontractor_agreements
  FOR UPDATE USING (
    auth.uid() = business.subcontractor_agreements.user_id
  );

-- Policy for users to delete documents they created
CREATE POLICY "Users can delete subcontractor agreements" ON business.subcontractor_agreements
  FOR DELETE USING (
    auth.uid() = business.subcontractor_agreements.user_id
  );
