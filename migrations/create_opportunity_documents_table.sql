-- Create opportunity_documents table
CREATE TABLE IF NOT EXISTS business.opportunity_documents (
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
CREATE INDEX IF NOT EXISTS idx_opportunity_documents_opportunity_id ON business.opportunity_documents(opportunity_id);
CREATE INDEX IF NOT EXISTS idx_opportunity_documents_user_id ON business.opportunity_documents(user_id);
CREATE INDEX IF NOT EXISTS idx_opportunity_documents_status ON business.opportunity_documents(status);

-- Add RLS policies
ALTER TABLE business.opportunity_documents ENABLE ROW LEVEL SECURITY;

-- Policy for users to see documents for opportunities they have access to
CREATE POLICY "Users can view opportunity documents" ON business.opportunity_documents
  FOR SELECT USING (
    auth.uid() IN (
      SELECT user_id FROM business.opportunity_permissions 
      WHERE opportunity_id = business.opportunity_documents.opportunity_id
    ) OR 
    auth.uid() IN (
      SELECT user_id FROM business.opportunities 
      WHERE id = business.opportunity_documents.opportunity_id
    )
  );

-- Policy for users to insert documents for opportunities they have access to
CREATE POLICY "Users can insert opportunity documents" ON business.opportunity_documents
  FOR INSERT WITH CHECK (
    auth.uid() IN (
      SELECT user_id FROM business.opportunity_permissions 
      WHERE opportunity_id = business.opportunity_documents.opportunity_id
    ) OR 
    auth.uid() IN (
      SELECT user_id FROM business.opportunities 
      WHERE id = business.opportunity_documents.opportunity_id
    )
  );

-- Policy for users to update documents they created
CREATE POLICY "Users can update opportunity documents" ON business.opportunity_documents
  FOR UPDATE USING (
    auth.uid() = business.opportunity_documents.user_id
  );

-- Policy for users to delete documents they created
CREATE POLICY "Users can delete opportunity documents" ON business.opportunity_documents
  FOR DELETE USING (
    auth.uid() = business.opportunity_documents.user_id
  );
