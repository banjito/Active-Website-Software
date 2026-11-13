import { supabase } from '@/lib/supabase';
import { describeSupabaseError, withWriteRetry } from '@/lib/supabaseRetry';
import { getReportSlugFromFileUrl, REPORT_NAMES } from '@/components/reports/reportMappings';
import { getQBOInvoicesByCustomer } from '@/services/quickbooksService';
import {
  fetchChangeOrderLetterNumbers,
  summarizeChangeOrders,
  type ChangeOrder,
} from '@/services/changeOrderService';
import { sovPricePerLaborHour, summarizeEstimateSnapshot } from '@/lib/estimatePricing';
import { DEFAULT_ESTIMATING_PRESETS } from '@/services/estimatingPresetsService';
import { ACTIVE_JOB_STATUSES } from '@/services/pmAccessService';
import {
  ChecklistSetupMissingError,
  fetchChecklistItems,
  fetchChecklistJobFacts,
  fetchChecklistSteps,
  summarizeJobChecklist,
} from '@/services/jobChecklistService';
import {
  OTHER_FILES_KEY,
  addEstimatesToLines,
  changeOrderLines,
  estimateRows,
  estimateTotal,
  guessLineSlugs,
  isOriginalLine,
  simpleEstimateRows,
  sovTotal,
  type EstimateOption,
  type GcSchedule,
  type SavedWeeks,
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
  project_manager_id: string | null;
}

/** A Change Order with lines on the SOV: approved, or with lines saved before. */
export interface SovChangeOrder {
  id: string;
  number: number;
  title: string;
  amount: number;
  status: ChangeOrder['status'];
  /** Letter proposal number, when it has its own quote */
  letter: string | null;
  /** Its lines were just copied from its estimate and are not saved yet */
  seeded: boolean;
}

/** Everything the dashboard needs to know about one job, apart from QuickBooks billing. */
export interface JobBundle {
  /** Original contract lines first, then each Change Order's lines (change_order_id set) */
  lines: SovLine[];
  /** True when the original lines come straight from the estimate and nothing is saved yet */
  seeded: boolean;
  /** Change Orders on the SOV, in number order */
  changeOrders: SovChangeOrder[];
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
  /** Change orders drafted or sent, not yet approved */
  pendingChangeOrders: number;
  /** The PM's weekly SOV updates (empty until sov_weekly.sql is run) */
  weeks: SavedWeeks;
  /** General conditions schedule from SOV setup */
  gc: GcSchedule | null;
}

export interface BundleResult {
  bundles: Record<string, JobBundle>;
  /** True when pm_dashboard.sql has not been run on this database yet */
  setupMissing: boolean;
}

const JOB_COLUMNS =
  'id, job_number, title, status, division, customer_id, opportunity_id, quickbooks_project_id, estimated_man_hours, start_date, project_manager_id';

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
    .in('status', ACTIVE_JOB_STATUSES)
    .is('deleted_at', null)
    .order('job_number_numeric', { ascending: false, nullsFirst: false });

  if (error) throw new Error(describeSupabaseError(error));
  return withCustomerNames(data ?? []);
}

/** Every active job at every location, for the Office home. */
export async function fetchActiveJobs(): Promise<PmJob[]> {
  const rows: any[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .schema('neta_ops')
      .from('jobs')
      .select(JOB_COLUMNS)
      .in('status', ACTIVE_JOB_STATUSES)
      .is('deleted_at', null)
      .order('job_number_numeric', { ascending: false, nullsFirst: false })
      .range(from, from + PAGE - 1);
    if (error) throw new Error(describeSupabaseError(error));
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE) break;
  }
  return withCustomerNames(rows);
}

/** Active jobs where this person is the PM, at every location. */
export async function fetchMyPmJobs(userId: string): Promise<PmJob[]> {
  const { data, error } = await supabase
    .schema('neta_ops')
    .from('jobs')
    .select(JOB_COLUMNS)
    .eq('project_manager_id', userId)
    .in('status', ACTIVE_JOB_STATUSES)
    .is('deleted_at', null)
    .order('job_number_numeric', { ascending: false, nullsFirst: false });

  if (error) throw new Error(describeSupabaseError(error));
  return withCustomerNames(data ?? []);
}

