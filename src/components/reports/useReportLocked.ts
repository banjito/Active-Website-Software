import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

/**
 * Determine if a report should be locked (no edits) based on technical_reports.status.
 * Prefers resolving the linked technical report via asset file_url when jobId/slug are provided.
 */
export function useReportLocked(
  reportId?: string,
  jobId?: string,
  reportSlug?: string
) {
  const [locked, setLocked] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(false);

  useEffect(() => {
    let isCancelled = false;
    const fetchStatus = async () => {
      // If no reportId at all, nothing to do
      if (!reportId) {
        if (!isCancelled) setLocked(false);
        return;
      }

      try {
        setLoading(true);

        // 1) Attempt: treat reportId as technical_reports.id (legacy/direct case)
        const direct = await supabase
          .schema('neta_ops')
          .from('technical_reports')
          .select('status')
          .eq('id', reportId)
          .maybeSingle();

        if (direct.data && !direct.error) {
          const status = String((direct.data as any).status || '').toLowerCase();
          if (!isCancelled) setLocked(status === 'approved' || status === 'sent');
          return;
        }

        // 2) Resolve by asset file_url -> asset_reports -> technical_reports
        if (jobId && reportSlug) {
          const fileUrl = `report:/jobs/${jobId}/${reportSlug}/${reportId}`;
          const { data: asset, error: assetErr } = await supabase
            .schema('neta_ops')
            .from('assets')
            .select('id')
            .eq('file_url', fileUrl)
            .maybeSingle();

          if (!assetErr && asset?.id) {
            // Find link in asset_reports
            const { data: link, error: linkErr } = await supabase
              .schema('neta_ops')
              .from('asset_reports')
              .select('report_id')
              .eq('asset_id', asset.id)
              .maybeSingle();

            if (!linkErr && link?.report_id) {
              const { data: tech, error: techErr } = await supabase
                .schema('neta_ops')
                .from('technical_reports')
                .select('status')
                .eq('id', link.report_id)
                .single();
              if (!isCancelled) {
                if (!techErr && tech) {
                  const status = String((tech as any).status || '').toLowerCase();
                  setLocked(status === 'approved' || status === 'sent');
                } else {
                  setLocked(false);
                }
              }
              return;
            }

            // 3) Fallback: technical_reports where report_data contains asset_id
            const { data: tech2, error: tech2Err } = await supabase
              .schema('neta_ops')
              .from('technical_reports')
              .select('status')
              .contains('report_data', { asset_id: asset.id });
            if (!isCancelled) {
              if (!tech2Err && Array.isArray(tech2) && tech2.length > 0) {
                const status = String((tech2[0] as any).status || '').toLowerCase();
                setLocked(status === 'approved' || status === 'sent');
              } else {
                setLocked(false);
              }
            }
            return;
          }
        }

        // If all else fails
        if (!isCancelled) setLocked(false);
      } catch {
        if (!isCancelled) setLocked(false);
      } finally {
        if (!isCancelled) setLoading(false);
      }
    };

    fetchStatus();
    return () => {
      isCancelled = true;
    };
  }, [reportId, jobId, reportSlug]);

  return { locked, loading };
}


