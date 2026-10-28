import { supabase } from '@/lib/supabase';

// Report numbers: each report's number within its job, e.g. "26103-203".
// Assigned by the database when a report is linked to a job; see
// database/migrations/report_numbers.sql.

/** The report's code, or null when it has none yet (not linked to a job, or not a report). */
export async function fetchReportCode(assetId: string): Promise<string | null> {
  const { data, error } = await supabase
    .schema('neta_ops')
    .from('report_numbers')
    .select('report_code')
    .eq('asset_id', assetId)
    .maybeSingle();
  if (error) {
    console.warn('[reportNumber] Failed to load report number:', error);
    return null;
  }
  return data?.report_code ?? null;
}
