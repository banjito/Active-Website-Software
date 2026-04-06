import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';

/**
 * Returns profile IDs that report to the current user (direct + indirect, full subtree)
 * based on common.org_chart_assignments.reports_to_profile_id.
 * Used for manager portal / employee files / profiles: you see everyone under you on the org chart.
 */
export function useManagerReportIds(currentUserId: string | undefined): {
  reportIds: string[];
  loading: boolean;
  refetch: () => Promise<void>;
} {
  const [reportIds, setReportIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(!!currentUserId);

  const fetchReportIds = useCallback(async () => {
    if (!currentUserId) {
      setReportIds([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      let rows: { profile_id: string; reports_to_profile_id: string | null }[] | null = null;
      let error: any = null;
      try {
        const res = await supabase
          .schema('common')
          .from('org_chart_assignments')
          .select('profile_id, reports_to_profile_id');
        rows = res.data;
        error = res.error;
      } catch (_) {
        error = true;
      }
      if (error) {
        try {
          const fallback = await supabase
            .from('org_chart_assignments')
            .select('profile_id, reports_to_profile_id');
          if (!fallback.error && fallback.data) {
            rows = fallback.data;
            error = null;
          }
        } catch (_) {}
      }
      if (error || !rows) {
        console.warn('useManagerReportIds:', error);
        setReportIds([]);
        return;
      }
      const byManager = new Map<string, string[]>();
      for (const r of rows) {
        if (!r.reports_to_profile_id) continue;
        const list = byManager.get(r.reports_to_profile_id) ?? [];
        list.push(r.profile_id);
        byManager.set(r.reports_to_profile_id, list);
      }
      const collected: string[] = [];
      const queue = [currentUserId];
      const seen = new Set<string>();
      while (queue.length) {
        const managerId = queue.shift()!;
        const direct = byManager.get(managerId) ?? [];
        for (const id of direct) {
          if (!seen.has(id)) {
            seen.add(id);
            collected.push(id);
            queue.push(id);
          }
        }
      }
      setReportIds(collected);
    } catch (e) {
      console.warn('useManagerReportIds', e);
      setReportIds([]);
    } finally {
      setLoading(false);
    }
  }, [currentUserId]);

  useEffect(() => {
    fetchReportIds();
  }, [fetchReportIds]);

  return { reportIds, loading, refetch: fetchReportIds };
}
