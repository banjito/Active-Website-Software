import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/AuthContext';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui';
import { FileText, Clock, AlertCircle, ChevronRight } from 'lucide-react';

interface JobWithReports {
  id: string;
  title: string;
  job_number: string;
  division: string;
  customer_name?: string;
  company_name?: string;
  reports_count: number;
  oldest_report_date: string;
  reports: Array<{
    id: string;
    title: string;
    submitted_at: string;
    status: string;
  }>;
}

export const ReviewShortcuts: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [jobsWithReports, setJobsWithReports] = useState<JobWithReports[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (user) {
      fetchJobsWithReportsForReview();
    }
  }, [user]);

  // Listen for asset status changes to refresh the component
  useEffect(() => {
    const handleAssetStatusChange = (event: CustomEvent) => {
      const { newStatus } = event.detail;
      // Only refresh if the status change affects ready_for_review
      if (newStatus === 'ready_for_review' || newStatus === 'in_progress') {
        console.log('Asset status changed, refreshing ReviewShortcuts');
        fetchJobsWithReportsForReview();
      }
    };

    window.addEventListener('assetStatusChanged', handleAssetStatusChange as EventListener);
    
    return () => {
      window.removeEventListener('assetStatusChanged', handleAssetStatusChange as EventListener);
    };
  }, []);

  const fetchJobsWithReportsForReview = async () => {
    try {
      setLoading(true);
      setError(null);

      // Get all assets that are marked as "ready_for_review" - this is the primary indicator
      const { data: assetsData, error: assetsError } = await supabase
        .schema('neta_ops')
        .from('assets')
        .select('id, name, created_at, file_url, status, submitted_at, approved_at, sent_at')
        .eq('status', 'ready_for_review')
        .order('created_at', { ascending: true });

      if (assetsError) {
        if (assetsError.code === 'PGRST106' || assetsError.message?.includes('does not exist')) {
          console.warn('Assets table does not exist yet');
          setJobsWithReports([]);
          return;
        }
        throw assetsError;
      }

      if (!assetsData || assetsData.length === 0) {
        setJobsWithReports([]);
        return;
      }

      // Get job_asset links to find which jobs these assets belong to
      const assetIds = assetsData.map(asset => asset.id);
      const { data: jobAssetLinks, error: linksError } = await supabase
        .schema('neta_ops')
        .from('job_assets')
        .select('job_id, asset_id')
        .in('asset_id', assetIds);

      if (linksError) {
        throw linksError;
      }

      if (!jobAssetLinks || jobAssetLinks.length === 0) {
        setJobsWithReports([]);
        return;
      }

      // Group assets by job_id
      const assetsByJob = jobAssetLinks.reduce((acc, link) => {
        if (!acc[link.job_id]) {
          acc[link.job_id] = [];
        }
        const asset = assetsData.find(a => a.id === link.asset_id);
        if (asset) {
          acc[link.job_id].push(asset);
        }
        return acc;
      }, {} as Record<string, typeof assetsData>);

      const jobIds = Object.keys(assetsByJob);

      if (jobIds.length === 0) {
        setJobsWithReports([]);
        return;
      }

      // Fetch job details for jobs that have assets ready for review (excluding soft-deleted jobs)
      const { data: jobsData, error: jobsError } = await supabase
        .schema('neta_ops')
        .from('jobs')
        .select('id, title, job_number, division, customer_id')
        .in('id', jobIds)
        .is('deleted_at', null); // Only fetch non-deleted jobs

      if (jobsError) {
        throw jobsError;
      }

      if (!jobsData) {
        setJobsWithReports([]);
        return;
      }

      // Fetch customer information for each job
      const jobsWithCustomers = await Promise.all(
        jobsData.map(async (job) => {
          let customerData = null;
          if (job.customer_id) {
            try {
              const { data: customer, error: customerError } = await supabase
                .schema('common')
                .from('customers')
                .select('name, company_name')
                .eq('id', job.customer_id)
                .single();

              if (!customerError && customer) {
                customerData = customer;
              }
            } catch (err) {
              console.warn(`Error fetching customer for job ${job.id}:`, err);
            }
          }

          const jobAssets = assetsByJob[job.id] || [];
          const oldestAssetDate = jobAssets.length > 0 
            ? jobAssets.reduce((oldest, asset) => 
                new Date(asset.created_at) < new Date(oldest) ? asset.created_at : oldest, 
                jobAssets[0].created_at
              )
            : new Date().toISOString();

          // Convert assets to report-like format for display
          const reportsForDisplay = jobAssets.map(asset => ({
            id: asset.id,
            title: asset.name,
            submitted_at: asset.created_at,
            status: 'ready_for_review'
          }));

          return {
            id: job.id,
            title: job.title,
            job_number: job.job_number,
            division: job.division,
            customer_name: customerData?.name,
            company_name: customerData?.company_name,
            reports_count: jobAssets.length,
            oldest_report_date: oldestAssetDate,
            reports: reportsForDisplay
          };
        })
      );

      // Sort by oldest asset date (most urgent first)
      jobsWithCustomers.sort((a, b) => 
        new Date(a.oldest_report_date).getTime() - new Date(b.oldest_report_date).getTime()
      );

      setJobsWithReports(jobsWithCustomers);
    } catch (error: any) {
      console.error('Error fetching jobs with reports for review:', error);
      setError(`Failed to load jobs with reports: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleJobClick = (jobId: string) => {
    navigate(`/jobs/${jobId}?tab=assets&filter=ready_for_review`);
  };

  const formatTimeAgo = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffInHours = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60));
    
    if (diffInHours < 1) {
      return 'Just now';
    } else if (diffInHours < 24) {
      return `${diffInHours}h ago`;
    } else {
      const diffInDays = Math.floor(diffInHours / 24);
      return `${diffInDays}d ago`;
    }
  };

  const getUrgencyColor = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffInHours = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60));
    
    if (diffInHours >= 72) { // 3+ days
      return 'text-red-600 dark:text-red-400';
    } else if (diffInHours >= 24) { // 1+ days
      return 'text-yellow-600 dark:text-yellow-400';
    } else {
      return 'text-green-600 dark:text-green-400';
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-[#f26722]"></div>
        <span className="ml-2 text-gray-600 dark:text-white">Loading jobs with reports...</span>
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
        >
          View All Reports
          <ChevronRight className="ml-1 h-4 w-4" />
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
                    <span className={`font-medium ${getUrgencyColor(job.oldest_report_date)}`}>
                      Oldest: {formatTimeAgo(job.oldest_report_date)}
                    </span>
                  </div>
                </div>
              </div>
              
              <ChevronRight className="h-5 w-5 text-gray-400 flex-shrink-0 ml-2" />
            </div>

            {/* Show individual reports if there are multiple */}
            {job.reports.length > 1 && (
              <div className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-700">
                <div className="space-y-1">
                  {job.reports.slice(0, 3).map((report) => (
                    <div key={report.id} className="flex items-center justify-between text-xs">
                      <span className="text-gray-600 dark:text-white truncate">
                        {report.title}
                      </span>
                      <span className={`font-medium ${getUrgencyColor(report.submitted_at)}`}>
                        {formatTimeAgo(report.submitted_at)}
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
