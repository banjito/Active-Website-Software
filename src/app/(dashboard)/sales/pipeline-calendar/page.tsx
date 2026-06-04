import React, { FormEvent, useMemo, useState } from 'react';
import {
  CalendarDays,
  CalendarRange,
  Check,
  ChevronLeft,
  ChevronRight,
  Pencil,
  Plus,
  Table2,
  Trash2,
  X,
} from 'lucide-react';

import { Button } from '@/components/ui/Button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/Dialog';
import { Input } from '@/components/ui/Input';
import { cn } from '@/lib/utils';
import {
  loadPipelineJobs,
  makePipelineJobId,
  PipelineJob,
  PipelineRegion,
  PipelineStatus,
  savePipelineJobs,
} from '@/services/pipelineCalendarService';

type ViewMode = 'calendar' | 'list';
type RangeMode = 'month' | 'quarter';
type SortKey = 'startDate' | 'customer' | 'amount' | 'region';
type SortDirection = 'asc' | 'desc';

interface PipelineJobForm {
  customer: string;
  dataCenterId: string;
  location: string;
  region: PipelineRegion;
  amount: string;
  startDate: string;
  endDate: string;
  status: PipelineStatus;
}

const regions: PipelineRegion[] = ['AL', 'TN', 'GA', 'International'];
const statuses: PipelineStatus[] = ['confirmed', 'expected', 'dropped'];

const regionPalette: Record<PipelineRegion, { bg: string; light: string; border: string }> = {
  AL: { bg: '#2563eb', light: '#dbeafe', border: '#93c5fd' },
  TN: { bg: '#16a34a', light: '#dcfce7', border: '#86efac' },
  GA: { bg: '#f26722', light: '#ffedd5', border: '#fdba74' },
  International: { bg: '#7c3aed', light: '#ede9fe', border: '#c4b5fd' },
};

const statusLabels: Record<PipelineStatus, string> = {
  confirmed: 'Confirmed',
  expected: 'Expected',
  dropped: 'Dropped',
};

const defaultRegionFilter: Record<PipelineRegion, boolean> = {
  AL: true,
  TN: true,
  GA: true,
  International: true,
};

const defaultStatusFilter: Record<PipelineStatus, boolean> = {
  confirmed: true,
  expected: true,
  dropped: true,
};

const dayMs = 24 * 60 * 60 * 1000;

function parseDate(value: string): Date {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day);
}

function toDateInputValue(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function addDays(date: Date, days: number): Date {
  const nextDate = new Date(date);
  nextDate.setDate(nextDate.getDate() + days);
  return nextDate;
}

function addMonths(date: Date, months: number): Date {
  const nextDate = new Date(date);
  nextDate.setMonth(nextDate.getMonth() + months);
  return nextDate;
}

function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function endOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0);
}

function startOfQuarter(date: Date): Date {
  const quarterMonth = Math.floor(date.getMonth() / 3) * 3;
  return new Date(date.getFullYear(), quarterMonth, 1);
}

function endOfQuarter(date: Date): Date {
  const quarterMonth = Math.floor(date.getMonth() / 3) * 3;
  return new Date(date.getFullYear(), quarterMonth + 3, 0);
}

function clampDate(date: Date, minDate: Date, maxDate: Date): Date {
  if (date < minDate) return minDate;
  if (date > maxDate) return maxDate;
  return date;
}

function formatMillions(amount: number): string {
  return `$${amount.toLocaleString('en-US', {
    minimumFractionDigits: amount % 1 === 0 ? 0 : 1,
    maximumFractionDigits: 2,
  })}m`;
}

