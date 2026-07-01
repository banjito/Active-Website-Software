import type { BudgetData } from '../services/profitabilityService';
import type { QBOTimeActivityRow, QBOInvoiceRow, QBOPnLRow } from '../services/quickbooksService';
import { FALLBACK_RATE } from '../services/profitabilityService';

// QBO account numbers → cost category
const LABOR_ACCOUNTS = new Set(['5006', '5030', '6003', '6010']);
const CONTRACT_LABOR_ACCOUNTS = new Set(['5008']);
const TRAVEL_ACCOUNTS = new Set(['5004']);
const FUEL_ACCOUNTS = new Set(['5002']);
const MATERIAL_ACCOUNTS = new Set(['5001']);
const PERDIEM_ACCOUNTS = new Set(['6390', '6270', '5003']);
const RENTAL_ACCOUNTS = new Set(['5007']);
const OTHER_ACCOUNTS = new Set(['5005', '5009', '5050']);

export type CostCategory =
  | 'labor'
  | 'contractLabor'
  | 'travel'
  | 'fuel'
  | 'materials'
  | 'perDiem'
  | 'rental'
  | 'other';

export function classifyAccount(accountNum: string): CostCategory | null {
  if (LABOR_ACCOUNTS.has(accountNum)) return 'labor';
  if (CONTRACT_LABOR_ACCOUNTS.has(accountNum)) return 'contractLabor';
  if (TRAVEL_ACCOUNTS.has(accountNum)) return 'travel';
  if (FUEL_ACCOUNTS.has(accountNum)) return 'fuel';
  if (MATERIAL_ACCOUNTS.has(accountNum)) return 'materials';
  if (PERDIEM_ACCOUNTS.has(accountNum)) return 'perDiem';
  if (RENTAL_ACCOUNTS.has(accountNum)) return 'rental';
  if (OTHER_ACCOUNTS.has(accountNum)) return 'other';
  return null;
}

export interface ActualsByCategory {
  labor: number;
  contractLabor: number;
  travel: number;
  fuel: number;
  materials: number;
  perDiem: number;
  rental: number;
  other: number;
  totalCOGS: number;
  workedHours: number;
  realizedRate: number;
}

export interface BudgetByCategory {
  labor: number;
  travel: number;
  perDiem: number;
  materials: number;
  totalCOGS: number;
  budgetGMPct: number;
  quotedAmount: number;
  budgetHours: number;
}

export interface EAC {
  pctComplete: number | null;
  projTotalCost: number | null;
  projGMPct: number | null;
  costPaceVariance: number | null;
  netMarginPct: number | null;
  billed: number;
  collected: number;
  openAR: number;
}

export interface MonthlyRollup {
  month: string;
  cost: number;
  billed: number;
  timeActivities: QBOTimeActivityRow[];
  invoices: QBOInvoiceRow[];
  pnlRows: QBOPnLRow[];
}

export function computeActuals(
  timeActivities: QBOTimeActivityRow[],
  invoices: QBOInvoiceRow[],
  pnlRows: QBOPnLRow[],
): ActualsByCategory {
  // Labor from TimeActivity (hours with non-zero cost rate)
  const workedHours = timeActivities
    .filter((a) => a.costRate > 0)
    .reduce((sum, a) => sum + a.hours, 0);
  const laborTimeAct = timeActivities
    .filter((a) => a.costRate > 0)
    .reduce((sum, a) => sum + a.cost, 0);

  // Labor from P&L (accounts 5006, 5030, 6003, 6010)
  const expenseRows = pnlRows.filter((r) => r.rowType === 'expense' || r.amount < 0);
  const abs = (n: number) => Math.abs(n);

  const laborPnL = expenseRows
    .filter((r) => LABOR_ACCOUNTS.has(r.accountNum))
    .reduce((sum, r) => sum + abs(r.amount), 0);

  // Prevent double-count: use whichever source is higher
  const labor = Math.max(laborPnL, laborTimeAct);
  const realizedRate = workedHours > 0 ? labor / workedHours : FALLBACK_RATE;

  const sumCategory = (accounts: Set<string>) =>
    expenseRows.filter((r) => accounts.has(r.accountNum)).reduce((sum, r) => sum + abs(r.amount), 0);

  const contractLabor = sumCategory(CONTRACT_LABOR_ACCOUNTS);
  const travel = sumCategory(TRAVEL_ACCOUNTS);
  const fuel = sumCategory(FUEL_ACCOUNTS);
  const materials = sumCategory(MATERIAL_ACCOUNTS);
  const perDiem = sumCategory(PERDIEM_ACCOUNTS);
  const rental = sumCategory(RENTAL_ACCOUNTS);
  const other = sumCategory(OTHER_ACCOUNTS);

  const totalCOGS = labor + contractLabor + travel + fuel + materials + perDiem + rental + other;

  return { labor, contractLabor, travel, fuel, materials, perDiem, rental, other, totalCOGS, workedHours, realizedRate };
}

