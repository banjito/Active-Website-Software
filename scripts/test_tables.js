import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing required environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function testTables() {
  try {
    console.log('Testing table access...');
    
    // Test if subcontractor_agreements exists
    const { data: agreements, error: agreementsError } = await supabase
      .schema('business')
      .from('subcontractor_agreements')
      .select('*')
      .limit(1);
    
    if (agreementsError) {
      console.log('❌ subcontractor_agreements table does not exist or is not accessible');
      console.log('Error:', agreementsError);
    } else {
      console.log('✅ subcontractor_agreements table exists');
    }

    // Test if opportunities exists
    const { data: opportunities, error: opportunitiesError } = await supabase
      .schema('business')
      .from('opportunities')
      .select('*')
      .limit(1);
    
    if (opportunitiesError) {
      console.log('❌ opportunities table does not exist or is not accessible');
      console.log('Error:', opportunitiesError);
    } else {
      console.log('✅ opportunities table exists');
    }

    // List all tables in business schema
    const { data: tables, error: tablesError } = await supabase
      .from('pg_tables')
      .select('tablename')
      .eq('schemaname', 'business');
    
    if (tablesError) {
      console.log('❌ Could not list tables');
      console.log('Error:', tablesError);
    } else {
      console.log('📋 Tables in business schema:');
      tables.forEach(table => {
        console.log(`  - ${table.tablename}`);
      });
    }

  } catch (error) {
    console.error('Error:', error);
  }
}

testTables();