/** PM names for the location view. Names are nice-to-have: a failed lookup returns none. */
export async function fetchPmNames(userIds: string[]): Promise<Record<string, string>> {
  const names: Record<string, string> = {};
  for (const ids of chunk([...new Set(userIds.filter(Boolean))], ID_CHUNK)) {
    const { data, error } = await supabase
      .schema('common')
      .from('profiles')
      .select('id, full_name, email')
      .in('id', ids);
    if (error) {
      console.error('[PM Dashboard] PM names failed to load:', error);
      return names;
    }
    for (const p of data ?? []) names[p.id] = p.full_name || p.email || '';
  }
  return names;
}

/** Checklist signals for the "Needs attention" column. */
export interface JobAttention {
  lateSteps: number;
  noLead: boolean;
}

/**
 * Late checklist steps and missing leads per job. Returns null when the checklist
 * tables are not set up, so the column can simply leave those flags out.
 */
export async function fetchJobAttention(jobs: PmJob[]): Promise<Record<string, JobAttention> | null> {
  const ids = jobs.map((j) => j.id);
  if (ids.length === 0) return {};
  try {
    const [steps, items, facts] = await Promise.all([
      fetchChecklistSteps(),
      fetchChecklistItems(ids),
      fetchChecklistJobFacts(ids),
    ]);
    const factsById = new Map(facts.map((f) => [f.id, f]));
    const today = new Date();
    const out: Record<string, JobAttention> = {};
    for (const id of ids) {
      const summary = summarizeJobChecklist(
        steps,
        items.filter((i) => i.job_id === id),
        factsById.get(id),
        today,
      );
      const lead = summary.statuses.find((st) => st.step.key === 'lead_assigned');
      out[id] = {
        lateSteps: summary.late,
        noLead: !!lead && (lead.display === 'open' || lead.display === 'late'),
      };
    }
    return out;
  } catch (err) {
    if (err instanceof ChecklistSetupMissingError) return null;
    throw err;
  }
}

/** One person's hours on one job on one day, for the Crew tab. */
export interface CrewRow {
  job_id: string;
  profile_id: string;
  full_name: string | null;
  /** YYYY-MM-DD */
  work_date: string;
  /** Finished punches only */
  hours: number;
  /** Set when they are on the clock on this job right now */
  clocked_in_at: string | null;
}

/**
 * Who worked these jobs in the week starting on weekStart (a Sunday), plus anyone on
 * the clock on them now. The database only answers for jobs the caller may see.
 */
export async function fetchCrew(
  jobIds: string[],
  weekStart: string,
): Promise<{ rows: CrewRow[]; missing: boolean }> {
  const rows: CrewRow[] = [];
  for (const ids of chunk(jobIds, ID_CHUNK)) {
    const { data, error } = await supabase
      .schema('common')
      .rpc('time_job_crew', { p_job_ids: ids, p_week_start: weekStart });
    if (error) {
      if (isMissing(error)) return { rows: [], missing: true };
      throw new Error(describeSupabaseError(error));
    }
    for (const r of (data ?? []) as any[]) rows.push({ ...r, hours: toNum(r.hours) });
  }
  return { rows, missing: false };
}

/** The customer details the SOV printout needs. */
export interface SovCustomer {
  name: string;
  address: string | null;
  /** 0 to 100. 0 when the customer holds nothing back (or customer_retainage.sql isn't run). */
  retainagePct: number;
}

