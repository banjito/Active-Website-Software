import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

/**
 * Determine if a report should be locked (no edits) based on assets.status.
 * The approval status is stored directly on the assets table.
 * Resolves the asset via file_url when jobId/slug are provided.
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

        // 1) Primary: Look up asset by file_url (status lives on assets table)
        if (jobId && reportSlug) {
          const fileUrl = `report:/jobs/${jobId}/${reportSlug}/${reportId}`;
          const { data: asset, error: assetErr } = await supabase
            .schema('neta_ops')
            .from('assets')
            .select('id, status')
            .eq('file_url', fileUrl)
            .maybeSingle();

          if (!assetErr && asset) {
            const status = String((asset as any).status || '').toLowerCase();
            if (!isCancelled) {
              setLocked(status === 'approved' || status === 'sent');
              setLoading(false);
            }
            return;
          }
        }

        // 2) Fallback: look up asset by suffix match on reportId
        const { data: assetsBySuffix } = await supabase
          .schema('neta_ops')
          .from('assets')
          .select('id, status, file_url')
          .ilike('file_url', `%/${reportId}`);

        if (Array.isArray(assetsBySuffix) && assetsBySuffix.length > 0) {
          // Prefer report:/ URLs that match our job
          const candidate = (jobId
            ? assetsBySuffix.find(a => (a.file_url || '').startsWith(`report:/jobs/${jobId}/`))
            : null
          ) || assetsBySuffix.find(a =>
            (a.file_url || '').startsWith('report:/jobs/')
          ) || assetsBySuffix[0];

          if (candidate) {
            const status = String((candidate as any).status || '').toLowerCase();
            if (!isCancelled) {
              setLocked(status === 'approved' || status === 'sent');
              setLoading(false);
            }
            return;
          }
        }

        // If all else fails
        if (!isCancelled) {
          setLocked(false);
          setLoading(false);
        }
      } catch {
        if (!isCancelled) {
          setLocked(false);
          setLoading(false);
        }
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