function formatDate(value?: string): string {
  if (!value) return 'Open';

  return parseDate(value).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function getRangeLabel(date: Date, rangeMode: RangeMode): string {
  if (rangeMode === 'month') {
    return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  }

  const quarter = Math.floor(date.getMonth() / 3) + 1;
  return `Q${quarter} ${date.getFullYear()}`;
}

function getEmptyForm(): PipelineJobForm {
  return {
    customer: '',
    dataCenterId: '',
    location: '',
    region: 'GA',
    amount: '',
    startDate: toDateInputValue(new Date()),
    endDate: '',
    status: 'expected',
  };
}

function getFormFromJob(job: PipelineJob): PipelineJobForm {
  return {
    customer: job.customer,
    dataCenterId: job.dataCenterId || '',
    location: job.location,
    region: job.region,
    amount: String(job.amount),
    startDate: job.startDate,
    endDate: job.endDate || '',
    status: job.status,
  };
}

function jobOverlapsRange(job: PipelineJob, viewStart: Date, viewEnd: Date): boolean {
  const jobStart = parseDate(job.startDate);
  const jobEnd = job.endDate ? parseDate(job.endDate) : viewEnd;

  return jobStart <= viewEnd && jobEnd >= viewStart;
}

function getMonthSegments(viewStart: Date, viewEnd: Date) {
  const viewEndExclusive = addDays(viewEnd, 1);
  const totalMs = viewEndExclusive.getTime() - viewStart.getTime();
  const segments: Array<{ label: string; left: number; width: number }> = [];
  let cursor = startOfMonth(viewStart);

  while (cursor <= viewEnd) {
    const monthStart = cursor < viewStart ? viewStart : cursor;
    const rawMonthEnd = endOfMonth(cursor);
    const monthEnd = rawMonthEnd > viewEnd ? viewEnd : rawMonthEnd;

    segments.push({
      label: cursor.toLocaleDateString('en-US', { month: 'short' }),
      left: ((monthStart.getTime() - viewStart.getTime()) / totalMs) * 100,
      width: ((addDays(monthEnd, 1).getTime() - monthStart.getTime()) / totalMs) * 100,
    });

    cursor = addMonths(cursor, 1);
  }

  return segments;
}

function getDateTicks(viewStart: Date, viewEnd: Date, rangeMode: RangeMode) {
  const viewEndExclusive = addDays(viewEnd, 1);
  const totalMs = viewEndExclusive.getTime() - viewStart.getTime();
  const ticks: Array<{ label: string; left: number }> = [];
  let cursor = rangeMode === 'month' ? viewStart : startOfMonth(viewStart);
  const stepDays = rangeMode === 'month' ? 7 : 0;

  while (cursor <= viewEnd) {
    ticks.push({
      label:
        rangeMode === 'month'
          ? String(cursor.getDate())
          : cursor.toLocaleDateString('en-US', { month: 'short' }),
      left: ((cursor.getTime() - viewStart.getTime()) / totalMs) * 100,
    });

    cursor = rangeMode === 'month' ? addDays(cursor, stepDays) : addMonths(cursor, 1);
  }

  return ticks;
}

function getBarStyle(job: PipelineJob, viewStart: Date, viewEnd: Date): React.CSSProperties {
  const viewEndExclusive = addDays(viewEnd, 1);
  const totalMs = viewEndExclusive.getTime() - viewStart.getTime();
  const jobStart = clampDate(parseDate(job.startDate), viewStart, viewEnd);
  const rawJobEnd = job.endDate ? parseDate(job.endDate) : viewEnd;
  const jobEnd = clampDate(rawJobEnd, viewStart, viewEnd);
  const left = ((jobStart.getTime() - viewStart.getTime()) / totalMs) * 100;
  const width = ((addDays(jobEnd, 1).getTime() - jobStart.getTime()) / totalMs) * 100;
  const baseColor = job.status === 'dropped' ? '#9ca3af' : regionPalette[job.region].bg;

  return {
    left: `${left}%`,
    width: `${Math.max(width, 2.8)}%`,
    backgroundColor: baseColor,
  };
}

function sortJobs(jobs: PipelineJob[], sortKey: SortKey, direction: SortDirection): PipelineJob[] {
  return [...jobs].sort((jobA, jobB) => {
    let result = 0;

    if (sortKey === 'amount') {
      result = jobA.amount - jobB.amount;
    } else if (sortKey === 'startDate') {
      result = parseDate(jobA.startDate).getTime() - parseDate(jobB.startDate).getTime();
    } else {
      result = String(jobA[sortKey]).localeCompare(String(jobB[sortKey]));
    }

    return direction === 'asc' ? result : -result;
  });
}

function StatusIcon({ status }: { status: PipelineStatus }) {
  if (status === 'confirmed') return <Check className="h-3.5 w-3.5" />;
  if (status === 'dropped') return <X className="h-3.5 w-3.5" />;
  return <span className="h-2 w-2 rounded-full bg-current" />;
}

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-gray-100 py-2 text-sm last:border-b-0 dark:border-gray-800">
      <dt className="text-gray-500 dark:text-gray-400">{label}</dt>
      <dd className="text-right font-medium text-gray-900 dark:text-gray-100">{value}</dd>
    </div>
  );
}