export function computeBudget(budget: BudgetData, realizedRate: number): BudgetByCategory {
  const ed = budget.estimateData;
  const quotedAmount = budget.quotedAmount;

  if (!ed) {
    return { labor: 0, travel: 0, perDiem: 0, materials: 0, totalCOGS: 0, budgetGMPct: 0, quotedAmount, budgetHours: 0 };
  }

  const hs = ed.hoursSummary;
  const td = ed.travel_data;
  const rate = realizedRate > 0 ? realizedRate : FALLBACK_RATE;

  const budgetHours = (hs.workHours ?? 0) + (hs.nonSovHours ?? 0);
  const labor = budgetHours * rate;

  const travelVehicle = (td.travelExpense ?? []).reduce((s, t) => s + (t.vehicleTravelCost ?? 0), 0);
  const travelLabor = (hs.travelHours ?? 0) * rate;
  const travel = travelVehicle + travelLabor;

  const perDiem = (td.perDiem ?? []).reduce((s, p) => s + (p.numDays ?? 0) * (p.firstDayRate ?? 0), 0);

  const materials = (ed.sovItems ?? []).reduce(
    (s, item) => s + (item.quantity ?? 0) * (item.materialPrice ?? 0),
    0,
  );

  const totalCOGS = labor + travel + perDiem + materials;
  const budgetGMPct = quotedAmount > 0 ? (quotedAmount - totalCOGS) / quotedAmount : 0;

  return { labor, travel, perDiem, materials, totalCOGS, budgetGMPct, quotedAmount, budgetHours };
}

const BILLED_STATUSES = new Set(['billed', 'ready_to_bill', 'completed', 'progress_billing']);

export function computeEAC(
  actuals: ActualsByCategory,
  invoices: QBOInvoiceRow[],
  budget: BudgetByCategory,
  jobStatus: string,
  overheadRate: number,
): EAC {
  const billed = invoices.reduce((s, inv) => s + inv.totalAmt, 0);
  const collected = invoices.reduce((s, inv) => s + (inv.totalAmt - inv.balance), 0);
  const openAR = billed - collected;

  const quotedAmount = budget.quotedAmount;

  let pctComplete: number | null = null;
  if (BILLED_STATUSES.has(jobStatus)) {
    pctComplete = 1.0;
  } else if (billed > 0 && quotedAmount > 0) {
    pctComplete = Math.min(billed / quotedAmount, 1);
  }

  let projTotalCost: number | null = null;
  let projGMPct: number | null = null;
  let costPaceVariance: number | null = null;
  let netMarginPct: number | null = null;

  if (pctComplete != null && pctComplete > 0) {
    projTotalCost = actuals.totalCOGS / pctComplete;
    projGMPct = quotedAmount > 0 ? (quotedAmount - projTotalCost) / quotedAmount : null;

    const costBudgetFor40 = quotedAmount * 0.6;
    const expectedCostNow = costBudgetFor40 * pctComplete;
    costPaceVariance = actuals.totalCOGS - expectedCostNow;

    if (projGMPct != null) {
      netMarginPct = projGMPct - overheadRate;
    }
  }

  return { pctComplete, projTotalCost, projGMPct, costPaceVariance, netMarginPct, billed, collected, openAR };
}

export function rollupByMonth(
  timeActivities: QBOTimeActivityRow[],
  invoices: QBOInvoiceRow[],
  pnlRows: QBOPnLRow[],
): MonthlyRollup[] {
  const map = new Map<string, MonthlyRollup>();

  const getOrCreate = (month: string): MonthlyRollup => {
    if (!map.has(month)) {
      map.set(month, { month, cost: 0, billed: 0, timeActivities: [], invoices: [], pnlRows: [] });
    }
    return map.get(month)!;
  };

  for (const a of timeActivities) {
    if (!a.txnDate) continue;
    const month = a.txnDate.slice(0, 7);
    const entry = getOrCreate(month);
    entry.cost += a.cost;
    entry.timeActivities.push(a);
  }

  for (const inv of invoices) {
    if (!inv.txnDate) continue;
    const month = inv.txnDate.slice(0, 7);
    const entry = getOrCreate(month);
    entry.billed += inv.totalAmt;
    entry.invoices.push(inv);
  }

  for (const row of pnlRows) {
    if (!row.txnDate || row.rowType !== 'expense') continue;
    const month = row.txnDate.slice(0, 7);
    const entry = getOrCreate(month);
    entry.pnlRows.push(row);
  }

  return Array.from(map.values()).sort((a, b) => a.month.localeCompare(b.month));
}
