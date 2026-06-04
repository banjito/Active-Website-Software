import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/lib/AuthContext';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui';
import { FileText, Clock, AlertCircle, ChevronRight, SquareArrowOutUpRight } from 'lucide-react';
import {
  fetchJobsWithReportsForReview,
  formatReviewTimeAgo,
  getJobReviewPath,
  getReviewUrgencyColorClass,
  type JobWithReportsReadyForReview,
} from '@/lib/reviewShortcuts';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';

export const ReviewShortcuts: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [jobsWithReports, setJobsWithReports] = useState<JobWithReportsReadyForReview[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadJobs = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await fetchJobsWithReportsForReview();
      setJobsWithReports(data);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      console.error('Error fetching jobs with reports for review:', err);
      setError(`Failed to load jobs with reports: ${message}`);
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
    navigate(getJobReviewPath(jobId, user));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <LoadingSpinner size="sm" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center py-8">
        <AlertCircle className="h-5 w-5 text-red-500 mr-2" />
        <span className="text-red-600 dark:text-red-400">{error}</span>
      </div>
    );
  }

  if (jobsWithReports.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-center">
        <FileText className="h-12 w-12 text-gray-400 dark:text-white mb-3" />
        <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-1">
          No Reports Awaiting Review
        </h3>
        <p className="text-gray-600 dark:text-white">
          All reports have been reviewed or none are currently submitted.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center">
          <FileText className="h-5 w-5 text-[#f26722] mr-2" />
          <h3 className="text-lg font-medium text-gray-900 dark:text-white">
            Jobs with Reports Ready for Review
          </h3>
          <Badge variant="secondary" className="ml-2">
            {jobsWithReports.length}
          </Badge>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate('/neta_ops/reports?tab=approval')}
          className="text-[#f26722] hover:text-[#e55611]"
          leftIcon={<SquareArrowOutUpRight className="ml-1 h-4 w-4" />}
        >
          View All Reports
        </Button>
      </div>

      <div className="grid gap-3">
        {jobsWithReports.map((job) => (
          <div
            key={job.id}
            onClick={() => handleJobClick(job.id)}
            className="bg-white dark:bg-dark-150 border border-gray-200 dark:border-gray-700 rounded-lg p-4 hover:bg-gray-50 dark:hover:bg-dark-100 cursor-pointer transition-colors"
          >
            <div className="flex items-start justify-between">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <h4 className="font-medium text-gray-900 dark:text-white truncate">
                    {job.job_number ? `${job.job_number} - ${job.title}` : job.title}
                  </h4>
                  <Badge variant="outline" className="text-xs">
                    {job.division}
                  </Badge>
                </div>

                {(job.company_name || job.customer_name) && (
                  <p className="text-sm text-gray-600 dark:text-white mb-2">
                    {job.company_name || job.customer_name}
                  </p>
                )}

                <div className="flex items-center gap-4 text-sm">
                  <div className="flex items-center">
                    <FileText className="h-4 w-4 text-gray-400 mr-1" />
                    <span className="text-gray-600 dark:text-white">
                      {job.reports_count} report{job.reports_count !== 1 ? 's' : ''}
                    </span>
                  </div>

                  <div className="flex items-center">
                    <Clock className="h-4 w-4 text-gray-400 mr-1" />
                    <span className={`font-medium ${getReviewUrgencyColorClass(job.oldest_report_date)}`}>
                      Oldest: {formatReviewTimeAgo(job.oldest_report_date)}
                    </span>
                  </div>
                </div>
              </div>

              <ChevronRight className="h-5 w-5 text-gray-400 flex-shrink-0 ml-2" />
            </div>

            {job.reports.length > 1 && (
              <div className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-700">
                <div className="space-y-1">
                  {job.reports.slice(0, 3).map((report) => (
                    <div key={report.id} className="flex items-center justify-between text-xs">
                      <span className="text-gray-600 dark:text-white truncate">
                        {report.title}
                      </span>
                      <span className={`font-medium ${getReviewUrgencyColorClass(report.submitted_at)}`}>
                        {formatReviewTimeAgo(report.submitted_at)}
                      </span>
                    </div>
                  ))}
                  {job.reports.length > 3 && (
                    <div className="text-xs text-gray-500 dark:text-white italic">
                      +{job.reports.length - 3} more reports
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};
