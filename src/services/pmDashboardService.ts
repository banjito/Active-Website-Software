import { supabase } from '@/lib/supabase';
import { describeSupabaseError, withWriteRetry } from '@/lib/supabaseRetry';
import { getReportSlugFromFileUrl, REPORT_NAMES } from '@/components/reports/reportMappings';
import { getQBOInvoicesByCustomer } from '@/services/quickbooksService';
import { summarizeChangeOrders, type ChangeOrder } from '@/services/changeOrderService';
import { sovPricePerLaborHour } from '@/lib/estimatePricing';
import {
  OTHER_FILES_KEY,
  addEstimatesToLines,
  estimateRows,
  guessLineSlugs,
  simpleEstimateRows,
  sovTotal,
  type EstimateOption,
  type SentReport,
  type SovLine,
} from '@/utils/pmDashboardCalculations';

export interface PmJob {
  id: string;
  job_number: string | null;
  title: string | null;
  status: string;
  division: string | null;
  customer_id: string | null;
  customer_name: string;
  /** Older jobs point at their opportunity; newer opportunities point at the job */
  opportunity_id: string | null;
  quickbooks_project_id: string | null;
  estimated_man_hours: number | null;
  start_date: string | null;
}

/** Everything the dashboard needs to know about one job, apart from QuickBooks billing. */
export interface JobBundle {
  lines: SovLine[];
  /** True when the lines come straight from the estimate and nothing is saved yet */
  seeded: boolean;
  /**
   * Estimates on the job's quote, counted only while the job has no saved SOV. With one,
   * it is copied in. With more, nothing is copied: the PM picks which ones apply.
   */
  estimateCount: number;
  reports: SentReport[];
  /** month (YYYY-MM) -> hours on the TimeStAMP clock */
  hoursByMonth: Record<string, number>;
  quotedAmount: number;
  approvedChangeOrders: number;
}

export interface BundleResult {
  bundles: Record<string, JobBundle>;
  /** True when pm_dashboard.sql has not been run on this database yet */
  setupMissing: boolean;
}

// Jobs still being worked or billed. Finished, billed, and cancelled jobs drop off the list.
const ACTIVE_STATUSES = ['pending', 'in_progress', 'progress_billing', 'ready_to_bill', 'on_hold'];

const JOB_COLUMNS =
  'id, job_number, title, status, division, customer_id, opportunity_id, quickbooks_project_id, estimated_man_hours, start_date';

// Postgres "no such table/function", and PostgREST's versions of the same.
const MISSING_CODES = new Set(['42P01', '42883', 'PGRST202', 'PGRST205']);
const isMissing = (error: { code?: string } | null): boolean =>
  !!error?.code && MISSING_CODES.has(error.code);

const PAGE = 1000;
const ID_CHUNK = 100;

const chunk = <T,>(items: T[], size: number): T[][] => {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
};

const toNum = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

async function withCustomerNames(rows: any[]): Promise<PmJob[]> {
  const customerIds = [...new Set(rows.map((r) => r.customer_id).filter(Boolean))];
  const names = new Map<string, string>();

  for (const ids of chunk(customerIds, ID_CHUNK)) {
    const { data, error } = await supabase
      .schema('common')
      .from('customers')
      .select('id, name, company_name')
      .in('id', ids);
    if (error) throw new Error(describeSupabaseError(error));
    for (const c of data ?? []) names.set(c.id, c.company_name || c.name || '');
  }

  return rows.map((r) => ({ ...r, customer_name: names.get(r.customer_id) ?? '' }));
}

export async function fetchPmJobs(division: string): Promise<PmJob[]> {
  const { data, error } = await supabase
    .schema('neta_ops')
    .from('jobs')
    .select(JOB_COLUMNS)
    .eq('division', division)
    .in('status', ACTIVE_STATUSES)
    .is('deleted_at', null)
    .order('job_number_numeric', { ascending: false, nullsFirst: false });

  if (error) throw new Error(describeSupabaseError(error));
  return withCustomerNames(data ?? []);
}

export async function fetchPmJob(jobId: string): Promise<PmJob | null> {
  const { data, error } = await supabase
    .schema('neta_ops')
    .from('jobs')
    .select(JOB_COLUMNS)
    .eq('id', jobId)
    .maybeSingle();

  if (error) throw new Error(describeSupabaseError(error));
  if (!data) return null;
  return (await withCustomerNames([data]))[0];
}

