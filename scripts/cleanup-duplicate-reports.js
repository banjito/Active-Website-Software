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

async function cleanupDuplicateReports() {
  try {
    console.log('🧹 Cleaning up duplicate reports and links...');
    console.log(`🕐 Current Time: ${new Date().toLocaleString('en-US', { timeZone: 'America/Chicago' })} (Central Time)`);
    console.log('');

    // Step 1: Find duplicate asset_report links
    console.log('🔍 Step 1: Finding duplicate asset_report links...');
    const { data: assetReports, error: assetReportsError } = await supabase
      .schema('neta_ops')
      .from('asset_reports')
      .select('id, asset_id, report_id, created_at')
      .order('created_at', { ascending: true });

    if (assetReportsError) {
      console.error('❌ Error fetching asset_reports:', assetReportsError);
      return;
    }

    // Group by asset_id to find duplicates
    const assetGroups = {};
    assetReports.forEach(link => {
      if (!assetGroups[link.asset_id]) {
        assetGroups[link.asset_id] = [];
      }
      assetGroups[link.asset_id].push(link);
    });

    const duplicates = Object.entries(assetGroups)
      .filter(([assetId, links]) => links.length > 1)
      .map(([assetId, links]) => ({ assetId, links }));

    console.log(`   Found ${duplicates.length} assets with duplicate links`);

    if (duplicates.length > 0) {
      console.log('   Assets with duplicate links:');
      duplicates.forEach(({ assetId, links }) => {
        console.log(`   - Asset ${assetId}: ${links.length} links`);
        links.forEach((link, index) => {
          console.log(`     ${index + 1}. Report ${link.report_id} (created: ${link.created_at})`);
        });
      });

      // Step 2: Clean up duplicate links (keep the oldest one)
      console.log('');
      console.log('🧹 Step 2: Cleaning up duplicate links...');
      let cleanedCount = 0;
      
      for (const { assetId, links } of duplicates) {
        // Keep the oldest link (first in the array since we sorted by created_at)
        const linksToDelete = links.slice(1); // Remove all except the first one
        
        for (const link of linksToDelete) {
          const { error: deleteError } = await supabase
            .schema('neta_ops')
            .from('asset_reports')
            .delete()
            .eq('id', link.id);
          
          if (deleteError) {
            console.error(`   ❌ Failed to delete link ${link.id}:`, deleteError);
          } else {
            console.log(`   ✅ Deleted duplicate link ${link.id} for asset ${assetId}`);
            cleanedCount++;
          }
        }
      }
      
      console.log(`   Cleaned up ${cleanedCount} duplicate links`);
    }

    // Step 3: Find orphaned technical reports (no asset links)
    console.log('');
    console.log('👻 Step 3: Finding orphaned technical reports...');
    const { data: technicalReports, error: reportsError } = await supabase
      .schema('neta_ops')
      .from('technical_reports')
      .select('id, title, status, created_at')
      .eq('status', 'submitted')
      .order('created_at', { ascending: true });

    if (reportsError) {
      console.error('❌ Error fetching technical_reports:', reportsError);
      return;
    }

    // Get all report IDs that have asset links
    const { data: linkedReportIds, error: linkedError } = await supabase
      .schema('neta_ops')
      .from('asset_reports')
      .select('report_id');

    if (linkedError) {
      console.error('❌ Error fetching linked report IDs:', linkedError);
      return;
    }

    const linkedReportIdSet = new Set(linkedReportIds.map(r => r.report_id));
    const orphanedReports = technicalReports.filter(report => !linkedReportIdSet.has(report.id));

    console.log(`   Found ${orphanedReports.length} orphaned technical reports`);

    if (orphanedReports.length > 0) {
      console.log('   Orphaned reports:');
      orphanedReports.forEach(report => {
        console.log(`   - ${report.title} (${report.id}) - Status: ${report.status}`);
      });

      // Step 4: Clean up orphaned reports
      console.log('');
      console.log('🗑️  Step 4: Cleaning up orphaned reports...');
      let deletedCount = 0;
      
      for (const report of orphanedReports) {
        const { error: deleteError } = await supabase
          .schema('neta_ops')
          .from('technical_reports')
          .delete()
          .eq('id', report.id);
        
        if (deleteError) {
          console.error(`   ❌ Failed to delete orphaned report ${report.id}:`, deleteError);
        } else {
          console.log(`   ✅ Deleted orphaned report ${report.id}: ${report.title}`);
          deletedCount++;
        }
      }
      
      console.log(`   Deleted ${deletedCount} orphaned reports`);
    }

    // Step 5: Verify cleanup
    console.log('');
    console.log('✅ Step 5: Verifying cleanup...');
    
    const { data: finalAssetReports, error: finalAssetError } = await supabase
      .schema('neta_ops')
      .from('asset_reports')
      .select('asset_id')
      .order('asset_id', { ascending: true });

    if (!finalAssetError) {
      const finalAssetGroups = {};
      finalAssetReports.forEach(link => {
        if (!finalAssetGroups[link.asset_id]) {
          finalAssetGroups[link.asset_id] = 0;
        }
        finalAssetGroups[link.asset_id]++;
      });

      const remainingDuplicates = Object.entries(finalAssetGroups)
        .filter(([assetId, count]) => count > 1)
        .length;

      console.log(`   Remaining duplicate links: ${remainingDuplicates}`);
    }

    console.log('');
    console.log('✅ Cleanup completed!');
    console.log('');
    console.log('📝 Summary:');
    console.log(`   - Assets with duplicate links found: ${duplicates.length}`);
    console.log(`   - Duplicate links cleaned: ${cleanedCount}`);
    console.log(`   - Orphaned reports found: ${orphanedReports.length}`);
    console.log(`   - Orphaned reports deleted: ${deletedCount}`);

  } catch (error) {
    console.error('❌ Error during cleanup:', error);
  }
}

// Run the cleanup
cleanupDuplicateReports();
