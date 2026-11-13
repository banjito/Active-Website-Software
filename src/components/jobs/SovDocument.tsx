import React from 'react';
import { companyConfig } from '@/lib/companyConfig';
import { formatChangeOrderNumber } from '@/services/changeOrderService';
import type { SovChangeOrder } from '@/services/pmDashboardService';
import { isOriginalLine, monthLabel, type PayApp, type PayAppRow } from '@/utils/pmDashboardCalculations';

// Pay application laid out the way customers expect an AIA-style SOV: a summary on
// top, then one row per SOV line. Our own layout, not AIA's form.

const money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
const fmt = (n: number) => money.format(n);
const fmtPct = (p: number | null) => (p == null ? '' : `${Math.round(p * 100)}%`);

/** "2026-11" -> "11/30/2026" */
const lastDayOf = (month: string): string => {
  const [y, m] = month.split('-').map(Number);
  return new Date(y, m, 0).toLocaleDateString('en-US');
};

const PRINT_CSS = `
@media print {
  @page { size: letter landscape; margin: 0.4in; }
  html, body { background: #fff !important; }
  .sov-doc {
    max-width: none !important; margin: 0 !important; padding: 0 !important;
    border: 0 !important; box-shadow: none !important;
    -webkit-print-color-adjust: exact; print-color-adjust: exact;
  }
  .sov-doc, .sov-doc * { color: #000 !important; background: transparent !important; border-color: #9ca3af !important; }
  .sov-doc .sov-rule { background: var(--brand) !important; }
  .sov-doc img { filter: none !important; }
  .sov-doc table { font-size: 9pt; }
  .sov-doc thead { display: table-header-group; }
  .sov-doc tr, .sov-doc .sov-keep { break-inside: avoid; page-break-inside: avoid; }
  .sov-doc .sov-total td { border-top: 2px solid #000 !important; }
  select { -webkit-appearance: none; appearance: none; background-image: none !important; }
  input[type=number]::-webkit-inner-spin-button,
  input[type=number]::-webkit-outer-spin-button { -webkit-appearance: none; margin: 0; }
}
`;

const TH = 'border border-neutral-300 px-2 py-1.5 text-left text-[11px] font-semibold uppercase tracking-wide text-neutral-600 dark:border-neutral-600 dark:text-neutral-300';
const TH_NUM = `${TH} text-right`;
const TD = 'border border-neutral-300 px-2 py-1 align-top dark:border-neutral-700';
const TD_NUM = `${TD} text-right tabular-nums whitespace-nowrap`;

export interface SovDocumentProps {
  app: PayApp;
  /** YYYY-MM: the month being billed */
  month: string;
  jobNumber: string | null;
  jobTitle: string | null;
  customerName: string;
  customerAddress: string | null;
  retainagePct: number;
  changeOrders: SovChangeOrder[];
}