async function fetchSavedLines(jobIds: string[]): Promise<{ lines: SovLine[]; missing: boolean }> {
  const lines: SovLine[] = [];
  for (const ids of chunk(jobIds, ID_CHUNK)) {
    const { data, error } = await supabase
      .schema('neta_ops')
      .from('job_sov_lines')
      .select('*')
      .in('job_id', ids)
      .order('sort_order', { ascending: true });

    if (error) {
      if (isMissing(error)) return { lines: [], missing: true };
      throw new Error(describeSupabaseError(error));
    }
    for (const row of data ?? []) {
      lines.push({
        ...row,
        quantity: toNum(row.quantity),
        total_hours: toNum(row.total_hours),
        unit_price: toNum(row.unit_price),
        report_slugs: row.report_slugs ?? [],
        source_estimate_ids: row.source_estimate_ids ?? [],
      });
    }
  }
  return { lines, missing: false };
}

/** The estimate sheet saves its data as text, so it has to be unpacked before reading. */
function parseEstimateData(raw: unknown): any {
  if (typeof raw !== 'string') return raw ?? null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/**
 * Each job's quote and quoted amount. A job and its quote can be tied together from
 * either side, so both are checked: miss one and a job with a good estimate looks empty.
 */
async function linkOpportunities(
  jobs: PmJob[],
): Promise<{ quoted: Map<string, number>; oppByJob: Map<string, string> }> {
  const quoted = new Map<string, number>();
  const oppByJob = new Map<string, string>();
  const link = (oppId: string, jobId: string, amount: unknown) => {
    if (oppByJob.has(jobId)) return;
    oppByJob.set(jobId, oppId);
    quoted.set(jobId, toNum(amount));
  };

  for (const ids of chunk(jobs.map((j) => j.id), ID_CHUNK)) {
    const { data, error } = await supabase
      .schema('business')
      .from('opportunities')
      .select('id, job_id, quoted_amount')
      .in('job_id', ids);
    if (error) throw new Error(describeSupabaseError(error));
    for (const opp of data ?? []) link(opp.id, opp.job_id, opp.quoted_amount);
  }

  const viaJob = jobs.filter((j) => j.opportunity_id && !oppByJob.has(j.id));
  for (const ids of chunk([...new Set(viaJob.map((j) => j.opportunity_id!))], ID_CHUNK)) {
    const { data, error } = await supabase
      .schema('business')
      .from('opportunities')
      .select('id, quoted_amount')
      .in('id', ids);
    if (error) throw new Error(describeSupabaseError(error));
    for (const opp of data ?? []) {
      for (const job of viaJob.filter((j) => j.opportunity_id === opp.id)) {
        link(opp.id, job.id, opp.quoted_amount);
      }
    }
  }

  return { quoted, oppByJob };
}

const ESTIMATE_COLUMNS = 'id, opportunity_id, updated_at, status, data, travel_data';

/** A saved estimate boiled down to named, priced rows. */
function toEstimateOption(row: any): EstimateOption {
  const data = parseEstimateData(row.data) ?? {};
  const travel = parseEstimateData(row.travel_data) ?? data.travel_data ?? null;

  let rows: EstimateOption['rows'] = [];
  try {
    rows =
      data.estimateType === 'simple' && Array.isArray(data.simpleItems)
        ? simpleEstimateRows(data.simpleItems, data.simpleMarkupMultiplier)
        : estimateRows(
            Array.isArray(data.sovItems) ? data.sovItems : [],
            sovPricePerLaborHour(data, travel),
          );
  } catch (err) {
    // One odd estimate should not take the whole page down.
    console.error('[PM Dashboard] Could not read estimate', row.id, err);
  }

  const title = typeof data.title === 'string' ? data.title.trim() : '';
  return {
    id: row.id,
    title: title || `Estimate ${String(row.id).slice(0, 6)}`,
    updated_at: row.updated_at,
    status: row.status ?? null,
    rows,
  };
}

/**
 * For quotes whose job has no SOV yet: how many estimates each holds, and the estimate
 * itself when there is exactly one. Only that one is downloaded: estimates are big.
 */
async function fetchSeedEstimates(
  oppIds: string[],
): Promise<Map<string, { count: number; only: EstimateOption | null }>> {
  const idsByOpp = new Map<string, string[]>();
  for (const ids of chunk(oppIds, ID_CHUNK)) {
    const { data, error } = await supabase
      .schema('business')
      .from('estimates')
      .select('id, opportunity_id')
      .in('opportunity_id', ids);
    if (error) throw new Error(describeSupabaseError(error));
    for (const est of data ?? []) {
      idsByOpp.set(est.opportunity_id, [...(idsByOpp.get(est.opportunity_id) ?? []), est.id]);
    }
  }

  const seeds = new Map<string, { count: number; only: EstimateOption | null }>();
  for (const [oppId, ids] of idsByOpp) seeds.set(oppId, { count: ids.length, only: null });

  const soleIds = [...idsByOpp.values()].filter((ids) => ids.length === 1).map((ids) => ids[0]);
  for (const ids of chunk(soleIds, ID_CHUNK)) {
    const { data, error } = await supabase
      .schema('business')
      .from('estimates')
      .select(ESTIMATE_COLUMNS)
      .in('id', ids);
    if (error) throw new Error(describeSupabaseError(error));
    for (const row of (data ?? []) as any[]) {
      seeds.set(row.opportunity_id, { count: 1, only: toEstimateOption(row) });
    }
  }

  return seeds;
}

/** Every estimate on a job's quote, newest first, for the PM to pick from. */
export async function fetchEstimateOptions(job: PmJob): Promise<EstimateOption[]> {
  const { oppByJob } = await linkOpportunities([job]);
  const oppId = oppByJob.get(job.id);
  if (!oppId) return [];

  const { data, error } = await supabase
    .schema('business')
    .from('estimates')
    .select(ESTIMATE_COLUMNS)
    .eq('opportunity_id', oppId)
    .order('created_at', { ascending: false });
  if (error) throw new Error(describeSupabaseError(error));
  return ((data ?? []) as any[]).map(toEstimateOption);
}

async function fetchApprovedChangeOrders(jobIds: string[]): Promise<Map<string, number>> {
  const byJob = new Map<string, ChangeOrder[]>();
  for (const ids of chunk(jobIds, ID_CHUNK)) {
    const { data, error } = await supabase
      .schema('neta_ops')
      .from('job_change_orders')
      .select('job_id, amount, status')
      .in('job_id', ids);
    if (error) {
      if (isMissing(error)) return new Map();
      throw new Error(describeSupabaseError(error));
    }
    for (const co of (data ?? []) as ChangeOrder[]) {
      byJob.set(co.job_id, [...(byJob.get(co.job_id) ?? []), co]);
    }
  }
  return new Map([...byJob].map(([jobId, cos]) => [jobId, summarizeChangeOrders(cos).approvedTotal]));
}

/** Reports marked sent to the customer, grouped by job. */
async function fetchSentReports(jobIds: string[]): Promise<Map<string, SentReport[]>> {
  const byJob = new Map<string, SentReport[]>();
  const seen = new Set<string>();

  for (const ids of chunk(jobIds, ID_CHUNK)) {
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await supabase
        .schema('neta_ops')
        .from('job_assets')
        // Named link: the live database has two identical links from job_assets to assets,
        // and the query fails unless told which one to follow.
        .select(
          'id, job_id, assets!job_assets_asset_id_fkey!inner(id, name, file_url, status, sent_at, updated_at)',
        )
        .in('job_id', ids)
        .eq('assets.status', 'sent')
        .order('id', { ascending: true })
        .range(from, from + PAGE - 1);
      if (error) throw new Error(describeSupabaseError(error));

      for (const link of (data ?? []) as any[]) {
        const asset = Array.isArray(link.assets) ? link.assets[0] : link.assets;
        if (!asset) continue;
        // A report can be linked to a job twice; count it once.
        const key = `${link.job_id}:${asset.id}`;
        if (seen.has(key)) continue;
        seen.add(key);

        // Reports sent before sent_at existed only have the time they were last touched.
        const sentAt = asset.sent_at || asset.updated_at;
        if (!sentAt) continue;

        byJob.set(link.job_id, [
          ...(byJob.get(link.job_id) ?? []),
          {
            id: asset.id,
            slug: getReportSlugFromFileUrl(asset.file_url) ?? OTHER_FILES_KEY,
            name: asset.name ?? '',
            sent_at: sentAt,
          },
        ]);
      }

      if ((data ?? []).length < PAGE) break;
    }
  }
  return byJob;
}

