import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, Check, ChevronLeft, ChevronRight, RefreshCw, X } from 'lucide-react';
import { useAuth } from '@/lib/AuthContext';
import { useDemoMode } from '@/lib/DemoModeContext';
import { Button } from '@/components/ui/Button';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/Table';
import { toast } from '@/components/ui/toast';
import { fetchCrew, type CrewRow, type PmJob } from '@/services/pmDashboardService';
import {
  approveTimeWeek,
  denyTimeWeek,
  getMyTimeReviews,
  sendTimeWeekToQuickBooks,
  PAYROLL_ROLES,
  TIME_STATUS_LABEL,
  TIME_STATUS_STYLE,
  type TimeReviewRow,
} from '@/services/timeReviewService';
import { fmtHours, Notice } from './shared';

// Day strings are YYYY-MM-DD, built from parts so the browser's time zone can't shift the day.
const toYmd = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const parseYmd = (s: string) => {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
};
const addDays = (s: string, count: number) => {
  const d = parseYmd(s);
  d.setDate(d.getDate() + count);
  return toYmd(d);
};
// Pay weeks run Sunday to Saturday, same as TimeStAMP
const thisWeekStart = () => {
  const d = new Date();
  d.setDate(d.getDate() - d.getDay());
  return toYmd(d);
};
const shortDay = (s: string) => parseYmd(s).toLocaleDateString([], { month: 'short', day: 'numeric' });
const clockTime = (d: Date) => d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
const elapsed = (iso: string, now: Date) => {
  const mins = Math.max(0, Math.round((now.getTime() - Date.parse(iso)) / 60000));
  const h = Math.floor(mins / 60);
  return h ? `${h}h ${mins % 60}m` : `${mins}m`;
};

interface Person {
  id: string;
  name: string;
  byDay: Record<string, number>;
  total: number;
  jobIds: Set<string>;
  onClock: boolean;
}

/**
 * Crew tab on the PM Dashboard: who is on these jobs now, and their hours this week.
 * Shows hours on these jobs only. The database decides which jobs the caller may see.
 */
