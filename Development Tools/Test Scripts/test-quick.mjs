import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://vdxprdihmbqomwqfldpo.supabase.co';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SERVICE_KEY) {
  console.log('❌ Need your service role key!');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

async function quickTest() {
  console.log('🔍 Checking for reports ready for review...');
  
  try {
    const { data: assets, error } = await supabase
      .schema('neta_ops')
      .from('assets')
      .select('id, name, status')
      .eq('status', 'ready_for_review');

    if (error) {
      console.error('❌ Error:', error);
      return;
    }

    console.log(`\n✅ Found ${assets?.length || 0} assets ready for review`);
    
    if (assets && assets.length > 0) {
      console.log('\nAssets ready for review:');
      assets.forEach((asset, i) => {
        console.log(`  ${i+1}. ${asset.name}`);
      });
      console.log('\n🎉 Great! You have data for the email system!');
    } else {
      console.log('\n📝 No assets marked "ready_for_review" yet.');
      console.log('\n💡 To test this system:');
      console.log('1. Go to a job in your AMP system');
      console.log('2. Find an asset (report) in that job');
      console.log('3. Change its status to "Ready for Review"');
      console.log('4. Run this test again');
    }
  } catch (err) {
    console.error('❌ Error:', err.message);
  }
}

quickTest();