async function fetchHours(
  jobIds: string[],
): Promise<{ hours: Map<string, Record<string, number>>; missing: boolean }> {
  const hours = new Map<string, Record<string, number>>();
  for (const ids of chunk(jobIds, ID_CHUNK)) {
    const { data, error } = await supabase
      .schema('common')
      .rpc('time_job_hours_by_month', { p_job_ids: ids });
    if (error) {
      if (isMissing(error)) return { hours: new Map(), missing: true };
      throw new Error(describeSupabaseError(error));
    }
    for (const row of (data ?? []) as any[]) {
      const byMonth = hours.get(row.job_id) ?? {};
      byMonth[row.month] = toNum(row.hours);
      hours.set(row.job_id, byMonth);
    }
  }
  return { hours, missing: false };
}

/**
 * SOV, sent reports, hours, and contract value for a set of jobs, in a handful of
 * requests no matter how many jobs there are.
 */
export async function loadJobBundles(jobs: PmJob[]): Promise<BundleResult> {
  const jobIds = jobs.map((j) => j.id);
  if (jobIds.length === 0) return { bundles: {}, setupMissing: false };

  const [saved, reports, hours, changeOrders] = await Promise.all([
    fetchSavedLines(jobIds),
    fetchSentReports(jobIds),
    fetchHours(jobIds),
    fetchApprovedChangeOrders(jobIds),
  ]);

  const savedByJob = new Map<string, SovLine[]>();
  for (const line of saved.lines) {
    savedByJob.set(line.job_id, [...(savedByJob.get(line.job_id) ?? []), line]);
  }

  const { quoted, oppByJob } = await linkOpportunities(jobs);
  const seedOppIds = jobIds.filter((id) => !savedByJob.has(id)).flatMap((id) => oppByJob.get(id) ?? []);
  const seeds = await fetchSeedEstimates([...new Set(seedOppIds)]);

  const bundles: Record<string, JobBundle> = {};
  for (const jobId of jobIds) {
    const jobReports = reports.get(jobId) ?? [];
    const quotedAmount = quoted.get(jobId) ?? 0;
    const savedLines = savedByJob.get(jobId);
    const seed = savedLines ? undefined : seeds.get(oppByJob.get(jobId) ?? '');

    bundles[jobId] = {
      lines:
        savedLines ??
        guessLineSlugs(
          addEstimatesToLines(jobId, [], seed?.only ? [seed.only] : [], () => crypto.randomUUID()),
          [...new Set(jobReports.map((r) => r.slug))],
        ),
      seeded: !savedLines,
      estimateCount: seed?.count ?? 0,
      reports: jobReports,
      hoursByMonth: hours.hours.get(jobId) ?? {},
      quotedAmount,
      approvedChangeOrders: changeOrders.get(jobId) ?? 0,
    };
  }

  return { bundles, setupMissing: saved.missing || hours.missing };
}

