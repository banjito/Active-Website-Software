import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.VITE_SUPABASE_SERVICE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('❌ Missing environment variables. Please set VITE_SUPABASE_URL and VITE_SUPABASE_SERVICE_KEY');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

async function testPendingApprovalWorkflow() {
  try {
    console.log('🔍 Testing Pending Approval Workflow...');
    console.log(`🕐 Current Time: ${new Date().toLocaleString('en-US', { timeZone: 'America/Chicago' })} (Central Time)`);
    console.log('');

    // Step 1: Check current assets ready for review
    console.log('📋 Step 1: Checking current assets ready for review...');
    const { data: assetsData, error: assetsError } = await supabase
      .schema('neta_ops')
      .from('assets')
      .select('id, name, created_at, status, file_url')
      .eq('status', 'ready_for_review')
      .order('created_at', { ascending: true });

    if (assetsError) {
      console.error('❌ Error fetching assets:', assetsError);
      return;
    }

    console.log(`   Found ${assetsData?.length || 0} assets ready for review`);
    
    if (!assetsData || assetsData.length === 0) {
      console.log('');
      console.log('ℹ️  No assets are currently marked as "ready_for_review"');
      console.log('   To test this workflow:');
      console.log('   1. Go to a job in your system');
      console.log('   2. Change an asset status to "Ready for Review"');
      console.log('   3. Run this test again');
      return;
    }

    // Step 2: Check technical reports
    console.log('📄 Step 2: Checking technical reports...');
    const { data: reportsData, error: reportsError } = await supabase
      .schema('neta_ops')
      .from('technical_reports')
      .select('id, title, status, created_at, job_id')
      .eq('status', 'submitted')
      .order('created_at', { ascending: true });

    if (reportsError) {
      console.error('❌ Error fetching technical reports:', reportsError);
      return;
    }

    console.log(`   Found ${reportsData?.length || 0} technical reports with status 'submitted'`);

    // Step 3: Check asset_reports links
    console.log('🔗 Step 3: Checking asset_reports links...');
    const { data: assetReportsData, error: assetReportsError } = await supabase
      .schema('neta_ops')
      .from('asset_reports')
      .select('asset_id, report_id')
      .order('asset_id', { ascending: true });

    if (assetReportsError) {
      if (assetReportsError.code === 'PGRST106' || assetReportsError.message?.includes('does not exist')) {
        console.log('   ℹ️  asset_reports table does not exist yet');
      } else {
        console.error('❌ Error fetching asset_reports:', assetReportsError);
        return;
      }
    } else {
      console.log(`   Found ${assetReportsData?.length || 0} asset-report links`);
    }

    // Step 4: Cross-reference assets and reports
    console.log('🔍 Step 4: Cross-referencing assets and reports...');
    
    const assetsWithReports = [];
    const assetsWithoutReports = [];
    
    for (const asset of assetsData) {
      const linkedReport = assetReportsData?.find(link => link.asset_id === asset.id);
      if (linkedReport) {
        const report = reportsData?.find(r => r.id === linkedReport.report_id);
        if (report) {
          assetsWithReports.push({ asset, report });
        } else {
          assetsWithoutReports.push({ asset, reason: 'Linked report not found in submitted reports' });
        }
      } else {
        assetsWithoutReports.push({ asset, reason: 'No asset_report link found' });
      }
    }

    console.log(`   Assets with linked reports: ${assetsWithReports.length}`);
    console.log(`   Assets without linked reports: ${assetsWithoutReports.length}`);

    if (assetsWithoutReports.length > 0) {
      console.log('');
      console.log('⚠️  Assets ready for review without linked reports:');
      assetsWithoutReports.forEach(({ asset, reason }) => {
        console.log(`   - ${asset.name} (${asset.id}): ${reason}`);
      });
    }

    if (assetsWithReports.length > 0) {
      console.log('');
      console.log('✅ Assets ready for review with linked reports:');
      assetsWithReports.forEach(({ asset, report }) => {
        console.log(`   - ${asset.name} (${asset.id}) -> ${report.title} (${report.id})`);
      });
    }

    // Step 5: Check for orphaned reports
    console.log('👻 Step 5: Checking for orphaned reports...');
    const orphanedReports = reportsData?.filter(report => {
      const hasAssetLink = assetReportsData?.some(link => link.report_id === report.id);
      return !hasAssetLink;
    }) || [];

    console.log(`   Found ${orphanedReports.length} orphaned reports (no asset links)`);
    
    if (orphanedReports.length > 0) {
      console.log('   Orphaned reports:');
      orphanedReports.forEach(report => {
        console.log(`   - ${report.title} (${report.id})`);
      });
    }

    // Step 6: Check for submitted reports with non-ready assets
    console.log('⚠️  Step 6: Checking for submitted reports with non-ready assets...');
    const submittedReportsWithNonReadyAssets = [];
    
    if (reportsData && assetReportsData) {
      // Get all assets to check their status
      const allAssetIds = Array.from(new Set(assetReportsData.map(link => link.asset_id)));
      const { data: allAssetsData, error: allAssetsError } = await supabase
        .schema('neta_ops')
        .from('assets')
        .select('id, name, status')
        .in('id', allAssetIds);

      if (!allAssetsError && allAssetsData) {
        const assetStatusMap = new Map(allAssetsData.map(a => [a.id, a.status]));
        
        for (const report of reportsData) {
          if (report.status === 'submitted') {
            const linkedAssets = assetReportsData.filter(link => link.report_id === report.id);
            const nonReadyAssets = linkedAssets.filter(link => {
              const assetStatus = assetStatusMap.get(link.asset_id);
              return assetStatus && assetStatus !== 'ready_for_review';
            });
            
            if (nonReadyAssets.length > 0) {
              const assetDetails = nonReadyAssets.map(link => {
                const asset = allAssetsData.find(a => a.id === link.asset_id);
                return asset ? { id: asset.id, name: asset.name, status: asset.status } : null;
              }).filter(Boolean);
              
              submittedReportsWithNonReadyAssets.push({
                report,
                nonReadyAssets: assetDetails
              });
            }
          }
        }
      }
    }

    console.log(`   Found ${submittedReportsWithNonReadyAssets.length} submitted reports with non-ready assets`);
    
    if (submittedReportsWithNonReadyAssets.length > 0) {
      console.log('   Submitted reports with non-ready assets:');
      submittedReportsWithNonReadyAssets.forEach(({ report, nonReadyAssets }) => {
        console.log(`   - ${report.title} (${report.id})`);
        nonReadyAssets.forEach(asset => {
          console.log(`     * Asset: ${asset.name} (${asset.id}) - Status: ${asset.status}`);
        });
      });
    }

    console.log('');
    console.log('✅ Pending approval workflow test completed!');
    console.log('');
    console.log('📝 Summary:');
    console.log(`   - Assets ready for review: ${assetsData.length}`);
    console.log(`   - Technical reports submitted: ${reportsData?.length || 0}`);
    console.log(`   - Asset-report links: ${assetReportsData?.length || 0}`);
    console.log(`   - Assets with proper workflow: ${assetsWithReports.length}`);
    console.log(`   - Assets missing workflow: ${assetsWithoutReports.length}`);
    console.log(`   - Orphaned reports: ${orphanedReports.length}`);
    console.log(`   - Submitted reports with non-ready assets: ${submittedReportsWithNonReadyAssets.length}`);

  } catch (error) {
    console.error('❌ Error during test:', error);
  }
}

// Run the test
testPendingApprovalWorkflow();
