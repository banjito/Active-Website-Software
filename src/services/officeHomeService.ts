import { getQBOInvoiceTotalsByCustomer } from '@/services/quickbooksService';
import {
  contractTotal,
  fetchActiveJobs,
  loadJobBundles,
  type JobBundle,
  type PmJob,
} from '@/services/pmDashboardService';
import { completedPct, mergedProgress } from '@/utils/pmDashboardCalculations';

// Office home (Project Management scope, item 16): every active job's money in one list.
// Contract numbers use the same math as the PM Dashboard (contractTotal), so the pages agree.

export interface OfficeJobRow {
  job: PmJob;
  /** Quoted amount, or the original SOV lines when there's no quote */
  original: number;
  /** Approved Change Orders */
  changeOrders: number;
  total: number;
  /** Null when QuickBooks couldn't be reached or the job isn't linked */
  billed: number | null;
  linked: boolean;
  /** Work done from the SOV, weighted by price. Null without an SOV. */
  workDone: number | null;
  leftToBill: number | null;
}

export interface OfficeJobs {
  rows: OfficeJobRow[];
  /** Why Billed is blank for every job, if it is */
  billedError: string | null;
  setupMissing: boolean;
}

// One QuickBooks pull covers every job. Kept for a few minutes so coming back is quick.
const BILLED_TTL_MS = 10 * 60 * 1000;
let billedCache: { at: number; totals: Promise<Map<string, number>> } | null = null;

export function fetchBilledByProject(): Promise<Map<string, number>> {
  if (billedCache && Date.now() - billedCache.at < BILLED_TTL_MS) return billedCache.totals;
  const totals = getQBOInvoiceTotalsByCustomer();
  billedCache = { at: Date.now(), totals };
  // A failed pull shouldn't stick for ten minutes
  totals.catch(() => {
    billedCache = null;
  });
  return totals;
}

export function officeRow(job: PmJob, bundle: JobBundle, billedTotals: Map<string, number> | null): OfficeJobRow {
  const total = contractTotal(bundle);
  const changeOrders = bundle.approvedChangeOrders;
  const linked = !!job.quickbooks_project_id;
  const billed = billedTotals && linked ? billedTotals.get(job.quickbooks_project_id!) ?? 0 : null;
  const progress = mergedProgress(bundle.lines, bundle.reports, bundle.weeks, bundle.gc);
  return {
    job,
    original: total - changeOrders,
    changeOrders,
    total,
    billed,
    linked,
    workDone: bundle.lines.length ? completedPct(bundle.lines, progress) : null,
    leftToBill: billed == null ? null : total - billed,
  };
}

export async function loadOfficeJobs(): Promise<OfficeJobs> {
  const jobs = await fetchActiveJobs();
  const [result, billed] = await Promise.all([
    loadJobBundles(jobs),
    fetchBilledByProject()
      .then((totals) => ({ totals, error: null as string | null }))
      .catch((err) => {
        console.error('[Office] QuickBooks invoices failed to load:', err);
        return {
          totals: null,
          error: err instanceof Error ? err.message : 'QuickBooks could not be reached.',
        };
      }),
  ]);
  return {
    rows: jobs.filter((job) => result.bundles[job.id]).map((job) => officeRow(job, result.bundles[job.id], billed.totals)),
    billedError: billed.error,
    setupMissing: result.setupMissing,
  };
}
