import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { AlertTriangle } from 'lucide-react';
import { useAuth } from '@/lib/AuthContext';
import { useDemoMode } from '@/lib/DemoModeContext';
import { useDivisions } from '@/hooks/useDivisions';
import { jobDivisionOptions } from '@/services/divisionsService';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/Table';
import {
  contractTotal,
  fetchBilledToDate,
  fetchPmJobs,
  loadJobBundles,
  type JobBundle,
  type PmJob,
} from '@/services/pmDashboardService';
import {
  completedPct,
  computeProgress,
  monthDollars,
  monthKey,
  monthLabel,
  pct,
  sovHours,
  totalHours,
  unmatchedCount,
} from '@/utils/pmDashboardCalculations';
import { fmtHours, fmtMoney, MiniBar, MonthPicker, Notice, StatTile, usePmAccess } from './shared';

// QuickBooks is asked about a few jobs at a time so a long list does not stall.
const BILLED_WORKERS = 3;

export default function PMDashboard() {
  const { user } = useAuth();
  const { maskJobTitle, maskCustomerName } = useDemoMode();
  const access = usePmAccess();
  const divisions = useDivisions();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const options = useMemo(() => jobDivisionOptions(divisions), [divisions]);
  const userDivision = user?.user_metadata?.division as string | undefined;

  // A PM lands on their own location; anyone else on the one in their profile.
  const division =
    searchParams.get('division') ??
    access.leadDivision ??
    (options.some((o) => o.id === userDivision) ? userDivision : options[0]?.id) ??
    '';
  const month = searchParams.get('month') ?? monthKey(new Date());

  const setParam = (key: string, value: string) =>
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.set(key, value);
        return next;
      },
      { replace: true },
    );

  const [jobs, setJobs] = useState<PmJob[]>([]);
  const [bundles, setBundles] = useState<Record<string, JobBundle>>({});
  const [billed, setBilled] = useState<Record<string, number>>({});
  const [setupMissing, setSetupMissing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (access.loading || !access.allowed || !division) return;
    let alive = true;
    setLoading(true);
    setError(null);

    (async () => {
      try {
        const loaded = await fetchPmJobs(division);
        const result = await loadJobBundles(loaded);
        if (!alive) return;
        setJobs(loaded);
        setBundles(result.bundles);
        setSetupMissing(result.setupMissing);
      } catch (err) {
        console.error('[PM Dashboard] Load failed:', err);
        if (alive) setError(err instanceof Error ? err.message : 'Failed to load jobs.');
      } finally {
        if (alive) setLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [access.loading, access.allowed, division]);

  useEffect(() => {
    let alive = true;
    const queue = jobs.filter((j) => j.quickbooks_project_id);
    let next = 0;
    setBilled({});

    const worker = async () => {
      while (alive && next < queue.length) {
        const job = queue[next++];
        const amount = await fetchBilledToDate(job.quickbooks_project_id!).catch(() => 0);
        if (alive) setBilled((prev) => ({ ...prev, [job.id]: amount }));
      }
    };
    void Promise.all(Array.from({ length: BILLED_WORKERS }, worker));

    return () => {
      alive = false;
    };
  }, [jobs]);

  const rows = useMemo(
    () =>
      jobs.flatMap((job) => {
        const bundle = bundles[job.id];
        if (!bundle) return [];
        const progress = computeProgress(bundle.lines, bundle.reports);
        const estimatedHours = sovHours(bundle.lines) || job.estimated_man_hours || 0;
        const usedHours = totalHours(bundle.hoursByMonth);
        return [
          {
            job,
            dollars: monthDollars(bundle.lines, progress, month),
            hours: bundle.hoursByMonth[month] ?? 0,
            contract: contractTotal(bundle),
            completed: completedPct(bundle.lines, progress),
            hoursUsed: pct(usedHours, estimatedHours),
            overHours: estimatedHours > 0 && usedHours > estimatedHours,
            unmatched: unmatchedCount(progress),
            hasSov: bundle.lines.length > 0,
            pickEstimates: bundle.lines.length === 0 && bundle.estimateCount > 1,
          },
        ];
      }),
    [jobs, bundles, month],
  );

  if (access.loading) {
    return (
      <div className="flex min-h-[300px] items-center justify-center">
        <LoadingSpinner size="md" />
      </div>
    );
  }

  if (!access.allowed) {
    return (
      <div className="p-6">
        <Notice>This page is for project managers and admins.</Notice>
      </div>
    );
  }

  const monthName = monthLabel(month, 'long');

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-neutral-900 dark:text-neutral-100">PM Dashboard</h1>
          <p className="text-sm text-neutral-500 dark:text-neutral-400">
            Active jobs by location. Pick a job to see its schedule of values.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <select
            aria-label="Location"
            value={division}
            onChange={(e) => setParam('division', e.target.value)}
            className="rounded-none border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-100"
          >
            {options.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </select>
          <MonthPicker month={month} onChange={(m) => setParam('month', m)} />
        </div>
      </div>

      {setupMissing && (
        <Notice>
          Database setup has not been run. Hours and saved SOV edits stay empty until
          database/migrations/pm_dashboard.sql is run.
        </Notice>
      )}

      {error && (
        <div className="flex items-start gap-3 rounded-none border border-red-200 bg-red-50 p-4 dark:border-red-800 dark:bg-red-950">
          <AlertTriangle className="mt-0.5 h-5 w-5 flex-shrink-0 text-red-600" />
          <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
        </div>
      )}

      {loading ? (
        <div className="flex min-h-[300px] items-center justify-center">
          <LoadingSpinner size="md" />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <StatTile
              label={`$ earned in ${monthName}`}
              value={fmtMoney(rows.reduce((sum, r) => sum + r.dollars, 0))}
              note="Reports sent this month times $ each"
            />
            <StatTile
              label={`Hours worked in ${monthName}`}
              value={fmtHours(rows.reduce((sum, r) => sum + r.hours, 0))}
              note="From the TimeStAMP clock"
            />
            <StatTile label="Active jobs" value={String(rows.length)} />
          </div>

          <div className="overflow-x-auto rounded-none border border-neutral-200 bg-white dark:border-neutral-700 dark:bg-neutral-800">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Job</TableHead>
                  <TableHead className="text-right">$ {monthLabel(month)}</TableHead>
                  <TableHead className="text-right">Hrs {monthLabel(month)}</TableHead>
                  <TableHead>Billed</TableHead>
                  <TableHead>Completed</TableHead>
                  <TableHead>Hours used</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-neutral-500">
                      No active jobs at this location.
                    </TableCell>
                  </TableRow>
                )}
                {rows.map((row) => {
                  const { job } = row;
                  const href = `/pm-dashboard/${job.id}?month=${month}`;
                  return (
                    <TableRow
                      key={job.id}
                      className="cursor-pointer hover:bg-neutral-50 dark:hover:bg-neutral-700/40"
                      onClick={() => navigate(href)}
                    >
                      <TableCell>
                        <Link
                          to={href}
                          onClick={(e) => e.stopPropagation()}
                          className="font-medium text-neutral-900 hover:underline dark:text-neutral-100"
                        >
                          {job.job_number ? `${job.job_number} ` : ''}
                          {maskJobTitle(job.title) || 'Untitled job'}
                        </Link>
                        <div className="text-xs text-neutral-500 dark:text-neutral-400">
                          {maskCustomerName(job.customer_name)}
                          {!row.hasSov && (row.pickEstimates ? ' · Pick estimates for SOV' : ' · No SOV yet')}
                          {row.unmatched > 0 && ` · ${row.unmatched} sent not counted`}
                        </div>
                      </TableCell>
                      <TableCell className="text-right font-mono">{fmtMoney(row.dollars)}</TableCell>
                      <TableCell className="text-right font-mono">{fmtHours(row.hours)}</TableCell>
                      <TableCell>
                        {!job.quickbooks_project_id ? (
                          <span className="text-xs text-neutral-500 dark:text-neutral-400">
                            Not linked to QuickBooks
                          </span>
                        ) : billed[job.id] === undefined ? (
                          <LoadingSpinner size="xs" />
                        ) : (
                          <MiniBar value={pct(billed[job.id], row.contract)} />
                        )}
                      </TableCell>
                      <TableCell>
                        <MiniBar value={row.completed} />
                      </TableCell>
                      <TableCell>
                        <MiniBar value={row.hoursUsed} over={row.overHours} />
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </>
      )}
    </div>
  );
}
