import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { AlertTriangle, Search, X } from 'lucide-react';
import { useAuth } from '@/lib/AuthContext';
import { useDemoMode } from '@/lib/DemoModeContext';
import { usePageTitle } from '@/hooks/usePageTitle';
import { useDivisions } from '@/hooks/useDivisions';
import { Button } from '@/components/ui/Button';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { SortHeader, compareSortValues, type SortDirection } from '@/components/ui/SortHeader';
import { loadOfficeJobs, type OfficeJobRow } from '@/services/officeHomeService';
import { OfficeKpis } from './OfficeKpis';
import { fmtMoney, fmtPct, Notice, usePmAccess } from '@/app/pm-dashboard/shared';

// Office home (Project Management scope, item 16): active jobs and billing numbers for
// every location in one place, with search and a customer pull-up.

type SortField = 'job' | 'region' | 'original' | 'changeOrders' | 'total' | 'billed' | 'workDone' | 'leftToBill';

// Region colors follow the location list order, so a location keeps its color
const REGION_COLORS = [
  'bg-blue-600',
  'bg-emerald-600',
  'bg-amber-500',
  'bg-violet-600',
  'bg-cyan-600',
  'bg-rose-600',
  'bg-lime-600',
  'bg-pink-600',
];

const TH = 'px-3 py-2 text-xs font-medium whitespace-nowrap text-neutral-500 dark:text-neutral-400';
const TD = 'px-3 py-2 align-middle';
const NUM = `${TD} text-right tabular-nums whitespace-nowrap`;

/** Three dots that bounce in turn while numbers load. */
function LoadingDots() {
  return (
    <span className="inline-flex h-7 items-center gap-1" role="status" aria-label="Loading">
      {[0, 150, 300].map((delay) => (
        <span
          key={delay}
          className="h-1.5 w-1.5 animate-bounce rounded-none bg-neutral-500 dark:bg-neutral-400"
          style={{ animationDelay: `${delay}ms` }}
        />
      ))}
    </span>
  );
}

const sum = (rows: OfficeJobRow[], pick: (r: OfficeJobRow) => number | null) =>
  rows.reduce((total, r) => total + (pick(r) ?? 0), 0);