export async function fetchSovCustomer(customerId: string | null): Promise<SovCustomer | null> {
  if (!customerId) return null;
  // select * so this still works before customer_retainage.sql adds the column
  const { data, error } = await supabase
    .schema('common')
    .from('customers')
    .select('*')
    .eq('id', customerId)
    .maybeSingle();
  if (error) throw new Error(describeSupabaseError(error));
  if (!data) return null;
  return {
    name: data.company_name || data.name || '',
    address: data.address || null,
    retainagePct: Number(data.retainage_pct) || 0,
  };
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
        line_type: row.line_type ?? 'scope',
        multiplier: toNum(row.multiplier) || 1,
        change_order_id: row.change_order_id ?? null,
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

  // Mobilization rides on its own SOV line (see addEstimatesToLines)
  let mobilization: EstimateOption['mobilization'];
  if (data.estimateType !== 'simple') {
    try {
      const markup = Number(data.materialMarkup);
      const summary = summarizeEstimateSnapshot(
        data,
        travel,
        Number.isFinite(markup) && markup > 0 ? markup : DEFAULT_ESTIMATING_PRESETS.default_markup_factor,
      );
      if (summary.mobilization > 0) {
        mobilization = { total: summary.mobilization, added: summary.mobilizationAdded };
      }
    } catch (err) {
      console.error('[PM Dashboard] Could not read mobilization', row.id, err);
    }
  }

  const title = typeof data.title === 'string' ? data.title.trim() : '';
  return {
    id: row.id,
    title: title || `Estimate ${String(row.id).slice(0, 6)}`,
    updated_at: row.updated_at,
    status: row.status ?? null,
    rows,
    mobilization,
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

type JobChangeOrderRow = Pick<ChangeOrder, 'id' | 'job_id' | 'co_number' | 'title' | 'amount' | 'status'> & {
  opportunity_id: string | null;
};

/** Every Change Order on these jobs, grouped by job. */
async function fetchJobChangeOrders(jobIds: string[]): Promise<Map<string, JobChangeOrderRow[]>> {
  const byJob = new Map<string, JobChangeOrderRow[]>();
  for (const ids of chunk(jobIds, ID_CHUNK)) {
    const { data, error } = await supabase
      .schema('neta_ops')
      .from('job_change_orders')
      .select('id, job_id, co_number, title, amount, status, opportunity_id')
      .in('job_id', ids)
      .order('co_number', { ascending: true });
    if (error) {
      if (isMissing(error)) return new Map();
      throw new Error(describeSupabaseError(error));
    }
    for (const co of (data ?? []) as any[]) {
      byJob.set(co.job_id, [
        ...(byJob.get(co.job_id) ?? []),
        { ...co, amount: toNum(co.amount), opportunity_id: co.opportunity_id ?? null },
      ]);
    }
  }
  return byJob;
}

/**
 * The estimate each Change Order quote was priced from, keyed by quote id. A quote with
 * several sheets (options, revisions) uses the one closest to the approved amount.
 */
async function fetchChangeOrderEstimates(
  wanted: { oppId: string; amount: number }[],
): Promise<Map<string, EstimateOption>> {
  const amountByOpp = new Map(wanted.map((w) => [w.oppId, w.amount]));
  const best = new Map<string, EstimateOption>();
  for (const ids of chunk([...amountByOpp.keys()], ID_CHUNK)) {
    const { data, error } = await supabase
      .schema('business')
      .from('estimates')
      .select(ESTIMATE_COLUMNS)
      .in('opportunity_id', ids)
      .order('created_at', { ascending: false });
    if (error) throw new Error(describeSupabaseError(error));
    for (const row of (data ?? []) as any[]) {
      const option = toEstimateOption(row);
      if (option.rows.length === 0) continue;
      const amount = amountByOpp.get(row.opportunity_id) ?? 0;
      const gap = (o: EstimateOption) => Math.abs(estimateTotal(o) + (o.mobilization?.added ?? 0) - amount);
      const current = best.get(row.opportunity_id);
      if (!current || gap(option) < gap(current)) best.set(row.opportunity_id, option);
    }
  }
  return best;
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

  const [saved, reports, hours, changeOrders, weeks, gcByJob] = await Promise.all([
    fetchSavedLines(jobIds),
    fetchSentReports(jobIds),
    fetchHours(jobIds),
    fetchJobChangeOrders(jobIds),
    fetchSovWeeks(jobIds),
    fetchGcSchedules(jobIds),
  ]);

  const savedByJob = new Map<string, SovLine[]>();
  for (const line of saved.lines) {
    savedByJob.set(line.job_id, [...(savedByJob.get(line.job_id) ?? []), line]);
  }

  // Change Orders that belong on the SOV: approved, or with lines saved already.
  // Approved ones with no lines yet get them copied from their estimate.
  const savedCoIds = new Set(saved.lines.flatMap((line) => line.change_order_id ?? []));
  const sovCos = [...changeOrders.values()].flat().filter((co) => co.status === 'approved' || savedCoIds.has(co.id));
  const toSeed = sovCos.filter((co) => !savedCoIds.has(co.id) && co.opportunity_id);
  const coOppIds = [...new Set(sovCos.flatMap((co) => co.opportunity_id ?? []))];

  const [{ quoted, oppByJob }, coEstimates, letters] = await Promise.all([
    linkOpportunities(jobs),
    fetchChangeOrderEstimates(toSeed.map((co) => ({ oppId: co.opportunity_id!, amount: co.amount }))),
    // Letter numbers are a label only; the SOV still works without them.
    fetchChangeOrderLetterNumbers(coOppIds).catch((err) => {
      console.error('[PM Dashboard] Change Order letter numbers failed to load:', err);
      return {} as Record<string, string>;
    }),
  ]);
  const seedOppIds = jobIds.filter((id) => !savedByJob.has(id)).flatMap((id) => oppByJob.get(id) ?? []);
  const seeds = await fetchSeedEstimates([...new Set(seedOppIds)]);

  const bundles: Record<string, JobBundle> = {};
  for (const jobId of jobIds) {
    const jobReports = reports.get(jobId) ?? [];
    const quotedAmount = quoted.get(jobId) ?? 0;
    const savedLines = savedByJob.get(jobId);
    const seed = savedLines ? undefined : seeds.get(oppByJob.get(jobId) ?? '');
    const originalLines =
      savedLines?.filter(isOriginalLine) ??
      guessLineSlugs(
        addEstimatesToLines(jobId, [], seed?.only ? [seed.only] : [], () => crypto.randomUUID()),
        [...new Set(jobReports.map((r) => r.slug))],
      );

    const jobCos: SovChangeOrder[] = [];
    const coLines: SovLine[] = [];
    for (const co of changeOrders.get(jobId) ?? []) {
      const hasLines = savedCoIds.has(co.id);
      if (!hasLines && co.status !== 'approved') continue;
      coLines.push(
        ...(hasLines
          ? savedLines!.filter((line) => line.change_order_id === co.id)
          : changeOrderLines(
              jobId,
              { id: co.id, number: co.co_number, title: co.title ?? '', amount: co.amount },
              co.opportunity_id ? coEstimates.get(co.opportunity_id) ?? null : null,
              () => crypto.randomUUID(),
            )),
      );
      jobCos.push({
        id: co.id,
        number: co.co_number,
        title: co.title ?? '',
        amount: co.amount,
        status: co.status,
        letter: co.opportunity_id ? letters[co.opportunity_id] ?? null : null,
        seeded: !hasLines,
      });
    }

    // Only amount and status are read
    const coTotals = summarizeChangeOrders((changeOrders.get(jobId) ?? []) as unknown as ChangeOrder[]);
    bundles[jobId] = {
      lines: [...originalLines, ...coLines],
      seeded: !savedLines,
      changeOrders: jobCos,
      estimateCount: seed?.count ?? 0,
      reports: jobReports,
      hoursByMonth: hours.hours.get(jobId) ?? {},
      quotedAmount,
      approvedChangeOrders: coTotals.approvedTotal,
      pendingChangeOrders: coTotals.pendingCount,
      weeks: weeks.get(jobId) ?? {},
      gc: gcByJob.get(jobId) ?? null,
    };
  }

  return { bundles, setupMissing: saved.missing || hours.missing };
}

/**
 * Replaces a job's SOV with `lines`. Last save wins.
 * Ids are made in the browser, so sending the same save twice stores it once.
 */
// ---------------------------------------------------------------------------
// Weekly SOV updates (item 9). Tables: database/migrations/sov_weekly.sql
// ---------------------------------------------------------------------------

/** Every saved weekly update for these jobs, with its quantities. */
async function fetchSovWeeks(jobIds: string[]): Promise<Map<string, SavedWeeks>> {
  const byJob = new Map<string, SavedWeeks>();
  const periodJob = new Map<string, { jobId: string; week: string }>();
  for (const ids of chunk(jobIds, ID_CHUNK)) {
    const { data, error } = await supabase
      .schema('neta_ops')
      .from('job_sov_periods')
      .select('id, job_id, week_start, status, wip_amount, hours, approved_at')
      .in('job_id', ids);
    if (error) {
      if (isMissing(error)) return new Map();
      throw new Error(describeSupabaseError(error));
    }
    for (const p of (data ?? []) as any[]) {
      const weeks = byJob.get(p.job_id) ?? {};
      weeks[p.week_start] = {
        id: p.id,
        status: p.status,
        quantities: {},
        wip_amount: p.wip_amount == null ? null : toNum(p.wip_amount),
        hours: p.hours == null ? null : toNum(p.hours),
        approved_at: p.approved_at ?? null,
      };
      byJob.set(p.job_id, weeks);
      periodJob.set(p.id, { jobId: p.job_id, week: p.week_start });
    }
  }
  for (const ids of chunk([...periodJob.keys()], ID_CHUNK)) {
    const { data, error } = await supabase
      .schema('neta_ops')
      .from('job_sov_quantities')
      .select('period_id, line_id, quantity')
      .in('period_id', ids);
    if (error) throw new Error(describeSupabaseError(error));
    for (const q of (data ?? []) as any[]) {
      const where = periodJob.get(q.period_id);
      if (!where) continue;
      byJob.get(where.jobId)![where.week].quantities[q.line_id] = toNum(q.quantity);
    }
  }
  return byJob;
}

async function fetchGcSchedules(jobIds: string[]): Promise<Map<string, GcSchedule>> {
  const out = new Map<string, GcSchedule>();
  for (const ids of chunk(jobIds, ID_CHUNK)) {
    const { data, error } = await supabase
      .schema('neta_ops')
      .from('job_sov_settings')
      .select('job_id, gc_start, gc_months')
      .in('job_id', ids);
    if (error) {
      if (isMissing(error)) return out;
      throw new Error(describeSupabaseError(error));
    }
    for (const row of (data ?? []) as any[]) {
      out.set(row.job_id, { start: row.gc_start ?? null, months: row.gc_months == null ? null : toNum(row.gc_months) });
    }
  }
  return out;
}

/** Saves a week's numbers. Approving also stamps the work-in-progress $ and hours. */
export async function saveSovWeek(
  jobId: string,
  week: string,
  quantities: Record<string, number>,
  opts: { approve: boolean; wipAmount: number; hours: number; userId?: string },
): Promise<void> {
  const now = new Date().toISOString();
  const { data: period, error } = await withWriteRetry(
    () =>
      supabase
        .schema('neta_ops')
        .from('job_sov_periods')
        .upsert(
          {
            job_id: jobId,
            week_start: week,
            status: opts.approve ? 'approved' : 'draft',
            saved_by: opts.userId ?? null,
            saved_at: now,
            ...(opts.approve
              ? { approved_by: opts.userId ?? null, approved_at: now, wip_amount: opts.wipAmount, hours: opts.hours }
              : { approved_by: null, approved_at: null }),
          },
          { onConflict: 'job_id,week_start' },
        )
        .select('id')
        .single(),
    { label: 'save SOV week' },
  );
  if (error) throw new Error(describeSupabaseError(error));
  const periodId = (period as any).id as string;

  const rows = Object.entries(quantities).map(([line_id, quantity]) => ({
    period_id: periodId,
    line_id,
    quantity: Math.max(0, quantity || 0),
  }));
  if (rows.length) {
    const { error: qError } = await withWriteRetry(
      () =>
        supabase
          .schema('neta_ops')
          .from('job_sov_quantities')
          .upsert(rows, { onConflict: 'period_id,line_id' }),
      { label: 'save SOV week quantities' },
    );
    if (qError) throw new Error(describeSupabaseError(qError));
  }
}

/** Opens an approved week back up for changes. */
export async function reopenSovWeek(jobId: string, week: string): Promise<void> {
  const { error } = await supabase
    .schema('neta_ops')
    .from('job_sov_periods')
    .update({ status: 'draft', approved_by: null, approved_at: null })
    .eq('job_id', jobId)
    .eq('week_start', week);
  if (error) throw new Error(describeSupabaseError(error));
}

/** week (Sunday) -> clock hours plus temp hours, for one job. Empty until sov_weekly.sql runs. */
export async function fetchHoursByWeek(jobId: string): Promise<Record<string, number>> {
  const { data, error } = await supabase.schema('common').rpc('time_job_hours_by_week', { p_job_ids: [jobId] });
  if (error) {
    if (isMissing(error)) return {};
    throw new Error(describeSupabaseError(error));
  }
  const out: Record<string, number> = {};
  for (const row of (data ?? []) as any[]) out[row.week_start] = toNum(row.hours);
  return out;
}

export type BillingFrequency = 'monthly' | 'weekly' | 'one_time';

export interface SovSettings {
  billing_frequency: BillingFrequency;
  gc_monthly: number | null;
  gc_months: number | null;
  gc_start: string | null;
  /** General conditions came out of the other lines, so the total stayed the same */
  gc_from_price: boolean;
}

export const DEFAULT_SOV_SETTINGS: SovSettings = {
  billing_frequency: 'monthly',
  gc_monthly: null,
  gc_months: null,
  gc_start: null,
  gc_from_price: true,
};

/** Billing frequency and general conditions for one job. Null when sov_setup.sql hasn't run. */
export async function fetchSovSettings(jobId: string): Promise<SovSettings | null> {
  const { data, error } = await supabase
    .schema('neta_ops')
    .from('job_sov_settings')
    .select('billing_frequency, gc_monthly, gc_months, gc_start, gc_from_price')
    .eq('job_id', jobId)
    .maybeSingle();
  if (error) {
    if (isMissing(error)) return null;
    throw new Error(describeSupabaseError(error));
  }
  if (!data) return { ...DEFAULT_SOV_SETTINGS };
  return {
    billing_frequency: (data.billing_frequency as BillingFrequency) ?? 'monthly',
    gc_monthly: data.gc_monthly == null ? null : toNum(data.gc_monthly),
    gc_months: data.gc_months == null ? null : toNum(data.gc_months),
    gc_start: data.gc_start ?? null,
    gc_from_price: data.gc_from_price ?? true,
  };
}

export async function saveSovSettings(jobId: string, settings: SovSettings, userId?: string): Promise<void> {
  const { error } = await withWriteRetry(
    () =>
      supabase
        .schema('neta_ops')
        .from('job_sov_settings')
        .upsert(
          { job_id: jobId, ...settings, updated_at: new Date().toISOString(), updated_by: userId ?? null },
          { onConflict: 'job_id' },
        ),
    { label: 'save SOV settings' },
  );
  if (error) throw new Error(describeSupabaseError(error));
}

export async function saveSovLines(jobId: string, lines: SovLine[]): Promise<void> {
  // Original lines first, then each Change Order's lines, so the order holds on reload
  const ordered = [...lines.filter(isOriginalLine), ...lines.filter((line) => !isOriginalLine(line))];
  const rows = ordered.map((line, i) => ({
    id: line.id,
    job_id: jobId,
    sort_order: i,
    item: line.item.trim(),
    quantity: line.quantity,
    total_hours: line.total_hours,
    unit_price: line.unit_price,
    report_slugs: line.report_slugs,
    source_estimate_ids: line.source_estimate_ids,
    line_type: line.line_type ?? 'scope',
    multiplier: line.multiplier ?? 1,
    change_order_id: line.change_order_id ?? null,
  }));

  if (rows.length > 0) {
    const upsert = (payload: Record<string, unknown>[]) =>
      withWriteRetry(
        () => supabase.schema('neta_ops').from('job_sov_lines').upsert(payload, { onConflict: 'id' }),
        { label: 'save SOV lines' },
      );

    let { error } = await upsert(rows);
    // PGRST204 = a column is missing because pm_dashboard_estimate_sources.sql,
    // sov_setup.sql or sov_change_orders.sql has not been run. Save everything else.
    // Change Order lines are left out: saved without their Change Order they would
    // count as original contract lines. They get copied in again on the next load.
    if ((error as { code?: string } | null)?.code === 'PGRST204') {
      ({ error } = await upsert(
        rows
          .filter((row) => !row.change_order_id)
          .map(({ source_estimate_ids, line_type, multiplier, change_order_id, ...rest }) => rest),
      ));
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

/**
 * What the job is worth: quoted amount (or the original SOV lines if none) plus approved
 * Change Orders. Change Order lines are left out of the SOV part so they don't count twice.
 */
export const contractTotal = (bundle: JobBundle, lines: SovLine[] = bundle.lines): number =>
  (bundle.quotedAmount > 0 ? bundle.quotedAmount : sovTotal(lines.filter(isOriginalLine))) +
  bundle.approvedChangeOrders;

export const reportTypeLabel = (slug: string): string => {
  if (slug === OTHER_FILES_KEY) return 'Other files';
  return (
    REPORT_NAMES[slug] ??
    slug.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
  );
};
