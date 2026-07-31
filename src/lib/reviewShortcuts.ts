import { supabase } from '@/lib/supabase';
import { isSuperUser } from '@/lib/roles';
import type { User } from '@supabase/supabase-js';

/**
 * How long a report may sit between being tested and being reviewed before it
 * is late. Reviews have to happen within 7 days of the test date.
 */
export const REVIEW_SLA_DAYS = 7;
const REVIEW_WARNING_DAYS = 4;

export interface JobWithReportsReadyForReview {
  id: string;
  title: string;
  job_number: string;
  division: string;
  customer_name?: string;
  company_name?: string;
  reports_count: number;
  /** Review date of the oldest report on the job. See `review_date` below. */
  oldest_report_date: string;
  reports: Array<{
    id: string;
    title: string;
    /**
     * The date the review clock runs from: the test date recorded inside the
     * report ('YYYY-MM-DD', day precision) when we can resolve one, otherwise
     * the submission timestamp, otherwise when the report was created.
     */
    review_date: string;
    status: string;
  }>;
}

/**
 * Extracts a human-readable message from an unknown error. Supabase's
 * PostgrestError is a plain object ({ message, details, hint, code }), not an
 * Error instance, so `err instanceof Error` misses it and it collapses to
 * "Unknown error". Handle both shapes here.
 */
export function extractErrorMessage(err: unknown): string {
  if (err instanceof Error) {
    return err.message;
  }
  if (err && typeof err === 'object') {
    const e = err as { message?: unknown; details?: unknown; hint?: unknown; code?: unknown };
    const parts = [e.message, e.details, e.hint].filter(
      (part): part is string => typeof part === 'string' && part.length > 0
    );
    if (parts.length > 0) {
      const base = parts.join(' — ');
      return typeof e.code === 'string' && e.code ? `${base} (${e.code})` : base;
    }
  }
  if (typeof err === 'string' && err.length > 0) {
    return err;
  }
  return 'Unknown error';
}

export function canAccessReportApprovals(user: User | null | undefined): boolean {
  return user?.user_metadata?.role === 'Admin' || isSuperUser(user?.email);
}

/**
 * Fetches neta_ops.job_assets links for the given asset ids. Supabase/PostgREST
 * puts `.in(...)` filters in the URL, so passing a large id list (hundreds of
 * `ready_for_review` assets) blows past the server's URI length limit and the
 * request fails with 400 Bad Request. Chunk the ids and merge the results.
 */
export async function fetchJobAssetLinksByAssetIds(
  assetIds: string[],
  chunkSize = 100
): Promise<Array<{ job_id: string; asset_id: string }>> {
  if (assetIds.length === 0) return [];

  const links: Array<{ job_id: string; asset_id: string }> = [];
  for (let i = 0; i < assetIds.length; i += chunkSize) {
    const chunk = assetIds.slice(i, i + chunkSize);
    const { data, error } = await supabase
      .schema('neta_ops')
      .from('job_assets')
      .select('job_id, asset_id')
      .in('asset_id', chunk);

    if (error) throw error;
    if (data) links.push(...data);
  }
  return links;
}

/**
 * Resolves the test date recorded inside each report, keyed by asset id.
 *
 * Every report type keeps its test date in its own table under its own key, so
 * the lookup runs server-side (neta_ops.get_asset_test_dates). Assets whose
 * report has no usable test date are simply absent from the result; callers
 * fall back to the submission timestamp.
 */
