import React, { useCallback, useEffect, useState } from 'react';
import { AlertCircle, Clock, FileText } from 'lucide-react';
import { useAuth } from '@/lib/AuthContext';
import {
  fetchJobsWithReportsForReview,
  formatReviewTimeAgo,
  getJobReviewPath,
  getReviewUrgencyColorClass,
  type JobWithReportsReadyForReview,
} from '@/lib/reviewShortcuts';

interface ReviewShortcutsDropdownProps {
  onNavigate: (url: string) => void;
}

export const ReviewShortcutsDropdown: React.FC<ReviewShortcutsDropdownProps> = ({ onNavigate }) => {
  const { user } = useAuth();
  const [jobs, setJobs] = useState<JobWithReportsReadyForReview[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadJobs = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await fetchJobsWithReportsForReview();
      setJobs(data);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      console.error('Error fetching jobs with reports for review:', err);
      setError(`Failed to load: ${message}`);
      setJobs([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (user) {
      void loadJobs();
    }
  }, [user, loadJobs]);

  useEffect(() => {
    const handleAssetStatusChange = (event: CustomEvent) => {
      const { newStatus } = event.detail;
      if (newStatus === 'ready_for_review' || newStatus === 'in_progress') {
        void loadJobs();
      }
    };

    window.addEventListener('assetStatusChanged', handleAssetStatusChange as EventListener);
    return () => {
      window.removeEventListener('assetStatusChanged', handleAssetStatusChange as EventListener);
    };
  }, [loadJobs]);

  const handleJobClick = (jobId: string) => {
    onNavigate(getJobReviewPath(jobId, user));
  };

  return (
    <div className="w-[min(24rem,calc(100vw-1.5rem))] rounded-lg bg-white dark:bg-dark-150 shadow-xl ring-1 ring-black/5 dark:ring-white/10 overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center gap-2">
          <FileText className="h-4 w-4 text-[#f26722]" />
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
            Jobs with Reports Ready for Review
          </h3>
        </div>
        {!loading && !error && (
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            {jobs.length} job{jobs.length !== 1 ? 's' : ''}
          </p>
        )}
      </div>

      <div className="max-h-80 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-[#f26722]" />
            <span className="ml-2 text-sm text-gray-600 dark:text-gray-300">Loading…</span>
          </div>
        ) : error ? (
          <div className="flex items-center gap-2 px-4 py-6 text-sm text-red-600 dark:text-red-400">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {error}
          </div>
        ) : jobs.length === 0 ? (
          <div className="px-4 py-8 text-center">
            <FileText className="h-10 w-10 text-gray-300 dark:text-gray-600 mx-auto mb-2" />
            <p className="text-sm font-medium text-gray-900 dark:text-white">All caught up</p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              No reports awaiting review right now.
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-gray-100 dark:divide-gray-700">
            {jobs.map((job) => (
              <li key={job.id}>
                <button
                  type="button"
                  onClick={() => handleJobClick(job.id)}
                  className="w-full text-left px-4 py-3 hover:bg-gray-50 dark:hover:bg-dark-100 transition-colors"
                >
                  <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                    {job.job_number ? `${job.job_number} — ${job.title}` : job.title}
                  </p>
                  {(job.company_name || job.customer_name) && (
                    <p className="text-xs text-gray-600 dark:text-gray-300 truncate mt-0.5">
                      {job.company_name || job.customer_name}
                    </p>
                  )}
                  <div className="flex items-center gap-3 mt-1.5 text-xs text-gray-500 dark:text-gray-400">
                    <span>{job.division}</span>
                    <span>
                      {job.reports_count} report{job.reports_count !== 1 ? 's' : ''}
                    </span>
                    <span className={`inline-flex items-center gap-0.5 font-medium ${getReviewUrgencyColorClass(job.oldest_report_date)}`}>
                      <Clock className="h-3 w-3" />
                      {formatReviewTimeAgo(job.oldest_report_date)}
                    </span>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};

export default ReviewShortcutsDropdown;
