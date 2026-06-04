import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import Card, { CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Search, EyeOff, Eye, XCircle } from 'lucide-react';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';

const HIDDEN_NOTIF_JOB_IDS_KEY = 'hiddenNotificationJobIds';

interface JobRow {
  id: string;
  title: string;
  job_number?: string;
  deleted_at?: string | null;
}

export const NotificationDevControls: React.FC = () => {
  const [search, setSearch] = useState('');
  const [jobs, setJobs] = useState<JobRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(new Set());

  // Load hidden ids from localStorage
  useEffect(() => {
    try {
      const raw = localStorage.getItem(HIDDEN_NOTIF_JOB_IDS_KEY);
      if (raw) {
        const arr: string[] = JSON.parse(raw);
        setHiddenIds(new Set(arr));
      }
    } catch {
      /* no-op */
    }
  }, []);

  const persistHidden = (setVal: Set<string>) => {
    try { localStorage.setItem(HIDDEN_NOTIF_JOB_IDS_KEY, JSON.stringify(Array.from(setVal))); } catch {}
  };

  const toggleHidden = (jobId: string) => {
    setHiddenIds(prev => {
      const next = new Set(prev);
      if (next.has(jobId)) next.delete(jobId); else next.add(jobId);
      persistHidden(next);
      return next;
    });
  };

  const clearAllHidden = () => {
    setHiddenIds(new Set());
    try { localStorage.removeItem(HIDDEN_NOTIF_JOB_IDS_KEY); } catch {}
  };

  const loadJobs = async () => {
    try {
      setLoading(true);
      setError(null);

      let query = supabase
        .schema('neta_ops')
        .from('jobs')
        .select('id, title, job_number, deleted_at')
        .order('created_at', { ascending: false })
        .limit(50);

      if (search.trim().length > 0) {
        // Simple search on title or job_number
        query = query.or(`title.ilike.%${search.trim()}%,job_number.ilike.%${search.trim()}%`);
      }

      const { data, error: qError } = await query;
      if (qError) throw qError;
      setJobs((data || []) as JobRow[]);
    } catch (err: any) {
      setError(err?.message || 'Failed to load jobs');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadJobs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const visibleJobs = useMemo(() => jobs, [jobs]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Notification Dev Controls</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex items-center gap-2 mb-4">
          <div className="flex items-center gap-2 flex-1">
            <Search className="h-4 w-4 text-gray-500" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search jobs by title or job number"
              className="form-input"
            />
          </div>
          <Button variant="secondary" onClick={() => void loadJobs()} disabled={loading}>
            {loading ? <LoadingSpinner size="xs" /> : 'Refresh'}
          </Button>
          <Button variant="outline" onClick={clearAllHidden}>
            <XCircle className="h-4 w-4 mr-2" /> Clear Hidden
          </Button>
        </div>

        {error && (
          <div className="mb-3 text-sm text-red-600">{error}</div>
        )}

        <div className="border rounded-md divide-y">
          {visibleJobs.length === 0 ? (
            <div className="p-4 text-sm text-gray-500">No jobs found.</div>
          ) : (
            visibleJobs.map(j => (
              <div key={j.id} className="flex items-center justify-between p-3">
                <div className="min-w-0">
                  <div className="text-sm font-medium truncate">
                    {j.job_number ? `Job ${j.job_number}` : 'Job'} • {j.title || 'Untitled'}
                  </div>
                  {j.deleted_at && (
                    <div className="text-xs text-gray-500">Deleted</div>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant={hiddenIds.has(j.id) ? 'secondary' : 'outline'}
                    onClick={() => toggleHidden(j.id)}
                    className="text-sm"
                  >
                    {hiddenIds.has(j.id) ? (
                      <><Eye className="h-4 w-4 mr-2" /> Unhide</>
                    ) : (
                      <><EyeOff className="h-4 w-4 mr-2" /> Hide</>
                    )}
                  </Button>
                </div>
              </div>
            ))
          )}
        </div>

        <div className="mt-3 text-xs text-gray-500">
          This writes to local storage only on this machine using the key "{HIDDEN_NOTIF_JOB_IDS_KEY}". The portal notifications already respect this list.
        </div>
      </CardContent>
    </Card>
  );
};

export default NotificationDevControls;
