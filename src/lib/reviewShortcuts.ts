import { supabase } from '@/lib/supabase';
import { isSuperUser } from '@/lib/roles';
import type { User } from '@supabase/supabase-js';

export interface JobWithReportsReadyForReview {
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

export function canAccessReportApprovals(user: User | null | undefined): boolean {
  return user?.user_metadata?.role === 'Admin' || isSuperUser(user?.email);
}

export function getJobReviewPath(jobId: string, user: User | null | undefined): string {
  if (canAccessReportApprovals(user)) {
    return `/jobs/${jobId}?tab=reports`;
  }
  return `/jobs/${jobId}?tab=assets&filter=ready_for_review`;
}

export async function fetchJobsWithReportsForReview(): Promise<JobWithReportsReadyForReview[]> {
  const { data: assetsData, error: assetsError } = await supabase
    .schema('neta_ops')
    .from('assets')
    .select('id, name, created_at, file_url, status, submitted_at, approved_at, sent_at')
    .eq('status', 'ready_for_review')
    .order('created_at', { ascending: true });

  if (assetsError) {
    if (assetsError.code === 'PGRST106' || assetsError.message?.includes('does not exist')) {
      console.warn('Assets table does not exist yet');
      return [];
    }
    throw assetsError;
  }

  if (!assetsData || assetsData.length === 0) {
    return [];
  }

  const assetIds = assetsData.map((asset) => asset.id);
  const { data: jobAssetLinks, error: linksError } = await supabase
    .schema('neta_ops')
    .from('job_assets')
    .select('job_id, asset_id')
    .in('asset_id', assetIds);

  if (linksError) throw linksError;
  if (!jobAssetLinks || jobAssetLinks.length === 0) return [];

  const assetsByJob = jobAssetLinks.reduce(
    (acc, link) => {
      if (!acc[link.job_id]) {
        acc[link.job_id] = [];
      }
      const asset = assetsData.find((a) => a.id === link.asset_id);
      if (asset) {
        acc[link.job_id].push(asset);
      }
      return acc;
    },
    {} as Record<string, typeof assetsData>
  );

  const jobIds = Object.keys(assetsByJob);
  if (jobIds.length === 0) return [];

  const { data: jobsData, error: jobsError } = await supabase
    .schema('neta_ops')
    .from('jobs')
    .select('id, title, job_number, division, customer_id')
    .in('id', jobIds)
    .is('deleted_at', null);

  if (jobsError) throw jobsError;
  if (!jobsData) return [];

  const jobsWithCustomers = await Promise.all(
    jobsData.map(async (job) => {
      let customerData: { name?: string; company_name?: string } | null = null;
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
      const oldestAssetDate =
        jobAssets.length > 0
          ? jobAssets.reduce(
              (oldest, asset) =>
                new Date(asset.created_at) < new Date(oldest) ? asset.created_at : oldest,
              jobAssets[0].created_at
            )
          : new Date().toISOString();

      const reportsForDisplay = jobAssets.map((asset) => ({
        id: asset.id,
        title: asset.name,
        submitted_at: asset.created_at,
        status: 'ready_for_review',
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
        reports: reportsForDisplay,
      };
    })
  );

  jobsWithCustomers.sort(
    (a, b) =>
      new Date(a.oldest_report_date).getTime() - new Date(b.oldest_report_date).getTime()
  );

  return jobsWithCustomers;
}

export function formatReviewTimeAgo(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffInHours = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60));

  if (diffInHours < 1) {
    return 'Just now';
  }
  if (diffInHours < 24) {
    return `${diffInHours}h ago`;
  }
  const diffInDays = Math.floor(diffInHours / 24);
  return `${diffInDays}d ago`;
}

export function getReviewUrgencyColorClass(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffInHours = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60));

  if (diffInHours >= 72) {
    return 'text-red-600 dark:text-red-400';
  }
  if (diffInHours >= 24) {
    return 'text-yellow-600 dark:text-yellow-400';
  }
  return 'text-green-600 dark:text-green-400';
}
