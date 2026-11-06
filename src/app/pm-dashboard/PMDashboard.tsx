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
  fetchJobAttention,
  fetchMyPmJobs,
  fetchPmJobs,
  fetchPmNames,
  loadJobBundles,
  type JobAttention,
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
import { firstNameOf, fmtHours, fmtMoney, MiniBar, MonthPicker, Notice, StatTile, usePmAccess } from './shared';
import ChecklistBoard from './ChecklistBoard';
import CrewBoard from './CrewBoard';
import ChangeOrdersBoard from './ChangeOrdersBoard';

// QuickBooks is asked about a few jobs at a time so a long list does not stall.
const BILLED_WORKERS = 3;

type Scope = 'mine' | 'location';
type FlagTone = 'late' | 'warn' | 'go';

interface Flag {
  label: string;
  tone: FlagTone;
}

const FLAG_CLASS: Record<FlagTone, string> = {
  late: 'border-red-300 bg-red-50 text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-200',
  warn: 'border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200',
  go: 'border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-200',
};

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** What a PM should look at on this job today. Most urgent first. */
function flagsFor(job: PmJob, bundle: JobBundle, attention: JobAttention | undefined): Flag[] {
  const flags: Flag[] = [];
  if (attention?.lateSteps) {
    flags.push({ label: plural(attention.lateSteps, 'late step', 'late steps'), tone: 'late' });
  }
  if (job.status === 'ready_to_bill') flags.push({ label: 'Ready to bill', tone: 'go' });
  if (bundle.pendingChangeOrders > 0) {
    flags.push({
      label: plural(bundle.pendingChangeOrders, 'change order waiting', 'change orders waiting'),
      tone: 'warn',
    });
  }
  if (attention?.noLead) flags.push({ label: 'No lead', tone: 'warn' });
  return flags;
}