export function SovDocument({
  app,
  month,
  jobNumber,
  jobTitle,
  customerName,
  customerAddress,
  retainagePct,
  changeOrders,
}: SovDocumentProps) {
  const showRetainage = retainagePct > 0;
  const original = app.rows.filter((r) => isOriginalLine(r.line));
  const coGroups = changeOrders
    .map((co) => ({ co, rows: app.rows.filter((r) => r.line.change_order_id === co.id) }))
    .filter((g) => g.rows.length > 0);

  let itemNo = 0;
  const lineRow = (r: PayAppRow) => {
    itemNo += 1;
    return (
      <tr key={r.line.id}>
        <td className={`${TD} text-center tabular-nums`}>{itemNo}</td>
        <td className={TD}>{r.line.item || 'Untitled line'}</td>
        <td className={TD_NUM}>{fmt(r.scheduled)}</td>
        <td className={TD_NUM}>{fmt(r.previous)}</td>
        <td className={TD_NUM}>{fmt(r.thisPeriod)}</td>
        <td className={TD_NUM}>{fmt(r.completed)}</td>
        <td className={TD_NUM}>{fmtPct(r.pct)}</td>
        <td className={TD_NUM}>{fmt(r.balance)}</td>
        {showRetainage && <td className={TD_NUM}>{fmt(r.retainage)}</td>}
      </tr>
    );
  };
  const groupRow = (label: string) => (
    <tr className="sov-keep bg-neutral-50 dark:bg-neutral-800">
      <td className={TD} />
      <td className={`${TD} font-semibold`} colSpan={showRetainage ? 8 : 7}>
        {label}
      </td>
    </tr>
  );

  const summary: [string, number, boolean?][] = [
    ['1. Original contract sum', app.originalContract],
    ['2. Net change by Change Orders', app.changeOrders],
    ['3. Contract sum to date (1 + 2)', app.contractToDate],
    ['4. Total completed to date', app.completed],
    [`5. Retainage (${showRetainage ? `${retainagePct}%` : 'none'} of completed work)`, app.retainage],
    ['6. Total earned less retainage (4 - 5)', app.earnedLessRetainage],
    ['7. Less previous applications', app.previousCertificates],
    ['8. Current payment due (6 - 7)', app.currentDue, true],
    ['9. Balance to finish, including retainage (3 - 6)', app.balanceWithRetainage],
  ];

  return (
    <div className="sov-doc mx-auto max-w-[11in] space-y-5 rounded-none border border-neutral-200 bg-white p-8 text-sm text-neutral-900 shadow-sm dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100">
      <style>{PRINT_CSS}</style>

      <div className="sov-keep flex flex-wrap items-start justify-between gap-6">
        <div className="space-y-1">
          <img src={companyConfig.reportLogoPath} alt={companyConfig.name} className="h-10 w-auto dark:invert" />
          <p className="text-xs text-neutral-600 dark:text-neutral-400">{companyConfig.addressLine}</p>
          <p className="text-xs text-neutral-600 dark:text-neutral-400">{companyConfig.phone}</p>
        </div>
        <div className="text-right">
          <h1 className="text-xl font-bold">Application for Payment</h1>
          <div className="sov-rule my-1 ml-auto h-0.5 w-24 bg-brand" />
          <p>Application {app.applicationNumber}</p>
          <p>
            Period: {monthLabel(month, 'long')} (to {lastDayOf(month)})
          </p>
          <p className="text-xs text-neutral-600 dark:text-neutral-400">
            Printed {new Date().toLocaleDateString('en-US')}
          </p>
        </div>
      </div>

      <div className="sov-keep grid gap-4 sm:grid-cols-2">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">To</p>
          <p className="font-medium">{customerName || 'Customer'}</p>
          {customerAddress && <p className="whitespace-pre-line">{customerAddress}</p>}
        </div>
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">Project</p>
          <p className="font-medium">{jobTitle || 'Untitled job'}</p>
          {jobNumber && <p>Job {jobNumber}</p>}
        </div>
      </div>

      <table className="sov-keep w-full max-w-xl border-collapse">
        <tbody>
          {summary.map(([label, value, strong]) => (
            <tr key={label} className={strong ? 'font-bold' : undefined}>
              <td className={TD}>{label}</td>
              <td className={TD_NUM}>{fmt(value)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <table className="w-full border-collapse">
        <thead>
          <tr>
            <th className={`${TH} w-10 text-center`}>Item</th>
            <th className={TH}>Description of work</th>
            <th className={TH_NUM}>Scheduled value</th>
            <th className={TH_NUM}>From previous applications</th>
            <th className={TH_NUM}>This period</th>
            <th className={TH_NUM}>Total completed to date</th>
            <th className={TH_NUM}>%</th>
            <th className={TH_NUM}>Balance to finish</th>
            {showRetainage && <th className={TH_NUM}>Retainage</th>}
          </tr>
        </thead>
        <tbody>
          {original.map(lineRow)}
          {coGroups.map(({ co, rows }) => (
            <React.Fragment key={co.id}>
              {groupRow(
                [`Change Order ${formatChangeOrderNumber(co.number)}`, co.title.trim()].filter(Boolean).join(' · '),
              )}
              {rows.map(lineRow)}
            </React.Fragment>
          ))}
          <tr className="sov-total font-semibold">
            <td className={TD} />
            <td className={TD}>Totals</td>
            <td className={TD_NUM}>{fmt(app.contractToDate)}</td>
            <td className={TD_NUM}>{fmt(app.previous)}</td>
            <td className={TD_NUM}>{fmt(app.thisPeriod)}</td>
            <td className={TD_NUM}>{fmt(app.completed)}</td>
            <td className={TD_NUM}>{fmtPct(app.contractToDate ? app.completed / app.contractToDate : null)}</td>
            <td className={TD_NUM}>{fmt(app.contractToDate - app.completed)}</td>
            {showRetainage && <td className={TD_NUM}>{fmt(app.retainage)}</td>}
          </tr>
        </tbody>
      </table>

      <div className="sov-keep grid gap-8 pt-6 sm:grid-cols-2">
        <div>
          <div className="h-8 border-b border-neutral-400 dark:border-neutral-500" />
          <p className="mt-1 text-xs text-neutral-600 dark:text-neutral-400">Submitted by ({companyConfig.name})</p>
        </div>
        <div>
          <div className="h-8 border-b border-neutral-400 dark:border-neutral-500" />
          <p className="mt-1 text-xs text-neutral-600 dark:text-neutral-400">Date</p>
        </div>
      </div>
    </div>
  );
}
