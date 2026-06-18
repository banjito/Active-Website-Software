import { supabase } from '@/lib/supabase';

// NOTE on security: none of these queries filter by customer_id themselves.
// Postgres RLS + the common.customer_report_assets() SECURITY DEFINER function
// (Database Scripts/Setup & Configuration/customer_portal_*.sql) restrict every
// read to the signed-in customer's own jobs and their approved/sent report-assets.
// A client-side account filter would be redundant and must never be relied upon.

const NETA = 'neta_ops';

export interface Job {
  id: string;
  job_number: string | null;
  title: string | null;
  status: string | null;
  site_address: string | null;
  division: string | null;
  created_at: string | null;
  due_date: string | null;
}

/**
 * A customer-facing report. In ampOS this is a neta_ops.assets row (the report
 * deliverable) with status approved/sent, joined to its job.
 */
export interface ReportAsset {
  asset_id: string;
  asset_name: string | null;
  file_url: string | null;
  substation: string | null;
  status: string | null;
  submitted_at: string | null;
  approved_at: string | null;
  sent_at: string | null;
  created_at: string | null;
  published_pdf_path: string | null;
  job_id: string;
  job_number: string | null;
  job_title: string | null;
}

/** All jobs the signed-in customer has given AMP (RLS-scoped). */
export async function getJobs(): Promise<Job[]> {
  const { data, error } = await supabase
    .schema(NETA)
    .from('jobs')
    .select('id, job_number, title, status, site_address, division, created_at, due_date')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as Job[];
}

export async function getJob(jobId: string): Promise<Job | null> {
  const { data, error } = await supabase
    .schema(NETA)
    .from('jobs')
    .select('id, job_number, title, status, site_address, division, created_at, due_date')
    .eq('id', jobId)
    .maybeSingle();
  if (error) throw error;
  return (data as Job) ?? null;
}

/**
 * Every approved/sent report-asset for the customer, with its job info.
 * Backed by the common.customer_report_assets() SECURITY DEFINER function.
 */
export async function getReportAssets(): Promise<ReportAsset[]> {
  const { data, error } = await supabase.schema('common').rpc('customer_report_assets');
  if (error) throw error;
  return (data ?? []) as ReportAsset[];
}

/** Report-assets for a single job. */
export async function getReportAssetsForJob(jobId: string): Promise<ReportAsset[]> {
  const all = await getReportAssets();
  return all.filter((r) => r.job_id === jobId);
}

/** Count report-assets per job id, for the jobs list. */
export function countAssetsByJob(assets: ReportAsset[]): Record<string, number> {
  return assets.reduce<Record<string, number>>((acc, a) => {
    acc[a.job_id] = (acc[a.job_id] ?? 0) + 1;
    return acc;
  }, {});
}

/**
 * Request a short-lived signed URL for a report-asset's published PDF. The
 * customer-report-download edge function re-checks (via customer_report_assets)
 * that the asset belongs to the signed-in customer before signing; the bucket
 * stays private.
 */
export async function getReportDownloadUrl(assetId: string): Promise<string> {
  const { data, error } = await supabase.functions.invoke('customer-report-download', {
    body: { asset_id: assetId },
  });
  if (error) {
    let detail = error.message;
    const ctx = (error as { context?: Response }).context;
    if (ctx && typeof ctx.json === 'function') {
      try {
        const b = await ctx.json();
        if (b?.error) detail = b.error;
      } catch {
        /* no json body */
      }
    }
    throw new Error(detail);
  }
  const url = (data as { url?: string } | null)?.url;
  if (!url) throw new Error('No download URL returned.');
  return url;
}

/**
 * A report is openable when it has a published PDF (rendered + stored on send),
 * or its file_url is already a direct PDF link.
 */
export function isOpenable(report: ReportAsset): boolean {
  return !!report.published_pdf_path || (!!report.file_url && /^https?:\/\//i.test(report.file_url));
}
