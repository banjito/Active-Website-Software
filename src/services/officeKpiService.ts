import { addDays, format, startOfYear, subDays } from 'date-fns';
import { supabase } from '@/lib/supabase';
import { describeSupabaseError, withWriteRetry } from '@/lib/supabaseRetry';
import {
  findQBOClassId,
  getQBOAccountsByType,
  getQBOClassInvoiced,
  getQBOClassReceived,
  getQBOInvoiceSummaries,
  getQBOProfitAndLoss,
  type QBOAccountBalance,
  type QBOProfitAndLoss,
} from '@/services/quickbooksService';

// Company KPIs on the Office home (Admins only), matching accounting's scorecard.
// Everything comes from AMP's QuickBooks except "days to bill", which also needs ampOS
// completed dates. Cash flow accuracy needs a forecast ampOS doesn't have, so it's left out.

/** The QuickBooks class that holds AMP International. */
export const INTERNATIONAL_CLASS = 'AMP International';
const SETTINGS_KEY = 'office_kpi_accounts';
/** Days allowed between a job's completed date and its invoice. */
const BILL_WITHIN_DAYS = 3;
/** How far back "days to bill" looks, ending BILL_WITHIN_DAYS ago so every job has had its chance. */
const BILL_WINDOW_DAYS = 30;

export interface KpiAccounts {
  cash_reserve: string | null;
  operating: string | null;
}

export type KpiFormat = 'money' | 'pct';

export interface Kpi {
  id: string;
  label: string;
  format: KpiFormat;
  /** Null while it couldn't be worked out; see error */
  value: number | null;
  note: string;
  error?: string;
}

export interface KpiPeriods {
  ytdStart: string;
  today: string;
  /** Last full week, Sunday to Saturday */
  weekStart: string;
  weekEnd: string;
}

const ymd = (d: Date) => format(d, 'yyyy-MM-dd');

export function kpiPeriods(now = new Date()): KpiPeriods {
  const lastSat = subDays(now, now.getDay() + 1);
  return {
    ytdStart: ymd(startOfYear(now)),
    today: ymd(now),
    weekStart: ymd(subDays(lastSat, 6)),
    weekEnd: ymd(lastSat),
  };
}

const shortDay = (value: string) => format(new Date(`${value}T00:00:00`), 'MMM d');

export async function fetchKpiAccounts(): Promise<KpiAccounts> {
  const { data, error } = await supabase
    .schema('common')
    .from('app_settings')
    .select('value')
    .eq('key', SETTINGS_KEY)
    .maybeSingle();
  if (error) throw new Error(describeSupabaseError(error));
  const value = (data?.value ?? {}) as Partial<KpiAccounts>;
  return { cash_reserve: value.cash_reserve ?? null, operating: value.operating ?? null };
}

export async function saveKpiAccounts(accounts: KpiAccounts): Promise<void> {
  const { error } = await withWriteRetry(() =>
    supabase
      .schema('common')
      .from('app_settings')
      .upsert({ key: SETTINGS_KEY, value: accounts, updated_at: new Date().toISOString() }, { onConflict: 'key' }),
  );
  if (error) throw new Error(describeSupabaseError(error));
}

/** Expenses as the scorecard means them: cost of goods, operating and other expenses. */
const allExpenses = (pl: QBOProfitAndLoss) => pl.cogs + pl.expenses + pl.otherExpenses;
const profitPct = (pl: QBOProfitAndLoss) => (pl.income ? pl.netIncome / pl.income : null);

const failed = (err: unknown) => (err instanceof Error ? err.message : 'QuickBooks could not be reached.');

/** Jobs completed in the window that were invoiced within BILL_WITHIN_DAYS of completion. */
async function daysToBill(now: Date): Promise<{ onTime: number; total: number; from: string; to: string }> {
  const to = ymd(subDays(now, BILL_WITHIN_DAYS));
  const from = ymd(subDays(now, BILL_WITHIN_DAYS + BILL_WINDOW_DAYS));
  const { data, error } = await supabase
    .schema('neta_ops')
    .from('jobs')
    .select('id, completed_date, quickbooks_project_id')
    .gte('completed_date', from)
    .lte('completed_date', to)
    .not('quickbooks_project_id', 'is', null)
    .is('deleted_at', null);
  if (error) throw new Error(describeSupabaseError(error));
  const jobs = (data ?? []) as { completed_date: string; quickbooks_project_id: string }[];
  if (jobs.length === 0) return { onTime: 0, total: 0, from, to };

  const datesByProject = new Map<string, string[]>();
  for (const inv of await getQBOInvoiceSummaries()) {
    const list = datesByProject.get(inv.customerId) ?? [];
    list.push(inv.txnDate);
    datesByProject.set(inv.customerId, list);
  }
  let onTime = 0;
  for (const job of jobs) {
    const done = job.completed_date.slice(0, 10);
    const deadline = ymd(addDays(new Date(`${done}T00:00:00`), BILL_WITHIN_DAYS));
    const dates = datesByProject.get(job.quickbooks_project_id) ?? [];
    if (dates.some((d) => d >= done && d <= deadline)) onTime += 1;
  }
  return { onTime, total: jobs.length, from, to };
}

