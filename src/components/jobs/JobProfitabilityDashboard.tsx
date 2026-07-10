import React, { useEffect, useState, useCallback } from 'react';
import {
  TrendingUp,
  TrendingDown,
  DollarSign,
  Clock,
  AlertTriangle,
  CheckCircle,
  Settings,
  X,
} from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/Dialog';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/Table';
import {
  getQBOTimeActivitiesByCustomer,
  getQBOInvoicesByCustomer,
  getQBOProfitAndLossDetail,
  type QBOTimeActivityRow,
  type QBOInvoiceRow,
  type QBOPnLRow,
} from '@/services/quickbooksService';
import { getJobBudgetData, getOverheadRate, saveOverheadRate, type BudgetData } from '@/services/profitabilityService';
import { fetchChangeOrders, summarizeChangeOrders, type ChangeOrderSummary } from '@/services/changeOrderService';
import {
  computeActuals,
  computeBudget,
  computeEAC,
  rollupByMonth,
  classifyAccount,
  type ActualsByCategory,
  type BudgetByCategory,
  type EAC,
  type MonthlyRollup,
} from '@/utils/profitabilityCalculations';

interface Job {
  id: string;
  job_number?: string | null;
  status: string;
  quickbooks_project_id?: string | null;
  estimated_man_hours?: number | null;
  budget?: number | null;
}

interface Props {
  job: Job;
}

type DrillKey =
  | 'revenue'
  | 'labor'
  | 'contractLabor'
  | 'travel'
  | 'fuel'
  | 'materials'
  | 'perDiem'
  | 'rental'
  | 'other'
  | 'sov'
  | { month: string };

const CATEGORY_LABELS: Record<string, string> = {
  labor: 'Labor (W-2 + Burden)',
  contractLabor: 'Contract Labor',
  travel: 'Travel & Lodging',
  fuel: 'Fuel / Mileage',
  materials: 'Materials',
  perDiem: 'Per Diem / Meals',
  rental: 'Rental Equipment',
  other: 'Other',
};

const fmt = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);

const fmtPct = (n: number | null) => (n == null ? '—' : `${(n * 100).toFixed(1)}%`);
const fmtHrs = (n: number) => `${n.toFixed(1)} hrs`;