export default function CrewBoard({ jobs }: { jobs: PmJob[] }) {
  const { user } = useAuth();
  const { maskJobTitle } = useDemoMode();
  // Same rule as HR Timesheets: managers only look until TimeStAMP goes live, because
  // approving sends hours to QuickBooks Time and would double them while crews still
  // clock in on Workforce. When Timesheets.tsx opens Approve to managers, change this too.
  const canApprove = PAYROLL_ROLES.includes(user?.user_metadata?.role || '');

  const [weekStart, setWeekStart] = useState(thisWeekStart);
  const [rows, setRows] = useState<CrewRow[]>([]);
  const [reviews, setReviews] = useState<Record<string, TimeReviewRow>>({});
  const [loading, setLoading] = useState(true);
  const [missing, setMissing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadedAt, setLoadedAt] = useState(() => new Date());
  const [busyId, setBusyId] = useState<string | null>(null);
  const [denyFor, setDenyFor] = useState<string | null>(null);
  const [note, setNote] = useState('');

  const jobById = useMemo(() => new Map(jobs.map((j) => [j.id, j])), [jobs]);
  const currentWeek = thisWeekStart();
  const weekEnd = addDays(weekStart, 6);
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const ids = jobs.map((j) => j.id);
      const [crew, review] = await Promise.all([
        ids.length ? fetchCrew(ids, weekStart) : Promise.resolve({ rows: [] as CrewRow[], missing: false }),
        // Week status is extra. Without it the hours still show.
        getMyTimeReviews(weekStart).catch((err) => {
          console.error('[Crew] Week status failed to load:', err);
          return [] as TimeReviewRow[];
        }),
      ]);
      setRows(crew.rows);
      setMissing(crew.missing);
      setReviews(Object.fromEntries(review.map((r) => [r.profile_id, r])));
      setLoadedAt(new Date());
    } catch (err) {
      console.error('[Crew] Load failed:', err);
      setError(err instanceof Error ? err.message : 'Failed to load the crew.');
    } finally {
      setLoading(false);
    }
  }, [jobs, weekStart]);

  useEffect(() => {
    setDenyFor(null);
    setNote('');
    void load();
  }, [load]);

  const jobLabel = (jobId: string) => {
    const job = jobById.get(jobId);
    if (!job) return 'Job';
    return `${job.job_number ? `${job.job_number} · ` : ''}${maskJobTitle(job.title) || 'Untitled job'}`;
  };

  const onClock = useMemo(
    () =>
      rows
        .filter((r) => r.clocked_in_at)
        .sort((a, b) => (a.full_name ?? '').localeCompare(b.full_name ?? '')),
    [rows],
  );

  const people = useMemo(() => {
    const byId = new Map<string, Person>();
    for (const r of rows) {
      // Open punches come back for any day so "Clocked in now" works on past weeks
      if (r.work_date < weekStart || r.work_date > weekEnd) continue;
      const p: Person =
        byId.get(r.profile_id) ??
        { id: r.profile_id, name: r.full_name || 'No name', byDay: {}, total: 0, jobIds: new Set<string>(), onClock: false };
      p.byDay[r.work_date] = (p.byDay[r.work_date] ?? 0) + r.hours;
      p.total += r.hours;
      p.jobIds.add(r.job_id);
      if (r.clocked_in_at) p.onClock = true;
      byId.set(r.profile_id, p);
    }
    return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [rows, weekStart, weekEnd]);

  const showWeekStatus = canApprove || people.some((p) => reviews[p.id]);
  const columnCount = 9 + (showWeekStatus ? 1 : 0) + (canApprove ? 1 : 0);

  // The database enforces every rule (who, when, locked weeks); its message says which failed
  const run = async (review: TimeReviewRow, action: () => Promise<void>, done: string) => {
    setBusyId(review.profile_id);
    try {
      await action();
      toast({ title: done, description: review.full_name || undefined, variant: 'success' });
      setDenyFor(null);
      setNote('');
    } catch (err: any) {
      console.error('[Crew] Action failed:', err);
      toast({ title: "That didn't go through", description: err?.message, variant: 'destructive', persistent: true });
    } finally {
      setBusyId(null);
    }
    await load();
  };

  const sendBack = (review: TimeReviewRow) => {
    if (!note.trim()) return;
    void run(review, () => denyTimeWeek(review.profile_id, weekStart, note.trim()), 'Sent back');
  };

  if (loading) {
    return (
      <div className="flex min-h-[300px] items-center justify-center">
        <LoadingSpinner size="md" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {missing && (
        <Notice>
          Database setup has not been run. The Crew tab stays empty until
          database/migrations/pm_dashboard_crew.sql is run.
        </Notice>
      )}

      {error && (
        <div className="flex items-start gap-3 rounded-none border border-red-200 bg-red-50 p-4 dark:border-red-800 dark:bg-red-950">
          <AlertTriangle className="mt-0.5 h-5 w-5 flex-shrink-0 text-red-600" />
          <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
        </div>
      )}

      <section className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100">Clocked in now</h2>
            <p className="text-xs text-neutral-500 dark:text-neutral-400">
              {onClock.length} on these jobs · updated {clockTime(loadedAt)}
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            leftIcon={<RefreshCw className="h-4 w-4" />}
            onClick={() => void load()}
          >
            Refresh
          </Button>
        </div>
        <div className="overflow-x-auto rounded-none border border-neutral-200 bg-white dark:border-neutral-700 dark:bg-neutral-800">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Person</TableHead>
                <TableHead>Job</TableHead>
                <TableHead>Since</TableHead>
                <TableHead className="text-right">On the clock</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {onClock.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="py-6 text-center text-neutral-500">
                    Nobody is clocked in on these jobs right now.
                  </TableCell>
                </TableRow>
              )}
              {onClock.map((r) => (
                <TableRow key={`${r.profile_id}-${r.job_id}`}>
                  <TableCell className="font-medium text-neutral-900 dark:text-neutral-100">
                    {r.full_name || 'No name'}
                  </TableCell>
                  <TableCell className="text-neutral-700 dark:text-neutral-300">{jobLabel(r.job_id)}</TableCell>
                  <TableCell className="whitespace-nowrap text-neutral-700 dark:text-neutral-300">
                    {clockTime(new Date(r.clocked_in_at!))}
                  </TableCell>
                  <TableCell className="text-right font-mono">{elapsed(r.clocked_in_at!, loadedAt)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100">
              {weekStart === currentWeek ? 'This week' : `Week of ${shortDay(weekStart)}`}
            </h2>
            <p className="text-xs text-neutral-500 dark:text-neutral-400">
              Hours on these jobs only, {shortDay(weekStart)} to {shortDay(weekEnd)}.
            </p>
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="sm"
              aria-label="Previous week"
              onClick={() => setWeekStart(addDays(weekStart, -7))}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              aria-label="Next week"
              disabled={weekStart >= currentWeek}
              onClick={() => setWeekStart(addDays(weekStart, 7))}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div className="overflow-x-auto rounded-none border border-neutral-200 bg-white dark:border-neutral-700 dark:bg-neutral-800">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Person</TableHead>
                {days.map((d) => (
                  <TableHead key={d} className="text-right">
                    <div>{parseYmd(d).toLocaleDateString([], { weekday: 'short' })}</div>
                    <div className="text-[11px] font-normal">{parseYmd(d).getMonth() + 1}/{parseYmd(d).getDate()}</div>
                  </TableHead>
                ))}
                <TableHead className="text-right">Total</TableHead>
                {showWeekStatus && <TableHead>Week</TableHead>}
                {canApprove && <TableHead className="text-right">Approve</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {people.length === 0 && (
                <TableRow>
                  <TableCell colSpan={columnCount} className="py-6 text-center text-neutral-500">
                    No time on these jobs this week.
                  </TableCell>
                </TableRow>
              )}
              {people.map((p) => {
                const review = reviews[p.id];
                const busy = busyId === p.id;
                const jobNumbers = [...p.jobIds]
                  .map((id) => jobById.get(id)?.job_number)
                  .filter(Boolean)
                  .join(', ');
                return (
                  <React.Fragment key={p.id}>
                    <TableRow>
                      <TableCell>
                        <div className="flex flex-wrap items-center gap-2 font-medium text-neutral-900 dark:text-neutral-100">
                          {p.name}
                          {p.onClock && (
                            <span className="rounded-none border border-emerald-300 bg-emerald-50 px-1.5 py-0.5 text-[11px] font-normal text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-200">
                              On the clock
                            </span>
                          )}
                        </div>
                        {jobNumbers && (
                          <div className="text-xs text-neutral-500 dark:text-neutral-400">{jobNumbers}</div>
                        )}
                      </TableCell>
                      {days.map((d) => (
                        <TableCell key={d} className="text-right font-mono">
                          {p.byDay[d] ? fmtHours(p.byDay[d]) : ''}
                        </TableCell>
                      ))}
                      <TableCell className="text-right font-mono font-semibold">{fmtHours(p.total)}</TableCell>
                      {showWeekStatus && (
                        <TableCell>
                          {review && (
                            <>
                              <span
                                className={`whitespace-nowrap rounded-none px-2 py-0.5 text-xs font-medium ${TIME_STATUS_STYLE[review.status]}`}
                              >
                                {TIME_STATUS_LABEL[review.status]}
                              </span>
                              {/* Approval covers every job, so show the number being approved */}
                              <div className="mt-1 whitespace-nowrap text-xs text-neutral-500 dark:text-neutral-400">
                                {Number(review.hours).toFixed(2)} h, all jobs
                              </div>
                            </>
                          )}
                        </TableCell>
                      )}
                      {canApprove && (
                        <TableCell>
                          {review && review.status !== 'approved' && (
                            <div className="flex justify-end gap-2">
                              <Button
                                variant="outline"
                                size="sm"
                                leftIcon={<X className="h-4 w-4" />}
                                disabled={!review.is_ready || busy}
                                onClick={() => {
                                  setDenyFor(p.id);
                                  setNote('');
                                }}
                              >
                                Send back
                              </Button>
                              <Button
                                variant="primary"
                                size="sm"
                                leftIcon={<Check className="h-4 w-4" />}
                                disabled={!review.is_ready || review.clocked_in}
                                isLoading={busy}
                                onClick={() =>
                                  void run(
                                    review,
                                    async () => {
                                      await approveTimeWeek(review.profile_id, weekStart, Number(review.hours));
                                      await sendTimeWeekToQuickBooks(review.profile_id, weekStart);
                                    },
                                    'Approved and sent to QuickBooks',
                                  )
                                }
                              >
                                Approve
                              </Button>
                            </div>
                          )}
                        </TableCell>
                      )}
                    </TableRow>

                    {denyFor === p.id && review && (
                      <TableRow className="bg-neutral-50 dark:bg-neutral-800/60">
                        <TableCell colSpan={columnCount}>
                          <label className="form-label" htmlFor={`crew-note-${p.id}`}>
                            What needs fixing?
                          </label>
                          <div className="flex flex-wrap gap-2">
                            <input
                              id={`crew-note-${p.id}`}
                              className="form-input min-w-[16rem] flex-1 rounded-none"
                              value={note}
                              autoFocus
                              onChange={(e) => setNote(e.target.value)}
                              onKeyDown={(e) => e.key === 'Enter' && sendBack(review)}
                            />
                            <Button
                              variant="primary"
                              size="sm"
                              disabled={!note.trim()}
                              isLoading={busy}
                              onClick={() => sendBack(review)}
                            >
                              Send back
                            </Button>
                            <Button variant="ghost" size="sm" onClick={() => setDenyFor(null)}>
                              Cancel
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                  </React.Fragment>
                );
              })}
              {people.length > 0 && (
                <TableRow className="bg-neutral-50 dark:bg-neutral-900/40">
                  <TableCell className="font-medium text-neutral-700 dark:text-neutral-300">All crew</TableCell>
                  {days.map((d) => (
                    <TableCell key={d} className="text-right font-mono text-neutral-700 dark:text-neutral-300">
                      {(() => {
                        const total = people.reduce((sum, p) => sum + (p.byDay[d] ?? 0), 0);
                        return total ? fmtHours(total) : '';
                      })()}
                    </TableCell>
                  ))}
                  <TableCell className="text-right font-mono font-semibold">
                    {fmtHours(people.reduce((sum, p) => sum + p.total, 0))}
                  </TableCell>
                  {showWeekStatus && <TableCell />}
                  {canApprove && <TableCell />}
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>

        <p className="text-xs text-neutral-500 dark:text-neutral-400">
          {canApprove
            ? 'Approving covers the person\'s whole week on every job, not just these.'
            : 'Payroll approves weeks until TimeStAMP goes live.'}{' '}
          Full punch detail is in{' '}
          <Link to="/hr/time-attendance/timesheets" className="underline hover:text-neutral-800 dark:hover:text-neutral-200">
            HR Timesheets
          </Link>
          .
        </p>
      </section>
    </div>
  );
}
