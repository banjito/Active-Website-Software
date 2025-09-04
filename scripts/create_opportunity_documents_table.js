const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing required environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function createOpportunityDocumentsTable() {
  try {
    console.log('Creating opportunity_documents table...');
    
    // First, drop the table if it exists to avoid conflicts
    await supabase.rpc('exec_sql', {
      sql: `DROP TABLE IF EXISTS business.opportunity_documents CASCADE;`
    });
    
    const { error } = await supabase.rpc('exec_sql', {
      sql: `
        -- Create opportunity_documents table
        CREATE TABLE business.opportunity_documents (
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
        CREATE INDEX idx_opportunity_documents_opportunity_id ON business.opportunity_documents(opportunity_id);
        CREATE INDEX idx_opportunity_documents_user_id ON business.opportunity_documents(user_id);
        CREATE INDEX idx_opportunity_documents_status ON business.opportunity_documents(status);

        -- Add RLS policies
        ALTER TABLE business.opportunity_documents ENABLE ROW LEVEL SECURITY;

        -- Simple policy for authenticated users
        CREATE POLICY "Authenticated users can manage opportunity documents" ON business.opportunity_documents
          FOR ALL USING (auth.role() = 'authenticated');
      `
    });

    if (error) {
      console.error('Error creating table:', error);
      return;
    }

    console.log('✅ opportunity_documents table created successfully!');
  } catch (error) {
    console.error('Error:', error);
  }
}

createOpportunityDocumentsTable();