export default function PipelineCalendarPage() {
  const [jobs, setJobs] = useState<PipelineJob[]>(() => loadPipelineJobs());
  const [viewMode, setViewMode] = useState<ViewMode>('calendar');
  const [rangeMode, setRangeMode] = useState<RangeMode>('quarter');
  const [anchorDate, setAnchorDate] = useState<Date>(() => new Date());
  const [regionFilter, setRegionFilter] = useState<Record<PipelineRegion, boolean>>(defaultRegionFilter);
  const [statusFilter, setStatusFilter] = useState<Record<PipelineStatus, boolean>>(defaultStatusFilter);
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingJobId, setEditingJobId] = useState<string | null>(null);
  const [formState, setFormState] = useState<PipelineJobForm>(getEmptyForm);
  const [formError, setFormError] = useState('');
  const [storageError, setStorageError] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('startDate');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');

  const viewStart = useMemo(
    () => (rangeMode === 'month' ? startOfMonth(anchorDate) : startOfQuarter(anchorDate)),
    [anchorDate, rangeMode],
  );
  const viewEnd = useMemo(
    () => (rangeMode === 'month' ? endOfMonth(anchorDate) : endOfQuarter(anchorDate)),
    [anchorDate, rangeMode],
  );

  const filteredJobs = useMemo(
    () =>
      jobs.filter((job) => {
        return regionFilter[job.region] && statusFilter[job.status];
      }),
    [jobs, regionFilter, statusFilter],
  );

  const visibleCalendarJobs = useMemo(
    () => sortJobs(filteredJobs.filter((job) => jobOverlapsRange(job, viewStart, viewEnd)), 'startDate', 'asc'),
    [filteredJobs, viewStart, viewEnd],
  );

  const sortedListJobs = useMemo(
    () => sortJobs(filteredJobs, sortKey, sortDirection),
    [filteredJobs, sortDirection, sortKey],
  );

  const selectedJob = useMemo(
    () => jobs.find((job) => job.id === selectedJobId) || visibleCalendarJobs[0] || null,
    [jobs, selectedJobId, visibleCalendarJobs],
  );

  const totals = useMemo(() => {
    const confirmed = filteredJobs
      .filter((job) => job.status === 'confirmed')
      .reduce((sum, job) => sum + job.amount, 0);
    const expected = filteredJobs
      .filter((job) => job.status === 'expected')
      .reduce((sum, job) => sum + job.amount, 0);
    const dropped = filteredJobs
      .filter((job) => job.status === 'dropped')
      .reduce((sum, job) => sum + job.amount, 0);

    return {
      confirmed,
      expected,
      dropped,
      active: confirmed + expected,
    };
  }, [filteredJobs]);

  const monthSegments = useMemo(() => getMonthSegments(viewStart, viewEnd), [viewEnd, viewStart]);
  const dateTicks = useMemo(() => getDateTicks(viewStart, viewEnd, rangeMode), [rangeMode, viewEnd, viewStart]);

  const commitJobs = (nextJobs: PipelineJob[]) => {
    setJobs(nextJobs);
    const saved = savePipelineJobs(nextJobs);
    setStorageError(saved ? '' : 'Saved on this screen only. Browser storage failed.');
  };

  const openAddForm = () => {
    setEditingJobId(null);
    setFormState(getEmptyForm());
    setFormError('');
    setIsFormOpen(true);
  };

  const openEditForm = (job: PipelineJob) => {
    setEditingJobId(job.id);
    setFormState(getFormFromJob(job));
    setFormError('');
    setIsFormOpen(true);
  };

  const updateFormField = <Key extends keyof PipelineJobForm>(field: Key, value: PipelineJobForm[Key]) => {
    setFormState((currentForm) => ({ ...currentForm, [field]: value }));
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormError('');

    try {
      const amount = Number(formState.amount);
      const customer = formState.customer.trim();
      const location = formState.location.trim();
      const dataCenterId = formState.dataCenterId.trim();

      if (!customer || !location || !formState.startDate || !formState.amount) {
        setFormError('Customer, location, amount, and start date are required.');
        return;
      }

      if (!Number.isFinite(amount) || amount <= 0) {
        setFormError('Amount must be greater than zero.');
        return;
      }

      if (formState.endDate && parseDate(formState.endDate) < parseDate(formState.startDate)) {
        setFormError('End date must be after start date.');
        return;
      }

      const nextJob: PipelineJob = {
        id: editingJobId || makePipelineJobId(),
        customer,
        dataCenterId: dataCenterId || undefined,
        location,
        region: formState.region,
        amount,
        startDate: formState.startDate,
        endDate: formState.endDate || undefined,
        status: formState.status,
      };

      const nextJobs = editingJobId
        ? jobs.map((job) => (job.id === editingJobId ? nextJob : job))
        : [nextJob, ...jobs];

      commitJobs(nextJobs);
      setSelectedJobId(nextJob.id);
      setIsFormOpen(false);
    } catch (error) {
      console.error('Error saving pipeline calendar job:', error);
      setFormError('Could not save job.');
    }
  };

  const handleDeleteJob = (jobId: string) => {
    const job = jobs.find((currentJob) => currentJob.id === jobId);
    if (!job) return;

    const shouldDelete = window.confirm(`Delete ${job.customer} ${job.dataCenterId || 'job'}?`);
    if (!shouldDelete) return;

    try {
      const nextJobs = jobs.filter((currentJob) => currentJob.id !== jobId);
      commitJobs(nextJobs);
      if (selectedJobId === jobId) setSelectedJobId(null);
      if (editingJobId === jobId) setIsFormOpen(false);
    } catch (error) {
      console.error('Error deleting pipeline calendar job:', error);
      setStorageError('Could not delete job.');
    }
  };

  const moveRange = (direction: -1 | 1) => {
    setAnchorDate((currentDate) => addMonths(currentDate, rangeMode === 'month' ? direction : direction * 3));
  };

  const toggleSort = (nextSortKey: SortKey) => {
    if (sortKey === nextSortKey) {
      setSortDirection((currentDirection) => (currentDirection === 'asc' ? 'desc' : 'asc'));
      return;
    }

    setSortKey(nextSortKey);
    setSortDirection('asc');
  };

  return (
    <div className="mx-auto flex max-w-[1500px] flex-col gap-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-950 dark:text-gray-50">Pipeline Calendar</h1>
          <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">Data center construction pipeline</p>
        </div>

        <Button leftIcon={<Plus className="h-4 w-4" />} onClick={openAddForm}>
          Add job
        </Button>
      </div>

      <div className="grid gap-3 md:grid-cols-4">
        <div className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-dark-150">
          <div className="text-xs font-medium uppercase text-gray-500 dark:text-gray-400">Pipeline</div>
          <div className="mt-2 text-2xl font-semibold text-gray-950 dark:text-gray-50">
            {formatMillions(totals.confirmed)} / {formatMillions(totals.active)}
          </div>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-dark-150">
          <div className="text-xs font-medium uppercase text-gray-500 dark:text-gray-400">Confirmed</div>
          <div className="mt-2 text-2xl font-semibold text-gray-950 dark:text-gray-50">
            {formatMillions(totals.confirmed)}
          </div>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-dark-150">
          <div className="text-xs font-medium uppercase text-gray-500 dark:text-gray-400">Expected</div>
          <div className="mt-2 text-2xl font-semibold text-gray-950 dark:text-gray-50">
            {formatMillions(totals.expected)}
          </div>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-dark-150">
          <div className="text-xs font-medium uppercase text-gray-500 dark:text-gray-400">Dropped</div>
          <div className="mt-2 text-2xl font-semibold text-gray-500 dark:text-gray-400">
            {formatMillions(totals.dropped)}
          </div>
        </div>
      </div>

      {storageError && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200">
          {storageError}
        </div>
      )}

      <section className="rounded-lg border border-gray-200 bg-white dark:border-gray-800 dark:bg-dark-150">
        <div className="flex flex-col gap-4 border-b border-gray-200 p-4 dark:border-gray-800">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <div className="flex flex-wrap items-center gap-2">
              <div className="inline-flex rounded-lg border border-gray-200 bg-gray-50 p-1 dark:border-gray-700 dark:bg-gray-900">
                <button
                  type="button"
                  onClick={() => setViewMode('calendar')}
                  className={cn(
                    'inline-flex h-9 items-center gap-2 rounded-md px-3 text-sm font-medium text-gray-600 dark:text-gray-300',
                    viewMode === 'calendar' && 'bg-white text-gray-950 shadow-sm dark:bg-gray-800 dark:text-gray-50',
                  )}
                >
                  <CalendarRange className="h-4 w-4" />
                  Calendar
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('list')}
                  className={cn(
                    'inline-flex h-9 items-center gap-2 rounded-md px-3 text-sm font-medium text-gray-600 dark:text-gray-300',
                    viewMode === 'list' && 'bg-white text-gray-950 shadow-sm dark:bg-gray-800 dark:text-gray-50',
                  )}
                >
                  <Table2 className="h-4 w-4" />
                  Table
                </button>
              </div>

              <div className="inline-flex rounded-lg border border-gray-200 bg-gray-50 p-1 dark:border-gray-700 dark:bg-gray-900">
                <button
                  type="button"
                  onClick={() => setRangeMode('month')}
                  className={cn(
                    'h-9 rounded-md px-3 text-sm font-medium text-gray-600 dark:text-gray-300',
                    rangeMode === 'month' && 'bg-white text-gray-950 shadow-sm dark:bg-gray-800 dark:text-gray-50',
                  )}
                >
                  Month
                </button>
                <button
                  type="button"
                  onClick={() => setRangeMode('quarter')}
                  className={cn(
                    'h-9 rounded-md px-3 text-sm font-medium text-gray-600 dark:text-gray-300',
                    rangeMode === 'quarter' && 'bg-white text-gray-950 shadow-sm dark:bg-gray-800 dark:text-gray-50',
                  )}
                >
                  Quarter
                </button>
              </div>

              <div className="flex items-center gap-1 rounded-lg border border-gray-200 bg-gray-50 p-1 dark:border-gray-700 dark:bg-gray-900">
                <button
                  type="button"
                  aria-label="Previous range"
                  onClick={() => moveRange(-1)}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-md text-gray-600 hover:bg-white hover:text-gray-950 dark:text-gray-300 dark:hover:bg-gray-800 dark:hover:text-gray-50"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <div className="min-w-32 px-2 text-center text-sm font-semibold text-gray-950 dark:text-gray-50">
                  {getRangeLabel(anchorDate, rangeMode)}
                </div>
                <button
                  type="button"
                  aria-label="Next range"
                  onClick={() => moveRange(1)}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-md text-gray-600 hover:bg-white hover:text-gray-950 dark:text-gray-300 dark:hover:bg-gray-800 dark:hover:text-gray-50"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {regions.map((region) => (
                <button
                  key={region}
                  type="button"
                  onClick={() => setRegionFilter((current) => ({ ...current, [region]: !current[region] }))}
                  className={cn(
                    'inline-flex h-9 items-center gap-2 rounded-md border px-3 text-sm font-medium',
                    regionFilter[region]
                      ? 'border-gray-300 bg-white text-gray-950 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-50'
                      : 'border-gray-200 bg-gray-50 text-gray-400 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-500',
                  )}
                >
                  <span
                    className="h-2.5 w-2.5 rounded-full"
                    style={{ backgroundColor: regionPalette[region].bg }}
                  />
                  {region}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              {statuses.map((status) => (
                <button
                  key={status}
                  type="button"
                  onClick={() => setStatusFilter((current) => ({ ...current, [status]: !current[status] }))}
                  className={cn(
                    'inline-flex h-9 items-center gap-2 rounded-md border px-3 text-sm font-medium',
                    statusFilter[status]
                      ? 'border-gray-300 bg-white text-gray-950 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-50'
                      : 'border-gray-200 bg-gray-50 text-gray-400 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-500',
                  )}
                >
                  <StatusIcon status={status} />
                  {statusLabels[status]}
                </button>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-3 text-xs text-gray-600 dark:text-gray-400">
              {regions.map((region) => (
                <span key={region} className="inline-flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: regionPalette[region].bg }} />
                  {region}
                </span>
              ))}
            </div>
          </div>
        </div>

        {viewMode === 'calendar' ? (
          <div className="grid gap-4 p-4 xl:grid-cols-[minmax(0,1fr)_340px]">
            <div className="min-w-0 overflow-x-auto">
              <div className="min-w-[900px] overflow-hidden rounded-lg border border-gray-200 dark:border-gray-800">
                <div className="grid grid-cols-[230px_1fr] border-b border-gray-200 bg-gray-50 text-xs font-semibold uppercase text-gray-500 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-400">
                  <div className="border-r border-gray-200 px-3 py-3 dark:border-gray-800">Job</div>
                  <div className="relative h-11">
                    {monthSegments.map((segment) => (
                      <div
                        key={segment.label}
                        className="absolute top-0 flex h-full items-center justify-center border-l border-gray-200 first:border-l-0 dark:border-gray-800"
                        style={{ left: `${segment.left}%`, width: `${segment.width}%` }}
                      >
                        {segment.label}
                      </div>
                    ))}
                  </div>
                </div>

                {visibleCalendarJobs.length === 0 ? (
                  <div className="p-8 text-center text-sm text-gray-500 dark:text-gray-400">No jobs in this view.</div>
                ) : (
                  <div className="divide-y divide-gray-200 dark:divide-gray-800">
                    {visibleCalendarJobs.map((job) => (
                      <div
                        key={job.id}
                        className={cn(
                          'grid min-h-14 grid-cols-[230px_1fr] bg-white dark:bg-dark-150',
                          job.status === 'dropped' && 'bg-gray-50 text-gray-500 dark:bg-gray-900/60 dark:text-gray-500',
                        )}
                      >
                        <button
                          type="button"
                          onClick={() => setSelectedJobId(job.id)}
                          className={cn(
                            'min-w-0 border-r border-gray-200 px-3 py-2 text-left hover:bg-gray-50 dark:border-gray-800 dark:hover:bg-gray-900',
                            selectedJob?.id === job.id && 'bg-orange-50 dark:bg-orange-950/20',
                          )}
                        >
                          <div
                            className={cn(
                              'truncate text-sm font-semibold text-gray-950 dark:text-gray-50',
                              job.status === 'dropped' && 'text-gray-500 line-through dark:text-gray-500',
                            )}
                          >
                            {job.customer}
                          </div>
                          <div className="truncate text-xs text-gray-500 dark:text-gray-400">
                            {job.dataCenterId || 'No DC ID'} · {job.location}
                          </div>
                        </button>

                        <div className="relative h-14 bg-white dark:bg-dark-150">
                          {dateTicks.map((tick) => (
                            <div
                              key={`${job.id}-${tick.label}-${tick.left}`}
                              className="absolute top-0 h-full border-l border-gray-100 dark:border-gray-800"
                              style={{ left: `${tick.left}%` }}
                            />
                          ))}
                          <button
                            type="button"
                            onClick={() => setSelectedJobId(job.id)}
                            className={cn(
                              'absolute top-2 flex h-9 min-w-7 items-center gap-1.5 overflow-hidden rounded-md px-2 text-left text-xs font-semibold text-white shadow-sm ring-1 ring-black/10',
                              selectedJob?.id === job.id && 'ring-2 ring-gray-950 dark:ring-white',
                              job.status === 'dropped' && 'text-gray-100 line-through opacity-70',
                            )}
                            style={getBarStyle(job, viewStart, viewEnd)}
                            title={`${job.customer} ${job.dataCenterId || ''} ${formatMillions(job.amount)}`}
                          >
                            <StatusIcon status={job.status} />
                            <span className="min-w-0 truncate">
                              {job.customer} · {formatMillions(job.amount)}
                            </span>
                            {!job.endDate && (
                              <span
                                className="pointer-events-none absolute inset-y-0 right-0 w-10 rounded-r-md"
                                style={{
                                  backgroundImage:
                                    'repeating-linear-gradient(135deg, rgba(255,255,255,.72) 0 4px, rgba(255,255,255,.08) 4px 8px)',
                                }}
                              />
                            )}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <aside className="rounded-lg border border-gray-200 bg-gray-50 p-4 dark:border-gray-800 dark:bg-gray-900">
              {selectedJob ? (
                <div className="flex h-full flex-col gap-4">
                  <div>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h2
                          className={cn(
                            'truncate text-lg font-semibold text-gray-950 dark:text-gray-50',
                            selectedJob.status === 'dropped' && 'text-gray-500 line-through dark:text-gray-500',
                          )}
                        >
                          {selectedJob.customer}
                        </h2>
                        <p className="mt-1 truncate text-sm text-gray-500 dark:text-gray-400">
                          {selectedJob.dataCenterId || 'No DC ID'}
                        </p>
                      </div>
                      <span
                        className={cn(
                          'inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold',
                          selectedJob.status === 'confirmed' && 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200',
                          selectedJob.status === 'expected' && 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-200',
                          selectedJob.status === 'dropped' && 'bg-gray-200 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
                        )}
                      >
                        <StatusIcon status={selectedJob.status} />
                        {statusLabels[selectedJob.status]}
                      </span>
                    </div>
                  </div>

                  <dl className="rounded-lg border border-gray-200 bg-white px-3 dark:border-gray-800 dark:bg-dark-150">
                    <DetailRow label="Location" value={selectedJob.location} />
                    <DetailRow label="Region" value={selectedJob.region} />
                    <DetailRow label="Amount" value={formatMillions(selectedJob.amount)} />
                    <DetailRow label="Start" value={formatDate(selectedJob.startDate)} />
                    <DetailRow label="End" value={formatDate(selectedJob.endDate)} />
                  </dl>

                  <div className="mt-auto flex gap-2">
                    <Button
                      variant="outline"
                      className="flex-1"
                      leftIcon={<Pencil className="h-4 w-4" />}
                      onClick={() => openEditForm(selectedJob)}
                    >
                      Edit
                    </Button>
                    <Button
                      variant="destructive"
                      className="flex-1"
                      leftIcon={<Trash2 className="h-4 w-4" />}
                      onClick={() => handleDeleteJob(selectedJob.id)}
                    >
                      Delete
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="flex h-52 items-center justify-center text-sm text-gray-500 dark:text-gray-400">
                  Select a job.
                </div>
              )}
            </aside>
          </div>
        ) : (
          <div className="overflow-x-auto p-4">
            <table className="min-w-[900px] w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-left text-xs uppercase text-gray-500 dark:border-gray-800 dark:text-gray-400">
                  {[
                    ['startDate', 'Date'],
                    ['customer', 'Customer'],
                    ['amount', 'Amount'],
                    ['region', 'Region'],
                  ].map(([key, label]) => (
                    <th key={key} className="px-3 py-3 font-semibold">
                      <button
                        type="button"
                        onClick={() => toggleSort(key as SortKey)}
                        className="inline-flex items-center gap-1 hover:text-gray-950 dark:hover:text-gray-50"
                      >
                        {label}
                        {sortKey === key && <span>{sortDirection === 'asc' ? '↑' : '↓'}</span>}
                      </button>
                    </th>
                  ))}
                  <th className="px-3 py-3 font-semibold">Data center</th>
                  <th className="px-3 py-3 font-semibold">Location</th>
                  <th className="px-3 py-3 font-semibold">Status</th>
                  <th className="px-3 py-3 font-semibold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-800">
                {sortedListJobs.map((job) => (
                  <tr
                    key={job.id}
                    className={cn(
                      'hover:bg-gray-50 dark:hover:bg-gray-900',
                      job.status === 'dropped' && 'bg-gray-50 text-gray-500 dark:bg-gray-900/60 dark:text-gray-500',
                    )}
                  >
                    <td className="whitespace-nowrap px-3 py-3">
                      {formatDate(job.startDate)} – {job.endDate ? formatDate(job.endDate) : ''}
                    </td>
                    <td
                      className={cn(
                        'px-3 py-3 font-semibold text-gray-950 dark:text-gray-50',
                        job.status === 'dropped' && 'text-gray-500 line-through dark:text-gray-500',
                      )}
                    >
                      {job.customer}
                    </td>
                    <td className="whitespace-nowrap px-3 py-3 font-semibold">{formatMillions(job.amount)}</td>
                    <td className="px-3 py-3">
                      <span className="inline-flex items-center gap-2">
                        <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: regionPalette[job.region].bg }} />
                        {job.region}
                      </span>
                    </td>
                    <td className="px-3 py-3">{job.dataCenterId || '-'}</td>
                    <td className="px-3 py-3">{job.location}</td>
                    <td className="px-3 py-3">
                      <span className="inline-flex items-center gap-1">
                        <StatusIcon status={job.status} />
                        {statusLabels[job.status]}
                      </span>
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          aria-label={`Edit ${job.customer}`}
                          onClick={() => openEditForm(job)}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-gray-200 text-gray-600 hover:bg-gray-100 hover:text-gray-950 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800 dark:hover:text-gray-50"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          aria-label={`Delete ${job.customer}`}
                          onClick={() => handleDeleteJob(job.id)}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-red-200 text-red-600 hover:bg-red-50 dark:border-red-900 dark:text-red-400 dark:hover:bg-red-950/50"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {sortedListJobs.length === 0 && (
              <div className="p-8 text-center text-sm text-gray-500 dark:text-gray-400">No jobs match these filters.</div>
            )}
          </div>
        )}
      </section>

      <Dialog open={isFormOpen} onOpenChange={setIsFormOpen}>
        <DialogContent className="w-full max-w-3xl">
          <DialogHeader>
            <DialogTitle>{editingJobId ? 'Edit job' : 'Add job'}</DialogTitle>
            <DialogDescription>Pipeline calendar block</DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-2">
            {formError && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-200">
                {formError}
              </div>
            )}

            <div className="grid gap-x-4 md:grid-cols-2">
              <Input
                label="Customer"
                value={formState.customer}
                onChange={(event) => updateFormField('customer', event.target.value)}
                required
              />
              <Input
                label="Data center ID"
                value={formState.dataCenterId}
                onChange={(event) => updateFormField('dataCenterId', event.target.value)}
              />
              <Input
                label="Location"
                value={formState.location}
                onChange={(event) => updateFormField('location', event.target.value)}
                required
              />
              <Input
                label="Amount (millions)"
                type="number"
                step="0.01"
                min="0"
                value={formState.amount}
                onChange={(event) => updateFormField('amount', event.target.value)}
                required
              />
              <Input
                label="Start date"
                type="date"
                value={formState.startDate}
                onChange={(event) => updateFormField('startDate', event.target.value)}
                required
              />
              <Input
                label="End date"
                type="date"
                value={formState.endDate}
                onChange={(event) => updateFormField('endDate', event.target.value)}
              />
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <label className="block text-sm font-medium text-dark-primary dark:text-dark-secondary">
                <span className="mb-1.5 block">Region</span>
                <select
                  value={formState.region}
                  onChange={(event) => updateFormField('region', event.target.value as PipelineRegion)}
                  className="w-full rounded-lg border-2 border-dark-accent/30 bg-white px-4 py-2.5 text-dark-primary shadow-sm focus:outline-none focus:ring-2 focus:ring-dark-accent dark:border-dark-300 dark:bg-dark-150 dark:text-dark-secondary"
                >
                  {regions.map((region) => (
                    <option key={region} value={region}>
                      {region}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block text-sm font-medium text-dark-primary dark:text-dark-secondary">
                <span className="mb-1.5 block">Status</span>
                <select
                  value={formState.status}
                  onChange={(event) => updateFormField('status', event.target.value as PipelineStatus)}
                  className="w-full rounded-lg border-2 border-dark-accent/30 bg-white px-4 py-2.5 text-dark-primary shadow-sm focus:outline-none focus:ring-2 focus:ring-dark-accent dark:border-dark-300 dark:bg-dark-150 dark:text-dark-secondary"
                >
                  {statuses.map((status) => (
                    <option key={status} value={status}>
                      {statusLabels[status]}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <DialogFooter className="pt-4">
              <Button variant="outline" type="button" onClick={() => setIsFormOpen(false)}>
                Cancel
              </Button>
              <Button type="submit">{editingJobId ? 'Save changes' : 'Add job'}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