/** Every KPI. Each one loads on its own, so one QuickBooks hiccup doesn't blank the rest. */
export async function loadKpis(
  accounts: KpiAccounts,
  now = new Date(),
): Promise<{ kpis: Kpi[]; bankAccounts: QBOAccountBalance[] }> {
  const p = kpiPeriods(now);
  const week = `${shortDay(p.weekStart)} – ${shortDay(p.weekEnd)}`;
  const ytd = `Jan 1 – ${shortDay(p.today)}`;

  const classId = findQBOClassId(INTERNATIONAL_CLASS).then((id) => {
    if (!id) throw new Error(`No QuickBooks class named "${INTERNATIONAL_CLASS}".`);
    return id;
  });
  const [plYtd, plWeek, intlYtd, intlWeek, intlBilled, intlReceived, ar, banks, billing] = await Promise.allSettled([
    getQBOProfitAndLoss(p.ytdStart, p.today),
    getQBOProfitAndLoss(p.weekStart, p.weekEnd),
    classId.then((id) => getQBOProfitAndLoss(p.ytdStart, p.today, id)),
    classId.then((id) => getQBOProfitAndLoss(p.weekStart, p.weekEnd, id)),
    classId.then((id) => getQBOClassInvoiced(id, p.weekStart, p.weekEnd)),
    classId.then((id) => getQBOClassReceived(id, p.weekStart, p.weekEnd)),
    getQBOAccountsByType('Accounts Receivable'),
    getQBOAccountsByType('Bank'),
    daysToBill(now),
  ]);

  const kpi = <T,>(
    id: string,
    label: string,
    format: KpiFormat,
    result: PromiseSettledResult<T>,
    read: (value: T) => { value: number | null; note: string },
    fallbackNote: string,
  ): Kpi => {
    if (result.status === 'rejected') return { id, label, format, value: null, note: fallbackNote, error: failed(result.reason) };
    return { id, label, format, ...read(result.value) };
  };

  const bankAccounts = banks.status === 'fulfilled' ? banks.value : [];
  const bank = (id: string, label: string, accountId: string | null): Kpi => {
    if (banks.status === 'rejected') return { id, label, format: 'money', value: null, note: 'Today', error: failed(banks.reason) };
    const account = bankAccounts.find((a) => a.id === accountId);
    if (!account) return { id, label, format: 'money', value: null, note: 'Pick the account in Settings' };
    return { id, label, format: 'money', value: account.balance, note: account.name };
  };

  const kpis: Kpi[] = [
    kpi('amp_profit_ytd', 'AMP QES Profit % YTD', 'pct', plYtd, (pl) => ({
      value: profitPct(pl),
      note: `${ytd} · whole company`,
    }), ytd),
    kpi('amp_ar', 'AMP QES A/R', 'money', ar, (list) => ({
      value: list.reduce((sum, a) => sum + a.balance, 0),
      note: 'Owed to us today',
    }), 'Today'),
    kpi('global_income', 'Global Gross Income', 'money', plWeek, (pl) => ({ value: pl.income, note: `Last week · ${week}` }), week),
    kpi('global_expenses', 'Global Expenses', 'money', plWeek, (pl) => ({ value: allExpenses(pl), note: `Last week · ${week}` }), week),
    kpi('global_net', 'Global Net Profit last week', 'money', plWeek, (pl) => ({ value: pl.netIncome, note: week }), week),
    bank('operating', 'Operating Account Balance', accounts.operating),
    bank('cash_reserve', 'Cash Reserve balance', accounts.cash_reserve),
    kpi('intl_profit_ytd', 'International Profit % YTD', 'pct', intlYtd, (pl) => ({ value: profitPct(pl), note: ytd }), ytd),
    kpi('intl_expenses', 'International Expenses', 'money', intlWeek, (pl) => ({ value: allExpenses(pl), note: `Last week · ${week}` }), week),
    kpi('intl_billed', 'International AR Billed', 'money', intlBilled, (amount) => ({ value: amount, note: `Last week · ${week}` }), week),
    kpi('intl_received', 'International AR Received', 'money', intlReceived, (amount) => ({ value: amount, note: `Last week · ${week}` }), week),
    kpi('days_to_bill', `Less than ${BILL_WITHIN_DAYS} Days to Bill`, 'pct', billing, (b) => ({
      value: b.total ? b.onTime / b.total : null,
      note: b.total
        ? `${b.onTime} of ${b.total} jobs completed ${shortDay(b.from)} – ${shortDay(b.to)}`
        : `No jobs completed ${shortDay(b.from)} – ${shortDay(b.to)}`,
    }), 'Jobs completed in the last 30 days'),
  ];
  return { kpis, bankAccounts };
}