export default function OfficeHome() {
  usePageTitle('Office');
  const { user } = useAuth();
  const access = usePmAccess();
  const divisions = useDivisions();
  const { maskJobTitle, maskCustomerName } = useDemoMode();
  const [searchParams, setSearchParams] = useSearchParams();

  const [rows, setRows] = useState<OfficeJobRow[]>([]);
  const [billedError, setBilledError] = useState<string | null>(null);
  const [setupMissing, setSetupMissing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [sortField, setSortField] = useState<SortField>('job');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const searchBox = useRef<HTMLDivElement>(null);

  const query = searchParams.get('q') ?? '';
  const customerId = searchParams.get('customer');
  const region = searchParams.get('region') ?? '';
  const setParam = (key: string, value: string | null) =>
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (value) next.set(key, value);
        else next.delete(key);
        return next;
      },
      { replace: true },
    );

  const isOfficeAdmin = user?.user_metadata?.role === 'Office Admin';
  // Company KPIs (profit, bank balances) are for Admins only
  const isAdmin = ['Admin', 'Super Admin'].includes(user?.user_metadata?.role ?? '');
  const allowed = access.fullAccess || isOfficeAdmin;

  useEffect(() => {
    if (access.loading || !allowed) return;
    let alive = true;
    setLoading(true);
    setError(null);
    loadOfficeJobs()
      .then((result) => {
        if (!alive) return;
        setRows(result.rows);
        setBilledError(result.billedError);
        setSetupMissing(result.setupMissing);
      })
      .catch((err) => alive && setError(err instanceof Error ? err.message : 'Failed to load jobs.'))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [access.loading, allowed]);

  // Close the search dropdown on a click elsewhere
  useEffect(() => {
    if (!searchOpen) return;
    const onDown = (e: MouseEvent) => {
      if (!searchBox.current?.contains(e.target as Node)) setSearchOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [searchOpen]);

  const regionIndex = useMemo(() => new Map(divisions.map((d, i) => [d.id, i])), [divisions]);
  const regionLabel = (id: string | null) => (id ? divisions.find((d) => d.id === id)?.label ?? id : 'No location');
  const regionColor = (id: string | null) =>
    id && regionIndex.has(id) ? REGION_COLORS[regionIndex.get(id)! % REGION_COLORS.length] : 'bg-neutral-400';
  const regionsInUse = useMemo(
    () =>
      [...new Set(rows.map((r) => r.job.division ?? ''))]
        .filter(Boolean)
        .sort((a, b) => (regionIndex.get(a) ?? 99) - (regionIndex.get(b) ?? 99)),
    [rows, regionIndex],
  );

  const q = query.trim().toLowerCase();
  const matchesQuery = (r: OfficeJobRow) =>
    !q ||
    (r.job.job_number ?? '').toLowerCase().includes(q) ||
    (r.job.title ?? '').toLowerCase().includes(q) ||
    r.job.customer_name.toLowerCase().includes(q);

  const visible = useMemo(() => {
    const list = rows.filter(
      (r) =>
        (!customerId || r.job.customer_id === customerId) &&
        (!region || r.job.division === region) &&
        matchesQuery(r),
    );
    const value = (r: OfficeJobRow): unknown => {
      switch (sortField) {
        case 'job':
          return Number(r.job.job_number) || r.job.job_number || '';
        case 'region':
          return regionLabel(r.job.division);
        default:
          return r[sortField];
      }
    };
    return [...list].sort((a, b) => compareSortValues(value(a), value(b), sortDirection));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, customerId, region, q, sortField, sortDirection, divisions]);

  // Search dropdown: customers and vendor POs that match
  const customerMatches = useMemo(() => {
    if (q.length < 2) return [];
    const byId = new Map<string, { id: string; name: string; jobs: number }>();
    for (const r of rows) {
      if (!r.job.customer_id || !r.job.customer_name.toLowerCase().includes(q)) continue;
      const hit = byId.get(r.job.customer_id) ?? { id: r.job.customer_id, name: r.job.customer_name, jobs: 0 };
      hit.jobs += 1;
      byId.set(r.job.customer_id, hit);
    }
    return [...byId.values()].sort((a, b) => b.jobs - a.jobs).slice(0, 6);
  }, [rows, q]);

  const pickedCustomer = customerId ? rows.find((r) => r.job.customer_id === customerId)?.job.customer_name ?? 'Customer' : null;
  const scopeLabel = pickedCustomer
    ? maskCustomerName(pickedCustomer)
    : region
      ? regionLabel(region)
      : q
        ? `Matching "${query.trim()}"`
        : 'All active jobs';

  const onSort = (field: SortField, direction: SortDirection) => {
    setSortField(field);
    setSortDirection(direction);
  };
  const sortHeader = (field: SortField, label: string, right = true, defaultDirection: SortDirection = 'desc') => (
    <th className={`${TH} ${right ? 'text-right' : 'text-left'}`}>
      <SortHeader
        label={label}
        field={field}
        sortField={sortField}
        sortDirection={sortDirection}
        onSort={onSort}
        defaultDirection={defaultDirection}
      />
    </th>
  );

  if (access.loading) {
    return (
      <div className="flex min-h-[300px] items-center justify-center">
        <LoadingSpinner size="md" />
      </div>
    );
  }

  if (!allowed) {
    return (
      <div className="mx-auto max-w-3xl space-y-4 p-6">
        <Notice>
          The Office home shows contract and billing numbers, so it's open to Office Admins and full-access PMs.
        </Notice>
      </div>
    );
  }

  const linkedRows = visible.filter((r) => r.billed != null);
  const stats: { label: string; value: string; note: string }[] = [
    { label: 'Original contracts', value: fmtMoney(sum(visible, (r) => r.original)), note: `${visible.length} job${visible.length === 1 ? '' : 's'}` },
    { label: 'Change Orders', value: fmtMoney(sum(visible, (r) => r.changeOrders)), note: 'Approved only' },
    { label: 'Total contracts', value: fmtMoney(sum(visible, (r) => r.total)), note: 'Original plus Change Orders' },
    {
      label: 'Billed',
      value: billedError ? 'n/a' : fmtMoney(sum(visible, (r) => r.billed)),
      note: billedError
        ? "QuickBooks couldn't be reached"
        : `From QuickBooks · ${linkedRows.length} of ${visible.length} linked`,
    },
    {
      label: 'Left to bill',
      value: billedError ? 'n/a' : fmtMoney(sum(linkedRows, (r) => r.leftToBill)),
      note: billedError ? 'Needs QuickBooks' : 'Linked jobs only',
    },
  ];

  return (
    <div className="mx-auto max-w-7xl space-y-4 p-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-bitcount text-4xl text-neutral-950 dark:text-white sm:text-5xl">Office</h1>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div ref={searchBox} className="relative w-full max-w-xl">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
          <input
            type="search"
            aria-label="Search jobs and customers"
            placeholder="Search job number or customer"
            value={query}
            onChange={(e) => {
              setParam('q', e.target.value || null);
              setSearchOpen(true);
            }}
            onFocus={() => setSearchOpen(true)}
            onKeyDown={(e) => e.key === 'Escape' && setSearchOpen(false)}
            className="w-full rounded-none border border-neutral-300 bg-white py-2 pl-9 pr-3 text-sm text-neutral-900 focus:border-brand focus:outline-none dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-100"
          />
          {searchOpen && customerMatches.length > 0 && (
            <div className="absolute left-0 right-0 top-full z-20 mt-1 max-h-96 overflow-y-auto rounded-none border border-neutral-200 bg-white shadow-lg dark:border-neutral-700 dark:bg-neutral-800">
              {customerMatches.length > 0 && (
                <div className="py-1">
                  <p className="px-3 py-1 text-xs font-medium text-neutral-500 dark:text-neutral-400">Customers</p>
                  {customerMatches.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => {
                        setSearchParams(
                          (prev) => {
                            const next = new URLSearchParams(prev);
                            next.set('customer', c.id);
                            next.delete('q');
                            return next;
                          },
                          { replace: true },
                        );
                        setSearchOpen(false);
                      }}
                      className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm text-neutral-900 hover:bg-neutral-100 dark:text-neutral-100 dark:hover:bg-neutral-700"
                    >
                      <span>{maskCustomerName(c.name)}</span>
                      <span className="text-xs text-neutral-500 dark:text-neutral-400">
                        {c.jobs} active job{c.jobs === 1 ? '' : 's'}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
        <select
          aria-label="Location"
          value={region}
          onChange={(e) => setParam('region', e.target.value || null)}
          className="rounded-none border border-neutral-300 bg-white px-2 py-2 text-sm text-neutral-900 dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-100"
        >
          <option value="">All locations</option>
          {regionsInUse.map((id) => (
            <option key={id} value={id}>
              {regionLabel(id)}
            </option>
          ))}
        </select>
      </div>

      {isAdmin && <OfficeKpis />}

      {setupMissing && (
        <Notice>PM Dashboard database setup hasn't been run, so SOV numbers are missing.</Notice>
      )}
      {error && (
        <div className="flex items-start gap-3 rounded-none border border-red-200 bg-red-50 p-4 dark:border-red-800 dark:bg-red-950">
          <AlertTriangle className="mt-0.5 h-5 w-5 flex-shrink-0 text-red-600" />
          <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3 pt-4">
        <h2 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100">{scopeLabel}</h2>
        {(customerId || region || q) && (
          <Button
            variant="ghost"
            size="sm"
            leftIcon={<X className="h-4 w-4" />}
            onClick={() => setSearchParams({}, { replace: true })}
          >
            Show all
          </Button>
        )}
      </div>

      <div className="grid grid-cols-2 border border-neutral-200 bg-white dark:border-neutral-700 dark:bg-neutral-800 sm:grid-cols-3 lg:grid-cols-5">
        {stats.map((s) => (
          <div key={s.label} className="flex flex-col gap-1 border-b border-r border-neutral-100 p-4 dark:border-neutral-700">
            <span className="text-xs font-medium text-neutral-500 dark:text-neutral-400">{s.label}</span>
            <span className="font-mono text-xl font-semibold text-neutral-900 dark:text-neutral-100">
              {loading ? <LoadingDots /> : s.value}
            </span>
            <span className="text-xs text-neutral-500 dark:text-neutral-400">{loading ? 'Loading' : s.note}</span>
          </div>
        ))}
      </div>

      <div className="overflow-x-auto rounded-none border border-neutral-200 bg-white dark:border-neutral-700 dark:bg-neutral-800">
        <table className="w-full text-sm text-neutral-900 dark:text-neutral-100">
          <thead className="border-b border-neutral-200 bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-900/40">
            <tr>
              {sortHeader('job', 'Job', false)}
              {sortHeader('region', 'Location', false, 'asc')}
              {sortHeader('original', 'Original')}
              {sortHeader('changeOrders', 'Change Orders')}
              {sortHeader('total', 'Total')}
              {sortHeader('billed', 'Billed')}
              {sortHeader('workDone', 'Work done')}
              {sortHeader('leftToBill', 'Left to bill')}
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={8} className="px-3 py-10 text-center text-neutral-500 dark:text-neutral-400">
                  <div className="flex items-center justify-center gap-3">
                    <LoadingSpinner size="sm" />
                    Pulling up every active job and QuickBooks invoices.
                  </div>
                </td>
              </tr>
            )}
            {!loading && visible.length === 0 && (
              <tr>
                <td colSpan={8} className="px-3 py-10 text-center text-neutral-500 dark:text-neutral-400">
                  No active jobs match.
                </td>
              </tr>
            )}
            {!loading &&
              visible.map((r) => (
                <tr
                  key={r.job.id}
                  className="border-t border-neutral-200 hover:bg-neutral-50 dark:border-neutral-700 dark:hover:bg-neutral-700/40"
                >
                  <td className={TD}>
                    <Link to={`/jobs/${r.job.id}`} className="font-medium hover:text-brand hover:underline">
                      {r.job.job_number ? `${r.job.job_number} · ` : ''}
                      {maskJobTitle(r.job.title) || 'Untitled job'}
                    </Link>
                    {r.job.customer_id && (
                      <button
                        type="button"
                        onClick={() => setParam('customer', r.job.customer_id)}
                        className="block text-left text-xs text-neutral-500 hover:text-brand hover:underline dark:text-neutral-400"
                        title="Show all of this customer's jobs"
                      >
                        {maskCustomerName(r.job.customer_name) || 'No customer'}
                      </button>
                    )}
                  </td>
                  <td className={`${TD} whitespace-nowrap`}>
                    <span className="inline-flex items-center gap-2">
                      <span aria-hidden="true" className={`h-2.5 w-2.5 rounded-none ${regionColor(r.job.division)}`} />
                      {regionLabel(r.job.division)}
                    </span>
                  </td>
                  <td className={NUM}>{fmtMoney(r.original)}</td>
                  <td className={NUM}>{r.changeOrders ? fmtMoney(r.changeOrders) : ''}</td>
                  <td className={`${NUM} font-medium`}>{fmtMoney(r.total)}</td>
                  <td className={NUM}>
                    {r.billed != null ? (
                      fmtMoney(r.billed)
                    ) : (
                      <span className="text-xs text-neutral-500 dark:text-neutral-400">
                        {r.linked ? 'n/a' : 'Not linked'}
                      </span>
                    )}
                  </td>
                  <td className={NUM}>
                    {r.workDone != null ? (
                      <span className="inline-flex items-center gap-2">
                        <span className="h-1.5 w-16 bg-neutral-200 dark:bg-neutral-700" aria-hidden="true">
                          <span
                            className="block h-full bg-brand"
                            style={{ width: `${Math.min(1, Math.max(0, r.workDone)) * 100}%` }}
                          />
                        </span>
                        {fmtPct(r.workDone)}
                      </span>
                    ) : (
                      <span className="text-xs text-neutral-500 dark:text-neutral-400">No SOV</span>
                    )}
                  </td>
                  <td
                    className={`${NUM} ${
                      r.leftToBill != null && r.leftToBill < 0 ? 'text-amber-700 dark:text-amber-300' : ''
                    }`}
                  >
                    {r.leftToBill != null ? fmtMoney(r.leftToBill) : ''}
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
      {!loading && (
        <p className="text-xs text-neutral-500 dark:text-neutral-400">
          Work done comes from each job's SOV and weekly updates. Left to bill below zero means billed more than the
          contract.
        </p>
      )}
    </div>
  );
}