export async function fetchAssetTestDates(
  assetIds: string[],
  chunkSize = 200
): Promise<Record<string, string>> {
  if (assetIds.length === 0) return {};

  const testDates: Record<string, string> = {};
  for (let i = 0; i < assetIds.length; i += chunkSize) {
    const chunk = assetIds.slice(i, i + chunkSize);
    const { data, error } = await supabase
      .schema('neta_ops')
      .rpc('get_asset_test_dates', { p_asset_ids: chunk });

    if (error) {
      // The dashboard still works off submitted_at if the function is missing
      // (migration not applied yet) — don't take the whole panel down for it.
      console.warn('Could not resolve report test dates:', extractErrorMessage(error));
      return testDates;
    }

    for (const row of (data || []) as Array<{ asset_id: string; test_date: string | null }>) {
      if (row.test_date) {
        testDates[row.asset_id] = row.test_date;
      }
    }
  }
  return testDates;
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
    .select('id, name, created_at, submitted_at, status')
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
  const jobAssetLinks = await fetchJobAssetLinksByAssetIds(assetIds);
  if (jobAssetLinks.length === 0) return [];

  const testDatesByAsset = await fetchAssetTestDates(assetIds);
  const reviewDateForAsset = (asset: { id: string; created_at: string; submitted_at?: string | null }) =>
    testDatesByAsset[asset.id] || asset.submitted_at || asset.created_at;

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

      const reportsForDisplay = jobAssets.map((asset) => ({
        id: asset.id,
        title: asset.name,
        review_date: reviewDateForAsset(asset),
        status: 'ready_for_review',
      }));

      const oldestAssetDate =
        reportsForDisplay.length > 0
          ? reportsForDisplay.reduce(
              (oldest, report) =>
                reviewDateSortKey(report.review_date) < reviewDateSortKey(oldest)
                  ? report.review_date
                  : oldest,
              reportsForDisplay[0].review_date
            )
          : new Date().toISOString();

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
    (a, b) => reviewDateSortKey(a.oldest_report_date) - reviewDateSortKey(b.oldest_report_date)
  );

  return jobsWithCustomers;
}

/** A test date carries no time of day, so it arrives as a bare 'YYYY-MM-DD'. */
const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Parses a review date to local time. A bare 'YYYY-MM-DD' has to be read as
 * local midnight — `new Date('2026-07-29')` parses as UTC midnight, which lands
 * on the previous day for anyone west of Greenwich and shifts every age by a day.
 */
function toLocalDate(dateString: string): Date | null {
  if (!dateString) return null;

  if (DATE_ONLY_PATTERN.test(dateString)) {
    const [year, month, day] = dateString.split('-').map(Number);
    return new Date(year, month - 1, day);
  }

  const parsed = new Date(dateString);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function reviewDateSortKey(dateString: string): number {
  return toLocalDate(dateString)?.getTime() ?? Number.POSITIVE_INFINITY;
}

/**
 * Whole days elapsed since a review date. Day-precision dates are measured
 * from calendar day to calendar day so a report tested yesterday reads "1d ago"
 * regardless of the hour, rather than 0d until the clock passes 24 hours.
 */
export function getReviewAgeInDays(dateString: string): number | null {
  const date = toLocalDate(dateString);
  if (!date) return null;

  const now = new Date();
  if (DATE_ONLY_PATTERN.test(dateString)) {
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    return Math.round((startOfToday.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
  }
  return Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
}

export function formatReviewTimeAgo(dateString: string): string {
  const date = toLocalDate(dateString);
  if (!date) return 'Unknown';

  if (DATE_ONLY_PATTERN.test(dateString)) {
    const days = getReviewAgeInDays(dateString) ?? 0;
    if (days <= 0) return 'Today';
    return `${days}d ago`;
  }

  const diffInHours = Math.floor((Date.now() - date.getTime()) / (1000 * 60 * 60));
  if (diffInHours < 1) {
    return 'Just now';
  }
  if (diffInHours < 24) {
    return `${diffInHours}h ago`;
  }
  return `${Math.floor(diffInHours / 24)}d ago`;
}

/**
 * Colors the age against the 7-day review window: green while there is room,
 * amber as it closes, red once the report is past due.
 */
export function getReviewUrgencyColorClass(dateString: string): string {
  const days = getReviewAgeInDays(dateString);
  if (days === null) {
    return 'text-neutral-600 dark:text-neutral-400';
  }

  if (days >= REVIEW_SLA_DAYS) {
    return 'text-red-600 dark:text-red-400';
  }
  if (days >= REVIEW_WARNING_DAYS) {
    return 'text-yellow-600 dark:text-yellow-400';
  }
  return 'text-green-600 dark:text-green-400';
}