export default function JobProfitabilityDashboard({ job }: Props) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [budgetData, setBudgetData] = useState<BudgetData | null>(null);
  const [timeActivities, setTimeActivities] = useState<QBOTimeActivityRow[]>([]);
  const [invoices, setInvoices] = useState<QBOInvoiceRow[]>([]);
  const [pnlRows, setPnlRows] = useState<QBOPnLRow[]>([]);

  const [actuals, setActuals] = useState<ActualsByCategory | null>(null);
  const [budget, setBudget] = useState<BudgetByCategory | null>(null);
  const [eac, setEac] = useState<EAC | null>(null);
  const [monthly, setMonthly] = useState<MonthlyRollup[]>([]);

  const [coSummary, setCoSummary] = useState<ChangeOrderSummary | null>(null);

  const [overheadRate, setOverheadRate] = useState(0.494);
  const [showSettings, setShowSettings] = useState(false);
  const [draftRate, setDraftRate] = useState('49.4');

  const [drillTarget, setDrillTarget] = useState<DrillKey | null>(null);

  const load = useCallback(async () => {
    if (!job.quickbooks_project_id) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [bd, ta, inv, pnl, rate, cos] = await Promise.all([
        getJobBudgetData(job.id),
        getQBOTimeActivitiesByCustomer(job.quickbooks_project_id),
        getQBOInvoicesByCustomer(job.quickbooks_project_id),
        getQBOProfitAndLossDetail(job.quickbooks_project_id),
        getOverheadRate(),
        fetchChangeOrders(job.id).catch(() => []),
      ]);

      setBudgetData(bd);
      setTimeActivities(ta);
      setInvoices(inv);
      setPnlRows(pnl);
      setOverheadRate(rate);
      setDraftRate((rate * 100).toFixed(1));
      setCoSummary(summarizeChangeOrders(cos));

      const act = computeActuals(ta, inv, pnl);
      const bud = computeBudget(bd, act.realizedRate);
      const e = computeEAC(act, inv, bud, bd.jobStatus, rate);
      const mon = rollupByMonth(ta, inv, pnl);

      setActuals(act);
      setBudget(bud);
      setEac(e);
      setMonthly(mon);
    } catch (err) {
      console.error('[Profitability] Load failed:', err);
      setError('Failed to load profitability data. Check your QuickBooks connection.');
    } finally {
      setLoading(false);
    }
  }, [job.id, job.quickbooks_project_id]);

  useEffect(() => { load(); }, [load]);

  // Recompute EAC when overhead rate changes (no re-fetch needed)
  useEffect(() => {
    if (!actuals || !budget || !budgetData) return;
    const e = computeEAC(actuals, invoices, budget, budgetData.jobStatus, overheadRate);
    setEac(e);
  }, [overheadRate, actuals, budget, budgetData, invoices]);

  const handleSaveSettings = async () => {
    const parsed = parseFloat(draftRate) / 100;
    if (!isNaN(parsed)) {
      setOverheadRate(parsed);
      await saveOverheadRate(parsed);
    }
    setShowSettings(false);
  };

  if (loading) {
    return (
      <div className="flex min-h-[300px] items-center justify-center">
        <LoadingSpinner size="md" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <div className="flex items-start gap-3 rounded-none border border-red-200 bg-red-50 p-4 dark:border-red-800 dark:bg-red-950">
          <AlertTriangle className="mt-0.5 h-5 w-5 flex-shrink-0 text-red-600" />
          <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
        </div>
      </div>
    );
  }

  if (!actuals || !budget || !eac || !budgetData) return null;

  const projGMGood = eac.projGMPct != null && eac.projGMPct >= 0.40;
  const projGMBad = eac.projGMPct != null && eac.projGMPct < 0.40;
  const budgetGMGood = budget.budgetGMPct >= 0.40;

  // KPI cards data
  const kpiCards = [
    { label: 'Status', value: budgetData.jobStatus.replace(/_/g, ' '), mono: false },
    { label: 'Quoted Amount', value: fmt(budget.quotedAmount), mono: true },
    { label: 'Billed to Date', value: fmt(eac.billed), mono: true },
    { label: 'Collected', value: fmt(eac.collected), mono: true },
    {
      label: '% Complete (Billing)',
      value: eac.pctComplete != null ? `${(eac.pctComplete * 100).toFixed(0)}%` : '—',
      mono: true,
    },
    { label: 'Budget COGS', value: fmt(budget.totalCOGS), mono: true },
    { label: 'Actual COGS (to date)', value: fmt(actuals.totalCOGS), mono: true },
    {
      label: 'Projected Final Cost',
      value: eac.projTotalCost != null ? fmt(eac.projTotalCost) : '—',
      mono: true,
    },
    {
      label: 'Budget Gross Margin',
      value: fmtPct(budget.budgetGMPct),
      highlight: budgetGMGood ? 'green' : 'red',
      mono: true,
    },
    {
      label: 'Projected Gross Margin',
      value: fmtPct(eac.projGMPct),
      highlight: projGMGood ? 'green' : projGMBad ? 'red' : undefined,
      mono: true,
    },
    {
      label: 'Hours (Budget / Actual)',
      value: `${fmtHrs(budget.budgetHours)} / ${fmtHrs(actuals.workedHours)}`,
      mono: true,
    },
    {
      label: 'Net Margin (After Overhead)',
      value: fmtPct(eac.netMarginPct),
      highlight: eac.netMarginPct != null && eac.netMarginPct >= 0 ? 'green' : 'red',
      mono: true,
    },
  ] as const;

  // Comparison table rows
  const costCategories: { key: keyof ActualsByCategory; label: string }[] = [
    { key: 'labor', label: 'Labor (W-2 + Burden)' },
    { key: 'contractLabor', label: 'Contract Labor' },
    { key: 'travel', label: 'Travel & Lodging' },
    { key: 'fuel', label: 'Fuel / Mileage' },
    { key: 'materials', label: 'Materials' },
    { key: 'perDiem', label: 'Per Diem / Meals' },
    { key: 'rental', label: 'Rental Equipment' },
    { key: 'other', label: 'Other' },
  ];

  const budgetCategoryMap: Partial<Record<keyof ActualsByCategory, number>> = {
    labor: budget.labor,
    travel: budget.travel,
    perDiem: budget.perDiem,
    materials: budget.materials,
  };

  // Monthly chart data
  const chartData = monthly.map((m) => ({
    month: m.month.slice(0, 7),
    'Cost Incurred': Math.round(m.cost),
    Billed: Math.round(m.billed),
  }));

  // Drill modal content
  const renderDrillContent = () => {
    if (drillTarget === 'revenue') {
      return (
        <>
          <DialogTitle>Invoices</DialogTitle>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Invoice #</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead className="text-right">Open Balance</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {invoices.length === 0 && (
                <TableRow><TableCell colSpan={4} className="text-center text-neutral-500">No invoices</TableCell></TableRow>
              )}
              {invoices.map((inv) => (
                <TableRow key={inv.id}>
                  <TableCell>{inv.txnDate}</TableCell>
                  <TableCell>{inv.docNumber}</TableCell>
                  <TableCell className="text-right">{fmt(inv.totalAmt)}</TableCell>
                  <TableCell className="text-right">{fmt(inv.balance)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </>
      );
    }

    if (drillTarget === 'labor') {
      return (
        <>
          <DialogTitle>Labor — Time Activities</DialogTitle>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Employee</TableHead>
                <TableHead className="text-right">Hours</TableHead>
                <TableHead className="text-right">Rate</TableHead>
                <TableHead className="text-right">Cost</TableHead>
                <TableHead>Description</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {timeActivities.filter((a) => a.costRate > 0).length === 0 && (
                <TableRow><TableCell colSpan={6} className="text-center text-neutral-500">No time entries</TableCell></TableRow>
              )}
              {timeActivities.filter((a) => a.costRate > 0).map((a) => (
                <TableRow key={a.id}>
                  <TableCell>{a.txnDate}</TableCell>
                  <TableCell>{a.employeeName}</TableCell>
                  <TableCell className="text-right">{a.hours.toFixed(2)}</TableCell>
                  <TableCell className="text-right">{fmt(a.costRate)}/hr</TableCell>
                  <TableCell className="text-right">{fmt(a.cost)}</TableCell>
                  <TableCell className="max-w-[200px] truncate">{a.description}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </>
      );
    }

    if (drillTarget === 'sov') {
      const items = budgetData?.estimateData?.sovItems ?? [];
      return (
        <>
          <DialogTitle>Scope of Work Items (Budget)</DialogTitle>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Item</TableHead>
                <TableHead className="text-right">Qty</TableHead>
                <TableHead className="text-right">Labor Men</TableHead>
                <TableHead className="text-right">Labor Hours</TableHead>
                <TableHead className="text-right">Material $</TableHead>
                <TableHead>Notes</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.length === 0 && (
                <TableRow><TableCell colSpan={6} className="text-center text-neutral-500">No SOV items in estimate</TableCell></TableRow>
              )}
              {items.map((item, i) => (
                <TableRow key={i}>
                  <TableCell>{item.item}</TableCell>
                  <TableCell className="text-right">{item.quantity}</TableCell>
                  <TableCell className="text-right">{item.laborMen}</TableCell>
                  <TableCell className="text-right">{item.laborHours}</TableCell>
                  <TableCell className="text-right">{fmt(item.materialPrice ?? 0)}</TableCell>
                  <TableCell className="max-w-[200px] truncate">{item.notes}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </>
      );
    }

    if (typeof drillTarget === 'string' && drillTarget in CATEGORY_LABELS) {
      const cat = drillTarget as keyof typeof CATEGORY_LABELS;
      const rows = pnlRows.filter((r) => {
        const mapped = classifyAccount(r.accountNum);
        return mapped === cat && (r.rowType === 'expense' || r.amount < 0);
      });
      return (
        <>
          <DialogTitle>{CATEGORY_LABELS[cat]} — Transactions</DialogTitle>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Account</TableHead>
                <TableHead>Memo</TableHead>
                <TableHead className="text-right">Amount</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 && (
                <TableRow><TableCell colSpan={4} className="text-center text-neutral-500">No transactions</TableCell></TableRow>
              )}
              {rows.map((r, i) => (
                <TableRow key={i}>
                  <TableCell>{r.txnDate}</TableCell>
                  <TableCell>{r.accountName}</TableCell>
                  <TableCell className="max-w-[200px] truncate">{r.memo}</TableCell>
                  <TableCell className="text-right">{fmt(Math.abs(r.amount))}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </>
      );
    }

    if (drillTarget && typeof drillTarget === 'object' && 'month' in drillTarget) {
      const m = monthly.find((x) => x.month === drillTarget.month);
      return (
        <>
          <DialogTitle>{drillTarget.month} — Transactions</DialogTitle>
          <p className="mb-2 text-sm text-neutral-600 dark:text-neutral-400">
            Cost incurred: {fmt(m?.cost ?? 0)} · Billed: {fmt(m?.billed ?? 0)}
          </p>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Source</TableHead>
                <TableHead>Detail</TableHead>
                <TableHead className="text-right">Amount</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(m?.timeActivities ?? []).map((a) => (
                <TableRow key={`ta-${a.id}`}>
                  <TableCell>{a.txnDate}</TableCell>
                  <TableCell>Time</TableCell>
                  <TableCell className="max-w-[200px] truncate">{a.employeeName} — {a.description}</TableCell>
                  <TableCell className="text-right">{fmt(a.cost)}</TableCell>
                </TableRow>
              ))}
              {(m?.pnlRows ?? []).map((r, i) => (
                <TableRow key={`pnl-${i}`}>
                  <TableCell>{r.txnDate}</TableCell>
                  <TableCell>{r.accountName}</TableCell>
                  <TableCell className="max-w-[200px] truncate">{r.memo}</TableCell>
                  <TableCell className="text-right">{fmt(Math.abs(r.amount))}</TableCell>
                </TableRow>
              ))}
              {(m?.invoices ?? []).map((inv) => (
                <TableRow key={`inv-${inv.id}`}>
                  <TableCell>{inv.txnDate}</TableCell>
                  <TableCell>Invoice</TableCell>
                  <TableCell>#{inv.docNumber}</TableCell>
                  <TableCell className="text-right">{fmt(inv.totalAmt)}</TableCell>
                </TableRow>
              ))}
              {!m && (
                <TableRow><TableCell colSpan={4} className="text-center text-neutral-500">No data</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </>
      );
    }

    return null;
  };

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-neutral-900 dark:text-white">
            Job Profitability
          </h2>
          <p className="text-sm text-neutral-500 dark:text-neutral-400">
            Target: 40% gross margin · Overhead rate: {(overheadRate * 100).toFixed(1)}%
          </p>
        </div>
        <button
          onClick={() => setShowSettings(true)}
          className="inline-flex items-center gap-1.5 rounded-none border border-neutral-200 bg-white px-3 py-1.5 text-sm text-neutral-600 hover:bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-300 dark:hover:bg-neutral-700"
        >
          <Settings className="h-4 w-4" />
          Settings
        </button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {kpiCards.map((card) => (
          <div
            key={card.label}
            className={`rounded-none border p-4 ${
              card.highlight === 'green'
                ? 'border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-950'
                : card.highlight === 'red'
                ? 'border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950'
                : 'border-neutral-200 bg-white dark:border-neutral-700 dark:bg-neutral-800'
            }`}
          >
            <p className="text-xs font-medium text-neutral-500 dark:text-neutral-400">{card.label}</p>
            <p
              className={`mt-1 text-base font-semibold ${
                card.highlight === 'green'
                  ? 'text-green-700 dark:text-green-300'
                  : card.highlight === 'red'
                  ? 'text-red-700 dark:text-red-300'
                  : 'text-neutral-900 dark:text-white'
              } ${card.mono ? 'font-mono' : ''}`}
            >
              {card.value}
            </p>
          </div>
        ))}
      </div>

      {/* Quote vs Actuals side-by-side */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* QUOTE / Budget */}
        <div className="overflow-hidden rounded-none border border-neutral-200 dark:border-neutral-700">
          <div className="bg-[#1F3864] px-4 py-3">
            <h3 className="text-sm font-semibold text-white">QUOTE / Budget</h3>
          </div>
          <div className="divide-y divide-neutral-100 dark:divide-neutral-700">
            {/* Revenue */}
            <div className="flex items-center justify-between px-4 py-2.5">
              <span className="text-sm text-neutral-600 dark:text-neutral-400">Quoted Revenue</span>
              <button
                className="font-mono text-sm font-medium text-[#1F3864] underline hover:text-[#1F3864]/80 dark:text-blue-300"
                onClick={() => setDrillTarget('sov')}
              >
                {fmt(budget.quotedAmount)}
              </button>
            </div>
            {/* Approved change orders raise the revised contract above the original quote */}
            {coSummary && (coSummary.approvedTotal !== 0 || coSummary.pendingTotal !== 0) && (
              <>
                <div className="flex items-center justify-between px-4 py-2">
                  <span className="text-sm text-neutral-500 dark:text-neutral-400">
                    Approved Change Orders ({coSummary.approvedCount})
                  </span>
                  <span className="font-mono text-sm text-neutral-700 dark:text-neutral-300">
                    {fmt(coSummary.approvedTotal)}
                  </span>
                </div>
                <div className="flex items-center justify-between px-4 py-2">
                  <span className="text-sm font-medium text-neutral-600 dark:text-neutral-300">
                    Revised Contract Value
                  </span>
                  <span className="font-mono text-sm font-semibold text-neutral-900 dark:text-white">
                    {fmt(budget.quotedAmount + coSummary.approvedTotal)}
                  </span>
                </div>
                {coSummary.pendingTotal !== 0 && (
                  <div className="flex items-center justify-between px-4 py-2">
                    <span className="text-sm text-neutral-500 dark:text-neutral-400">
                      Pending COs ({coSummary.pendingCount}) — not in totals
                    </span>
                    <span className="font-mono text-sm text-yellow-600 dark:text-yellow-400">
                      {fmt(coSummary.pendingTotal)}
                    </span>
                  </div>
                )}
              </>
            )}
            {/* Budget cost rows */}
            {([
              ['Labor', 'labor'],
              ['Travel & Lodging', 'travel'],
              ['Per Diem / Meals', 'perDiem'],
              ['Materials', 'materials'],
            ] as [string, keyof BudgetByCategory][]).map(([label, key]) => (
              <div key={key} className="flex items-center justify-between px-4 py-2">
                <span className="text-sm text-neutral-500 dark:text-neutral-400">{label}</span>
                <span className="font-mono text-sm text-neutral-700 dark:text-neutral-300">
                  {key in budget ? fmt((budget as any)[key]) : '—'}
                </span>
              </div>
            ))}
            {/* Total COGS */}
            <div className="flex items-center justify-between bg-neutral-50 px-4 py-2.5 dark:bg-neutral-700/50">
              <span className="text-sm font-semibold text-neutral-700 dark:text-neutral-200">Total Budget COGS</span>
              <span className="font-mono text-sm font-semibold text-neutral-900 dark:text-white">
                {fmt(budget.totalCOGS)}
              </span>
            </div>
            {/* Budget GM */}
            <div className="flex items-center justify-between px-4 py-2.5">
              <span className="text-sm font-medium text-neutral-600 dark:text-neutral-300">Budget Gross Margin</span>
              <span
                className={`font-mono text-sm font-bold ${
                  budgetGMGood ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
                }`}
              >
                {fmtPct(budget.budgetGMPct)}
              </span>
            </div>
          </div>
        </div>

        {/* ACTUALS */}
        <div className="overflow-hidden rounded-none border border-neutral-200 dark:border-neutral-700">
          <div className="bg-[#E8742C] px-4 py-3">
            <h3 className="text-sm font-semibold text-white">ACTUALS (to date)</h3>
          </div>
          <div className="divide-y divide-neutral-100 dark:divide-neutral-700">
            {/* Revenue actual */}
            <div className="flex items-center justify-between px-4 py-2.5">
              <span className="text-sm text-neutral-600 dark:text-neutral-400">Billed / Collected / Open AR</span>
              <button
                className="font-mono text-sm font-medium text-[#E8742C] underline hover:text-[#E8742C]/80"
                onClick={() => setDrillTarget('revenue')}
              >
                {fmt(eac.billed)} / {fmt(eac.collected)} / {fmt(eac.openAR)}
              </button>
            </div>
            {/* Actual cost rows */}
            {costCategories.map(({ key, label }) => (
              <div key={key} className="flex items-center justify-between px-4 py-2">
                <span className="text-sm text-neutral-500 dark:text-neutral-400">{label}</span>
                <button
                  className="font-mono text-sm text-[#E8742C] underline hover:text-[#E8742C]/80"
                  onClick={() => setDrillTarget(key as DrillKey)}
                >
                  {fmt((actuals as any)[key])}
                </button>
              </div>
            ))}
            {/* Total COGS */}
            <div className="flex items-center justify-between bg-neutral-50 px-4 py-2.5 dark:bg-neutral-700/50">
              <span className="text-sm font-semibold text-neutral-700 dark:text-neutral-200">Total Actual COGS</span>
              <span className="font-mono text-sm font-semibold text-neutral-900 dark:text-white">
                {fmt(actuals.totalCOGS)}
              </span>
            </div>
            {/* Projected GM */}
            <div className="flex items-center justify-between px-4 py-2.5">
              <span className="text-sm font-medium text-neutral-600 dark:text-neutral-300">Projected Gross Margin @ Completion</span>
              <span
                className={`font-mono text-sm font-bold ${
                  projGMGood
                    ? 'text-green-600 dark:text-green-400'
                    : projGMBad
                    ? 'text-red-600 dark:text-red-400'
                    : 'text-neutral-500'
                }`}
              >
                {fmtPct(eac.projGMPct)}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Monthly Chart */}
      {chartData.length > 0 && (
        <div className="rounded-none border border-neutral-200 p-5 dark:border-neutral-700">
          <h3 className="mb-4 text-sm font-semibold text-neutral-700 dark:text-neutral-200">
            Monthly Cost vs Billed
          </h3>
          <p className="mb-3 text-xs text-neutral-500 dark:text-neutral-400">
            Click a bar group to see that month's transactions.
          </p>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart
              data={chartData}
              margin={{ top: 4, right: 16, left: 0, bottom: 4 }}
              onClick={(d) => {
                if (d?.activeLabel) {
                  setDrillTarget({ month: d.activeLabel });
                }
              }}
              style={{ cursor: 'pointer' }}
            >
              <CartesianGrid strokeDasharray="3 3" className="stroke-neutral-200 dark:stroke-neutral-700" />
              <XAxis dataKey="month" tick={{ fill: 'currentColor', fontSize: 11 }} />
              <YAxis tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} tick={{ fill: 'currentColor', fontSize: 11 }} />
              <Tooltip formatter={(v: number) => fmt(v)} />
              <Legend />
              <Bar dataKey="Cost Incurred" fill="#E8742C" radius={[3, 3, 0, 0]} />
              <Bar dataKey="Billed" fill="#1F3864" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Drill-down modal */}
      <Dialog open={drillTarget !== null} onOpenChange={(open) => { if (!open) setDrillTarget(null); }}>
        <DialogContent className="max-h-[80vh] max-w-4xl overflow-y-auto">
          <DialogHeader>
            {renderDrillContent()}
          </DialogHeader>
        </DialogContent>
      </Dialog>

      {/* Settings modal */}
      <Dialog open={showSettings} onOpenChange={setShowSettings}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Profitability Settings</DialogTitle>
          </DialogHeader>
          <div className="mt-4 space-y-4">
            <div>
              <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300">
                Overhead Rate (%)
              </label>
              <p className="mb-2 text-xs text-neutral-500">
                Company overhead as a % of revenue. Used to compute net margin after overhead.
              </p>
              <input
                type="number"
                step="0.1"
                min="0"
                max="100"
                value={draftRate}
                onChange={(e) => setDraftRate(e.target.value)}
                className="w-full rounded-none border border-neutral-300 px-3 py-2 text-sm focus:border-[#f26722] focus:outline-none focus:ring-1 focus:ring-[#f26722] dark:border-neutral-600 dark:bg-neutral-800 dark:text-white"
              />
            </div>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowSettings(false)}
                className="rounded-none border border-neutral-300 px-4 py-2 text-sm text-neutral-600 hover:bg-neutral-50 dark:border-neutral-600 dark:text-neutral-300 dark:hover:bg-neutral-700"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveSettings}
                className="rounded-none bg-[#f26722] px-4 py-2 text-sm font-medium text-white hover:bg-[#d95e1e]"
              >
                Save
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
