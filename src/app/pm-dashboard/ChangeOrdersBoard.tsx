import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle } from 'lucide-react';
import { useDemoMode } from '@/lib/DemoModeContext';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/Table';
import type { PmJob } from '@/services/pmDashboardService';
import {
  CHANGE_ORDER_STATUS_LABEL,
  CHANGE_ORDER_STATUS_STYLE,
  fetchChangeOrderLetterNumbers,
  fetchChangeOrdersForJobs,
  formatChangeOrderNumber,
  type ChangeOrder,
} from '@/services/changeOrderService';
import { fmtMoney, StatTile } from './shared';

type Filter = 'waiting' | 'approved' | 'all';

const FILTERS: [Filter, string][] = [
  ['waiting', 'Waiting for approval'],
  ['approved', 'Approved'],
  ['all', 'All'],
];

const isWaiting = (co: ChangeOrder) => co.status === 'draft' || co.status === 'submitted';

const fmtDate = (d?: string | null) => {
  if (!d) return '';
  const [y, m, day] = d.slice(0, 10).split('-').map(Number);
  return new Date(y, m - 1, day).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
};

// Every Change Order on the jobs in view (My Jobs or the location). Click a row to
// open that job's Change Orders tab, where they're priced, approved or rejected.
export default function ChangeOrdersBoard({ jobs }: { jobs: PmJob[] }) {
  const { maskJobTitle } = useDemoMode();
  const [rows, setRows] = useState<ChangeOrder[]>([]);
  const [letters, setLetters] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>('waiting');

  const jobIds = useMemo(() => jobs.map((j) => j.id), [jobs]);
  const jobById = useMemo(() => new Map(jobs.map((j) => [j.id, j])), [jobs]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    (async () => {
      const cos = await fetchChangeOrdersForJobs(jobIds);
      const quoteIds = cos.map((c) => c.opportunity_id).filter((id): id is string => !!id);
      const letterMap = await fetchChangeOrderLetterNumbers(quoteIds);
      if (cancelled) return;
      setRows(cos);
      setLetters(letterMap);
    })()
      .catch((e) => {
        console.error('[ChangeOrdersBoard] Load failed:', e);
        if (!cancelled) setError(e?.message ?? 'Could not load Change Orders');
      })
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [jobIds]);

  const waiting = rows.filter(isWaiting);
  const approved = rows.filter((c) => c.status === 'approved');
  const sum = (list: ChangeOrder[]) => list.reduce((t, c) => t + (Number(c.amount) || 0), 0);

  const visible = useMemo(() => {
    const list =
      filter === 'waiting' ? rows.filter(isWaiting) : filter === 'approved' ? rows.filter((c) => c.status === 'approved') : rows;
    const jobNo = (c: ChangeOrder) => jobById.get(c.job_id)?.job_number ?? '';
    // Waiting: oldest request first, so the longest wait is on top. Otherwise by job, then number.
    return [...list].sort((a, b) =>
      filter === 'waiting'
        ? (a.requested_date ?? a.created_at).localeCompare(b.requested_date ?? b.created_at)
        : jobNo(a).localeCompare(jobNo(b), undefined, { numeric: true }) || a.co_number - b.co_number,
    );
  }, [rows, filter, jobById]);

  if (loading) {
    return (
      <div className="flex min-h-[200px] items-center justify-center">
        <LoadingSpinner size="md" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-start gap-3 rounded-none border border-red-200 bg-red-50 p-4 dark:border-red-800 dark:bg-red-950">
        <AlertTriangle className="mt-0.5 h-5 w-5 flex-shrink-0 text-red-600" />
        <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="Waiting for approval" value={String(waiting.length)} />
        <StatTile label="Waiting, not in totals" value={fmtMoney(sum(waiting))} />
        <StatTile label="Approved" value={String(approved.length)} />
        <StatTile label="Approved, in contract value" value={fmtMoney(sum(approved))} />
      </div>

      <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Show Change Orders">
        {FILTERS.map(([key, label]) => (
          <button
            key={key}
            type="button"
            role="radio"
            aria-checked={filter === key}
            onClick={() => setFilter(key)}
            className={`rounded-none border px-3 py-1.5 text-sm ${
              filter === key
                ? 'border-brand bg-brand/10 font-medium text-neutral-900 dark:text-white'
                : 'border-neutral-300 text-neutral-600 hover:border-neutral-400 dark:border-neutral-600 dark:text-neutral-300'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {visible.length === 0 ? (
        <div className="rounded-none border border-dashed border-neutral-300 p-10 text-center text-sm text-neutral-500 dark:border-neutral-700 dark:text-neutral-400">
          {rows.length === 0
            ? 'No Change Orders on these jobs yet.'
            : filter === 'waiting'
              ? 'Nothing waiting for approval.'
              : 'None here.'}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-none border border-neutral-200 bg-white dark:border-neutral-700 dark:bg-dark-150">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Job</TableHead>
                <TableHead>Change Order</TableHead>
                <TableHead>Letter</TableHead>
                <TableHead>Scope</TableHead>
                <TableHead className="text-right">Price</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>{filter === 'approved' ? 'Approved' : 'Requested'}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visible.map((co) => {
                const job = jobById.get(co.job_id);
                const href = `/jobs/${co.job_id}?tab=change-orders`;
                const amount = Number(co.amount) || 0;
                const unpriced = !!co.opportunity_id && amount === 0 && co.status !== 'approved';
                return (
                  <TableRow key={co.id} className="hover:bg-neutral-50 dark:hover:bg-dark-200">
                    <TableCell className="whitespace-nowrap">
                      <Link to={href} className="font-medium text-neutral-900 hover:underline dark:text-white">
                        {job?.job_number ?? 'Job'}
                      </Link>
                      <div className="max-w-[16rem] truncate text-xs text-neutral-500 dark:text-neutral-400">
                        {job ? maskJobTitle(job.title) : ''}
                      </div>
                    </TableCell>
                    <TableCell className="font-mono font-semibold text-brand">
                      <Link to={href} className="hover:underline">
                        {formatChangeOrderNumber(co.co_number)}
                      </Link>
                    </TableCell>
                    <TableCell className="font-mono">
                      {co.opportunity_id ? letters[co.opportunity_id] ?? '-' : '-'}
                    </TableCell>
                    <TableCell className="min-w-[14rem]">
                      <div className="text-neutral-900 dark:text-white">{co.title}</div>
                      {co.outside_contract && (
                        <div className="text-xs text-neutral-500 dark:text-neutral-400">Outside contract terms</div>
                      )}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-right tabular-nums">
                      {unpriced ? (
                        <span className="text-neutral-500 dark:text-neutral-400">Not priced yet</span>
                      ) : (
                        fmtMoney(amount)
                      )}
                    </TableCell>
                    <TableCell>
                      <span className={`inline-block rounded-none px-2 py-0.5 text-xs font-medium ${CHANGE_ORDER_STATUS_STYLE[co.status]}`}>
                        {CHANGE_ORDER_STATUS_LABEL[co.status] ?? co.status}
                      </span>
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-neutral-600 dark:text-neutral-300">
                      {fmtDate(co.status === 'approved' ? co.approved_date ?? co.approved_at : co.requested_date ?? co.created_at)}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