/**
 * Replaces a job's SOV with `lines`. Last save wins.
 * Ids are made in the browser, so sending the same save twice stores it once.
 */
export async function saveSovLines(jobId: string, lines: SovLine[]): Promise<void> {
  const rows = lines.map((line, i) => ({
    id: line.id,
    job_id: jobId,
    sort_order: i,
    item: line.item.trim(),
    quantity: line.quantity,
    total_hours: line.total_hours,
    unit_price: line.unit_price,
    report_slugs: line.report_slugs,
    source_estimate_ids: line.source_estimate_ids,
  }));

  if (rows.length > 0) {
    const upsert = (payload: Record<string, unknown>[]) =>
      withWriteRetry(
        () => supabase.schema('neta_ops').from('job_sov_lines').upsert(payload, { onConflict: 'id' }),
        { label: 'save SOV lines' },
      );

    let { error } = await upsert(rows);
    // PGRST204 = the table has no source_estimate_ids column yet, because
    // pm_dashboard_estimate_sources.sql has not been run. Save everything else.
    if ((error as { code?: string } | null)?.code === 'PGRST204') {
      ({ error } = await upsert(rows.map(({ source_estimate_ids, ...rest }) => rest)));
    }
    if (error) throw new Error(describeSupabaseError(error));
  }

  // Drop lines the PM removed.
  const { error: deleteError } = await withWriteRetry(
    () => {
      const query = supabase.schema('neta_ops').from('job_sov_lines').delete().eq('job_id', jobId);
      return rows.length > 0
        ? query.not('id', 'in', `(${rows.map((r) => r.id).join(',')})`)
        : query;
    },
    { label: 'remove SOV lines' },
  );
  if (deleteError) throw new Error(describeSupabaseError(deleteError));
}

// QuickBooks answers are kept for a few minutes so flipping between the list and a job,
// or changing the month, does not ask QuickBooks again.
const BILLED_TTL_MS = 10 * 60 * 1000;
const billedCache = new Map<string, { at: number; amount: Promise<number> }>();

/** Total invoiced in QuickBooks for a job's QuickBooks project. */
export function fetchBilledToDate(quickbooksProjectId: string): Promise<number> {
  const hit = billedCache.get(quickbooksProjectId);
  if (hit && Date.now() - hit.at < BILLED_TTL_MS) return hit.amount;

  const amount = getQBOInvoicesByCustomer(quickbooksProjectId).then((invoices) =>
    invoices.reduce((sum, inv) => sum + inv.totalAmt, 0),
  );
  billedCache.set(quickbooksProjectId, { at: Date.now(), amount });
  return amount;
}

/** What the job is worth: quoted amount (or the SOV total if none) plus approved change orders. */
export const contractTotal = (bundle: JobBundle, lines: SovLine[] = bundle.lines): number =>
  (bundle.quotedAmount > 0 ? bundle.quotedAmount : sovTotal(lines)) + bundle.approvedChangeOrders;

export const reportTypeLabel = (slug: string): string => {
  if (slug === OTHER_FILES_KEY) return 'Other files';
  return (
    REPORT_NAMES[slug] ??
    slug.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
  );
};