export default function PMDashboard() {
  const { user } = useAuth();
  const { maskJobTitle, maskCustomerName } = useDemoMode();
  const access = usePmAccess();
  const divisions = useDivisions();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const options = useMemo(() => jobDivisionOptions(divisions), [divisions]);
  const locationName = useMemo(() => new Map(options.map((o) => [o.id, o.label])), [options]);
  const userDivision = user?.user_metadata?.division as string | undefined;

  // Everyone lands on My Jobs. Only full-access users can switch to a location.
  const scope: Scope =
    access.fullAccess && searchParams.get('scope') === 'location' ? 'location' : 'mine';

  // A PM lands on their own location; anyone else on the one in their profile.
  const division =
    searchParams.get('division') ??
    access.leadDivision ??
    (options.some((o) => o.id === userDivision) ? userDivision : options[0]?.id) ??
    '';
  const month = searchParams.get('month') ?? monthKey(new Date());
  const viewParam = searchParams.get('view');
  const view =
    viewParam === 'checklist' || viewParam === 'crew' || viewParam === 'change-orders' ? viewParam : 'jobs';

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
  const [attention, setAttention] = useState<Record<string, JobAttention> | null>(null);
  const [pmNames, setPmNames] = useState<Record<string, string>>({});
  const [billed, setBilled] = useState<Record<string, number>>({});
  const [setupMissing, setSetupMissing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (access.loading || !access.allowed) return;
    if (scope === 'mine' ? !user?.id : !division) return;
    let alive = true;
    setLoading(true);
    setError(null);

    (async () => {
      try {
        const loaded = scope === 'mine' ? await fetchMyPmJobs(user!.id) : await fetchPmJobs(division);
        const [result, flags, names] = await Promise.all([
          loadJobBundles(loaded),
          // The flags are extra. If they fail, the jobs still show.
          fetchJobAttention(loaded).catch((err) => {
            console.error('[PM Dashboard] Checklist flags failed to load:', err);
            return null;
          }),
          scope === 'location'
            ? fetchPmNames(loaded.map((j) => j.project_manager_id ?? ''))
            : Promise.resolve({} as Record<string, string>),
        ]);
        if (!alive) return;
        setJobs(loaded);
        setBundles(result.bundles);
        setSetupMissing(result.setupMissing);
        setAttention(flags);
        setPmNames(names);
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
  }, [access.loading, access.allowed, scope, division, user?.id]);

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
      jobs
        .flatMap((job) => {
          const bundle = bundles[job.id];
          if (!bundle) return [];
          const progress = computeProgress(bundle.lines, bundle.reports);
          const estimatedHours = sovHours(bundle.lines) || job.estimated_man_hours || 0;
          const usedHours = totalHours(bundle.hoursByMonth);
          return [
            {
              job,
              flags: flagsFor(job, bundle, attention?.[job.id]),
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
        })
        // Jobs that need a look float to the top; the rest keep job-number order.
        .sort((a, b) => b.flags.length - a.flags.length),
    [jobs, bundles, attention, month],
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
  const firstName = firstNameOf(user);
  const needsLook = rows.filter((r) => r.flags.length > 0).length;
  const showPm = scope === 'location';
  const columnCount = showPm ? 8 : 7;

  const summary = (() => {
    const where = locationName.get(division) ?? 'This location';
    if (loading) return scope === 'mine' ? 'Pulling up your jobs.' : `Pulling up ${where} jobs.`;
    if (error) return "Your jobs didn't load. Try again in a minute.";
    if (rows.length === 0) {
      return scope === 'mine'
        ? "You're not the PM on any active jobs right now."
        : `${where} has no active jobs right now.`;
    }
    const count =
      scope === 'mine'
        ? `You're running ${plural(rows.length, 'active job', 'active jobs')}.`
        : `${where} has ${plural(rows.length, 'active job', 'active jobs')}.`;
    const look =
      needsLook === 0
        ? ' Nothing needs a look today.'
        : ` ${needsLook} ${needsLook === 1 ? 'needs' : 'need'} a look.`;
    return count + look;
  })();

  const segClass = (on: boolean) =>
    `rounded-none border px-3 py-2 text-sm ${
      on
        ? 'border-neutral-900 bg-neutral-900 text-white dark:border-neutral-100 dark:bg-neutral-100 dark:text-neutral-900'
        : 'border-neutral-300 bg-white text-neutral-700 hover:bg-neutral-50 dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-200 dark:hover:bg-neutral-700'
    }`;

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
            PM Dashboard
          </p>
          {/* Instrument Serif has one weight, so no bold (it would be faked) */}
          <h1 className="mt-1 font-serif text-4xl font-normal text-neutral-900 dark:text-white">
            {firstName ? `Hey, ${firstName}.` : 'Hey there.'}
          </h1>
          <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-300">{summary}</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {access.fullAccess && (
            <div className="flex" role="group" aria-label="Which jobs">
              <button
                type="button"
                aria-pressed={scope === 'mine'}
                onClick={() => setParam('scope', 'mine')}
                className={segClass(scope === 'mine')}
              >
                My Jobs
              </button>
              <button
                type="button"
                aria-pressed={scope === 'location'}
                onClick={() => setParam('scope', 'location')}
                className={`-ml-px ${segClass(scope === 'location')}`}
              >
                Location
              </button>
            </div>
          )}
          {scope === 'location' && (
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
          )}
          {view === 'jobs' && <MonthPicker month={month} onChange={(m) => setParam('month', m)} />}
        </div>
      </div>

      <div className="flex border-b border-neutral-200 dark:border-neutral-700">
        {(
          [
            ['jobs', 'Jobs'],
            ['checklist', 'Checklist'],
            ['crew', 'Crew'],
            ['change-orders', 'Change Orders'],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setParam('view', key)}
            className={`-mb-px border-b-2 px-4 py-2 text-sm ${
              view === key
                ? 'border-brand font-medium text-neutral-900 dark:text-neutral-100'
                : 'border-transparent text-neutral-500 hover:text-neutral-800 dark:text-neutral-400 dark:hover:text-neutral-200'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {view === 'jobs' && setupMissing && (
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
      ) : view === 'checklist' ? (
        <ChecklistBoard jobs={jobs} />
      ) : view === 'crew' ? (
        <CrewBoard jobs={jobs} />
      ) : view === 'change-orders' ? (
        <ChangeOrdersBoard jobs={jobs} />
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatTile label="Active jobs" value={String(rows.length)} />
            <StatTile
              label="Need a look"
              value={String(needsLook)}
              note="Late steps, change orders, billing, no lead"
            />
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
          </div>

          <div className="overflow-x-auto rounded-none border border-neutral-200 bg-white dark:border-neutral-700 dark:bg-neutral-800">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Job</TableHead>
                  {showPm && <TableHead>PM</TableHead>}
                  <TableHead>Needs attention</TableHead>
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
                    <TableCell colSpan={columnCount} className="py-8 text-center text-neutral-500">
                      {scope === 'mine' ? (
                        <>
                          No active jobs list you as PM. The PM is set on each job's page.
                          {access.fullAccess && (
                            <>
                              {' '}
                              <button
                                type="button"
                                onClick={() => setParam('scope', 'location')}
                                className="font-medium text-neutral-900 underline dark:text-neutral-100"
                              >
                                See a location instead
                              </button>
                            </>
                          )}
                        </>
                      ) : (
                        'No active jobs at this location.'
                      )}
                    </TableCell>
                  </TableRow>
                )}
                {rows.map((row) => {
                  const { job } = row;
                  const href = `/pm-dashboard/${job.id}?month=${month}&scope=${scope}`;
                  const where = scope === 'mine' && job.division ? locationName.get(job.division) : null;
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
                          {where && ` · ${where}`}
                          {!row.hasSov && (row.pickEstimates ? ' · Pick estimates for SOV' : ' · No SOV yet')}
                          {row.unmatched > 0 && ` · ${row.unmatched} sent not counted`}
                        </div>
                      </TableCell>
                      {showPm && (
                        <TableCell className="whitespace-nowrap text-sm text-neutral-700 dark:text-neutral-300">
                          {(job.project_manager_id && pmNames[job.project_manager_id]) || (
                            <span className="text-neutral-400 dark:text-neutral-500">Not set</span>
                          )}
                        </TableCell>
                      )}
                      <TableCell>
                        {row.flags.length === 0 ? (
                          <span className="text-xs text-neutral-400 dark:text-neutral-500">All good</span>
                        ) : (
                          <div className="flex flex-wrap gap-1">
                            {row.flags.map((f) => (
                              <span
                                key={f.label}
                                className={`whitespace-nowrap rounded-none border px-1.5 py-0.5 text-xs ${FLAG_CLASS[f.tone]}`}
                              >
                                {f.label}
                              </span>
                            ))}
                          </div>
                        )}
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
