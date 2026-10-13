import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { AlertTriangle, ArrowLeft, Copy, Pencil, Plus, Save, Trash2 } from 'lucide-react';
import { useDemoMode } from '@/lib/DemoModeContext';
import { Button } from '@/components/ui/Button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/Dialog';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { REPORT_NAMES } from '@/components/reports/reportMappings';
import {
  contractTotal,
  fetchBilledToDate,
  fetchEstimateOptions,
  fetchPmJob,
  loadJobBundles,
  reportTypeLabel,
  saveSovLines,
  type JobBundle,
  type PmJob,
} from '@/services/pmDashboardService';
import {
  addEstimatesToLines,
  bestLineFor,
  completedPct,
  computeProgress,
  estimateOverlaps,
  estimateTotal,
  guessLineSlugs,
  lineDone,
  monthDollars,
  monthKey,
  monthLabel,
  monthRange,
  pct,
  sovHours,
  sovTotal,
  totalHours,
  type EstimateOption,
  type SovLine,
} from '@/utils/pmDashboardCalculations';
import {
  fmtHours,
  fmtMoney,
  MonthPicker,
  Notice,
  ProgressBar,
  StatTile,
  usePmAccess,
} from './shared';

const CELL_INPUT =
  'w-full rounded-none border border-neutral-300 bg-white px-2 py-1 text-sm text-neutral-900 dark:border-neutral-600 dark:bg-neutral-900 dark:text-neutral-100';
// Number boxes without the little up/down arrows
const NUMBER_INPUT = `${CELL_INPUT} text-right font-mono [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none`;

// Choice in the "Count toward" list that makes a new SOV line instead of picking one.
const NEW_LINE = '__new_line__';

// The SOV table uses its own tight cells; the shared Table is too tall for this many rows.
const TH_BASE = 'px-3 py-2 text-xs font-medium whitespace-nowrap';
const TH = `${TH_BASE} text-neutral-500 dark:text-neutral-400`;
const TH_ACTIVE = `${TH_BASE} bg-brand/10 text-neutral-900 dark:text-neutral-100`;
const TD = 'px-3 py-2 align-middle';
const NUM = `${TD} text-right tabular-nums whitespace-nowrap`;
const NUM_ACTIVE = `${NUM} bg-brand/10`;
const ROW = 'border-t border-neutral-200 dark:border-neutral-700';

/** A count with zeros faded, so the months that had work stand out. */
function Count({ value }: { value: number }) {
  if (value === 0) return <span className="text-neutral-400 dark:text-neutral-500">0</span>;
  return <>{value.toLocaleString('en-US')}</>;
}

const parseNumber = (value: string): number => {
  const n = parseFloat(value);
  return Number.isFinite(n) && n >= 0 ? n : 0;
};

export default function PMJobDetail() {
  const { jobId } = useParams<{ jobId: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const access = usePmAccess();
  const { maskJobTitle, maskCustomerName } = useDemoMode();

  const thisMonth = monthKey(new Date());
  const month = searchParams.get('month') ?? thisMonth;
  const setMonth = (m: string) =>
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.set('month', m);
        return next;
      },
      { replace: true },
    );

  const [job, setJob] = useState<PmJob | null>(null);
  const [bundle, setBundle] = useState<JobBundle | null>(null);
  const [lines, setLines] = useState<SovLine[]>([]);
  const [billed, setBilled] = useState<number | null>(null);
  const [setupMissing, setSetupMissing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [editing, setEditing] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const [pickerLineId, setPickerLineId] = useState<string | null>(null);
  const [showAllTypes, setShowAllTypes] = useState(false);
  const [typeSearch, setTypeSearch] = useState('');

  const [estimates, setEstimates] = useState<EstimateOption[]>([]);
  const [estimatePickerOpen, setEstimatePickerOpen] = useState(false);
  const [pickedEstimateIds, setPickedEstimateIds] = useState<string[]>([]);

  const load = useCallback(async () => {
    if (!jobId) return;
    setLoading(true);
    setError(null);
    try {
      const loaded = await fetchPmJob(jobId);
      if (!loaded) {
        setError('Job not found.');
        return;
      }
      const [result, options] = await Promise.all([
        loadJobBundles([loaded]),
        // If the estimates will not load, the rest of the page still should.
        fetchEstimateOptions(loaded).catch((err) => {
          console.error('[PM Dashboard] Estimates failed to load:', err);
          return [] as EstimateOption[];
        }),
      ]);
      setEstimates(options);
      setJob(loaded);
      setBundle(result.bundles[loaded.id]);
      setLines(result.bundles[loaded.id].lines);
      setSetupMissing(result.setupMissing);
      setDirty(false);
      setEditing(false);
    } catch (err) {
      console.error('[PM Dashboard] Job load failed:', err);
      setError(err instanceof Error ? err.message : 'Failed to load the job.');
    } finally {
      setLoading(false);
    }
  }, [jobId]);

  useEffect(() => {
    if (access.loading || !access.allowed) return;
    void load();
  }, [access.loading, access.allowed, load]);

  const qboId = job?.quickbooks_project_id ?? null;
  useEffect(() => {
    if (!qboId) return;
    let alive = true;
    setBilled(null);
    void fetchBilledToDate(qboId)
      .catch(() => 0)
      .then((amount) => alive && setBilled(amount));
    return () => {
      alive = false;
    };
  }, [qboId]);

  const reports = bundle?.reports ?? [];
  const hoursByMonth = bundle?.hoursByMonth ?? {};

  const progress = useMemo(() => computeProgress(lines, reports), [lines, reports]);

  /** report type -> how many of this job's reports of that type have been sent */
  const sentByType = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const r of reports) counts[r.slug] = (counts[r.slug] ?? 0) + 1;
    return counts;
  }, [reports]);

  // One column per month from the first activity through the latest.
  const months = useMemo(() => {
    const active = [
      ...reports.map((r) => monthKey(r.sent_at)),
      ...Object.keys(hoursByMonth),
      month,
      thisMonth,
    ].sort();
    return monthRange(active[0], active[active.length - 1]);
  }, [reports, hoursByMonth, month, thisMonth]);

  const markChanged = (next: SovLine[]) => {
    setLines(next);
    setDirty(true);
    setSaveError(null);
  };

  const updateLine = (id: string, patch: Partial<SovLine>) =>
    markChanged(lines.map((line) => (line.id === id ? { ...line, ...patch } : line)));

  const newLine = (patch: Partial<SovLine> = {}): SovLine => ({
    id: crypto.randomUUID(),
    job_id: job?.id ?? '',
    sort_order: lines.length,
    item: '',
    quantity: 0,
    total_hours: 0,
    unit_price: 0,
    report_slugs: [],
    source_estimate_ids: [],
    ...patch,
  });

  const addLine = () => markChanged([...lines, newLine()]);

  /** A line named after a report type, already counting that type. Qty and $ are left to the PM. */
  const lineForType = (slug: string) => newLine({ item: reportTypeLabel(slug), report_slugs: [slug] });

  const assignUnmatched = (slug: string, target: string) => {
    if (target === NEW_LINE) markChanged([...lines, lineForType(slug)]);
    else if (target) toggleSlug(target, slug);
  };

  /** A report type counts toward one line only, so adding it here takes it off the others. */
  const toggleSlug = (lineId: string, slug: string) =>
    markChanged(
      lines.map((line) => {
        const has = line.report_slugs.includes(slug);
        if (line.id === lineId) {
          return {
            ...line,
            report_slugs: has ? line.report_slugs.filter((s) => s !== slug) : [...line.report_slugs, slug],
          };
        }
        return has ? { ...line, report_slugs: line.report_slugs.filter((s) => s !== slug) } : line;
      }),
    );

  /** Estimates already copied into the SOV, so the picker does not offer them twice. */
  const usedEstimateIds = new Set(lines.flatMap((line) => line.source_estimate_ids));

  const openEstimatePicker = () => {
    setPickedEstimateIds(
      estimates.filter((e) => e.rows.length > 0 && !usedEstimateIds.has(e.id)).map((e) => e.id),
    );
    setEstimatePickerOpen(true);
  };

  const togglePickedEstimate = (id: string) =>
    setPickedEstimateIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  /** Adds the ticked estimates' rows to the SOV. Not saved until the PM hits Save. */
  const addPickedEstimates = () => {
    if (!job) return;
    const picked = estimates.filter((e) => pickedEstimateIds.includes(e.id));
    markChanged(
      guessLineSlugs(
        addEstimatesToLines(job.id, lines, picked, () => crypto.randomUUID()),
        Object.keys(sentByType),
      ),
    );
    setEstimatePickerOpen(false);
  };

  const closePicker = () => {
    setPickerLineId(null);
    setShowAllTypes(false);
    setTypeSearch('');
  };

  const discard = () => {
    setLines(bundle?.lines ?? []);
    setDirty(false);
    setEditing(false);
    setSaveError(null);
  };

  const save = async () => {
    if (!job || !bundle) return;
    setSaving(true);
    setSaveError(null);
    try {
      await saveSovLines(job.id, lines);
      setBundle({ ...bundle, lines, seeded: false });
      setDirty(false);
      setEditing(false);
    } catch (err) {
      console.error('[PM Dashboard] SOV save failed:', err);
      setSaveError(err instanceof Error ? err.message : 'Could not save the SOV.');
    } finally {
      setSaving(false);
    }
  };

  if (access.loading || (access.allowed && loading)) {
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

  const backToList = () =>
    navigate(`/pm-dashboard?month=${month}${job?.division ? `&division=${job.division}` : ''}`);

  if (error || !job || !bundle) {
    return (
      <div className="mx-auto max-w-7xl space-y-4 p-6">
        <Button variant="ghost" size="sm" leftIcon={<ArrowLeft className="h-4 w-4" />} onClick={backToList}>
          All jobs
        </Button>
        <div className="flex items-start gap-3 rounded-none border border-red-200 bg-red-50 p-4 dark:border-red-800 dark:bg-red-950">
          <AlertTriangle className="mt-0.5 h-5 w-5 flex-shrink-0 text-red-600" />
          <p className="text-sm text-red-700 dark:text-red-300">{error ?? 'Job not found.'}</p>
        </div>
      </div>
    );
  }

  const monthName = monthLabel(month, 'long');
  const contract = contractTotal(bundle, lines);
  const estimatedHours = sovHours(lines) || job.estimated_man_hours || 0;
  const usedHours = totalHours(hoursByMonth);
  const unmatched = Object.entries(progress.unmatched).sort((a, b) => b[1] - a[1]);

  // The contract value only says something about the SOV when it comes from the quote.
  const sovDollars = sovTotal(lines);
  const sovGap = bundle.quotedAmount > 0 ? contract - sovDollars : 0;
  const sovGapMatters = Math.abs(sovGap) > contract * 0.01;

  const pickedEstimates = estimates.filter((e) => pickedEstimateIds.includes(e.id));
  const pickedTotal = pickedEstimates.reduce((sum, e) => sum + estimateTotal(e), 0);
  // The SOV as it stands counts as one more sheet: adding an item it already has doubles it too.
  const overlaps = estimateOverlaps([
    {
      id: 'sov',
      title: 'SOV now',
      updated_at: '',
      status: null,
      rows: lines.map((line) => ({
        item: line.item,
        quantity: line.quantity,
        unitHours: 0,
        unitPrice: line.unit_price,
      })),
    },
    ...pickedEstimates,
  ]);

  const pickerLine = lines.find((line) => line.id === pickerLineId) ?? null;
  const search = typeSearch.trim().toLowerCase();
  const pickerTypes = pickerLine
    ? [
        ...new Set([
          ...Object.keys(sentByType),
          ...lines.flatMap((line) => line.report_slugs),
          ...(showAllTypes ? Object.keys(REPORT_NAMES) : []),
        ]),
      ]
        .filter((slug) => !search || reportTypeLabel(slug).toLowerCase().includes(search))
        .sort((a, b) => (sentByType[b] ?? 0) - (sentByType[a] ?? 0) || reportTypeLabel(a).localeCompare(reportTypeLabel(b)))
    : [];

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Button variant="ghost" size="sm" leftIcon={<ArrowLeft className="h-4 w-4" />} onClick={backToList}>
            All jobs
          </Button>
          <h1 className="mt-2 text-2xl font-semibold text-neutral-900 dark:text-neutral-100">
            {job.job_number ? `${job.job_number} ` : ''}
            {maskJobTitle(job.title) || 'Untitled job'}
          </h1>
          <p className="text-sm text-neutral-500 dark:text-neutral-400">{maskCustomerName(job.customer_name)}</p>
        </div>
        <MonthPicker month={month} onChange={setMonth} />
      </div>

      {setupMissing && (
        <Notice>
          Database setup has not been run. Hours stay empty and the SOV cannot be saved until
          database/migrations/pm_dashboard.sql is run.
        </Notice>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          label={`$ earned in ${monthName}`}
          value={fmtMoney(monthDollars(lines, progress, month))}
          note="Reports sent this month times $ each"
        />
        <StatTile
          label={`Hours worked in ${monthName}`}
          value={fmtHours(hoursByMonth[month] ?? 0)}
          note="From the TimeStAMP clock"
        />
        <StatTile
          label="Contract value"
          value={fmtMoney(contract)}
          note={
            bundle.approvedChangeOrders
              ? `Includes ${fmtMoney(bundle.approvedChangeOrders)} in approved change orders`
              : undefined
          }
        />
        <StatTile
          label="Billed to date"
          value={!qboId ? 'n/a' : billed == null ? '...' : fmtMoney(billed)}
          note={qboId ? 'QuickBooks invoices' : 'Job is not linked to QuickBooks'}
        />
      </div>

      <div className="grid grid-cols-1 gap-6 rounded-none border border-neutral-200 bg-white p-4 dark:border-neutral-700 dark:bg-neutral-800 lg:grid-cols-3">
        <ProgressBar
          label="Billed"
          value={qboId && billed != null ? pct(billed, contract) : null}
          detail={
            !qboId
              ? 'Job is not linked to QuickBooks'
              : billed == null
                ? 'Checking QuickBooks...'
                : contract > 0
                  ? `${fmtMoney(billed)} invoiced in QuickBooks of ${fmtMoney(contract)} contract`
                  : `${fmtMoney(billed)} invoiced in QuickBooks. No contract value yet: fill in Qty and $ each below.`
          }
        />
        <ProgressBar
          label="Job completed"
          value={completedPct(lines, progress)}
          detail={
            sovTotal(lines) > 0
              ? 'Reports sent to the customer, weighted by $ each'
              : 'Fill in Qty and $ each on the SOV lines below to see this.'
          }
        />
        <ProgressBar
          label="Hours used"
          value={pct(usedHours, estimatedHours)}
          over={estimatedHours > 0 && usedHours > estimatedHours}
          detail={
            estimatedHours > 0
              ? `${fmtHours(usedHours)} worked of ${fmtHours(estimatedHours)} estimated`
              : `${fmtHours(usedHours)} worked. Fill in Hours on the SOV lines below to compare.`
          }
        />
      </div>

      <div className="space-y-3 rounded-none border border-neutral-200 bg-white p-4 dark:border-neutral-700 dark:bg-neutral-800">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100">Schedule of values</h2>
          <div className="flex flex-wrap items-center gap-2">
            {dirty && <span className="text-xs text-amber-700 dark:text-amber-300">Unsaved changes</span>}
            {estimates.length > 0 && (
              <Button
                variant="outline"
                size="sm"
                leftIcon={<Copy className="h-4 w-4" />}
                onClick={openEstimatePicker}
              >
                Copy from estimate
              </Button>
            )}
            {editing && (
              <Button variant="outline" size="sm" leftIcon={<Plus className="h-4 w-4" />} onClick={addLine}>
                Add line
              </Button>
            )}
            {!editing && (
              <Button
                variant="outline"
                size="sm"
                leftIcon={<Pencil className="h-4 w-4" />}
                onClick={() => setEditing(true)}
              >
                Edit SOV
              </Button>
            )}
            {(dirty || editing) && (
              <Button variant="ghost" size="sm" onClick={discard} disabled={saving}>
                {dirty ? 'Discard' : 'Done'}
              </Button>
            )}
            {(dirty || (bundle.seeded && lines.length > 0)) && (
              <Button
                size="sm"
                leftIcon={<Save className="h-4 w-4" />}
                onClick={save}
                isLoading={saving}
                disabled={setupMissing}
              >
                Save
              </Button>
            )}
          </div>
        </div>

        {bundle.seeded && lines.length > 0 && !dirty && (
          <Notice>
            Copied from the estimate and not saved yet. Check the lines and which reports count, then
            Save to keep this SOV for the job.
          </Notice>
        )}
        {saveError && (
          <div className="rounded-none border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300">
            {saveError}
          </div>
        )}

        {unmatched.length > 0 && (
          <Notice>
            <p className="font-medium">Sent reports not counted toward any line:</p>
            <ul className="mt-1 space-y-1">
              {unmatched.map(([slug, count]) => {
                const suggested = bestLineFor(lines, slug);
                return (
                  <li key={slug} className="flex flex-wrap items-center gap-2">
                    <span>
                      {reportTypeLabel(slug)} ({count})
                    </span>
                    <select
                      aria-label={`Count ${reportTypeLabel(slug)} toward`}
                      value=""
                      onChange={(e) => assignUnmatched(slug, e.target.value)}
                      className="rounded-none border border-neutral-300 bg-white px-2 py-1 text-sm text-neutral-900 dark:border-neutral-600 dark:bg-neutral-900 dark:text-neutral-100"
                    >
                      <option value="">Count toward...</option>
                      {lines.map((line) => (
                        <option key={line.id} value={line.id}>
                          {line.item || 'Unnamed line'}
                          {line.id === suggested?.id ? ' (best guess)' : ''}
                        </option>
                      ))}
                      <option value={NEW_LINE}>New SOV line</option>
                    </select>
                  </li>
                );
              })}
            </ul>
            {unmatched.length > 1 && (
              <Button
                variant="outline"
                size="sm"
                className="mt-2"
                leftIcon={<Plus className="h-4 w-4" />}
                onClick={() => markChanged([...lines, ...unmatched.map(([slug]) => lineForType(slug))])}
              >
                Make a line for each
              </Button>
            )}
          </Notice>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-sm text-neutral-900 dark:text-neutral-100">
            <thead>
              <tr>
                <th className={`${TH} min-w-[14rem] text-left`}>Item</th>
                <th className={`${TH} text-right`}>Qty</th>
                <th className={`${TH} text-right`}>Hours</th>
                <th className={`${TH} text-right`}>$ each</th>
                {months.map((m) => (
                  <th
                    key={m}
                    className={`${m === month ? TH_ACTIVE : TH} cursor-pointer text-right`}
                    onClick={() => setMonth(m)}
                  >
                    {monthLabel(m)}
                  </th>
                ))}
                <th className={`${TH} text-right`}>Done</th>
                <th className={`${TH} text-left`}>Reports</th>
                {editing && <th className={TH} />}
              </tr>
            </thead>
            <tbody>
              {lines.length === 0 && (
                <tr className={ROW}>
                  <td
                    colSpan={6 + months.length + (editing ? 1 : 0)}
                    className="px-3 py-6 text-center text-neutral-500 dark:text-neutral-400"
                  >
                    {estimates.length > 1
                      ? `This job's quote has ${estimates.length} estimates. Use Copy from estimate to pick the ones that apply.`
                      : estimates.length === 1
                        ? 'No SOV lines. Use Copy from estimate, or Edit SOV to add lines by hand.'
                        : 'No SOV lines. This job has no estimate to copy from. Use Edit SOV to add lines.'}
                  </td>
                </tr>
              )}
              {lines.map((line) => {
                const done = lineDone(progress, line.id);
                return (
                  <tr key={line.id} className={`${ROW} hover:bg-neutral-50 dark:hover:bg-neutral-700/40`}>
                    <td className={TD}>
                      {editing ? (
                        <input
                          aria-label="Item"
                          className={CELL_INPUT}
                          value={line.item}
                          onChange={(e) => updateLine(line.id, { item: e.target.value })}
                        />
                      ) : (
                        line.item || 'Unnamed line'
                      )}
                    </td>
                    <td className={NUM}>
                      {editing ? (
                        <input
                          aria-label="Quantity"
                          type="number"
                          min={0}
                          className={`${NUMBER_INPUT} min-w-[5rem]`}
                          value={line.quantity}
                          onChange={(e) => updateLine(line.id, { quantity: parseNumber(e.target.value) })}
                        />
                      ) : (
                        <Count value={line.quantity} />
                      )}
                    </td>
                    <td className={NUM}>
                      {editing ? (
                        <input
                          aria-label="Total hours"
                          type="number"
                          min={0}
                          className={`${NUMBER_INPUT} min-w-[5rem]`}
                          value={line.total_hours}
                          onChange={(e) => updateLine(line.id, { total_hours: parseNumber(e.target.value) })}
                        />
                      ) : (
                        fmtHours(line.total_hours)
                      )}
                    </td>
                    <td className={NUM}>
                      {editing ? (
                        <input
                          aria-label="Dollars each"
                          type="number"
                          min={0}
                          className={`${NUMBER_INPUT} min-w-[6rem]`}
                          value={line.unit_price}
                          onChange={(e) => updateLine(line.id, { unit_price: parseNumber(e.target.value) })}
                        />
                      ) : (
                        fmtMoney(line.unit_price)
                      )}
                    </td>
                    {months.map((m) => (
                      <td key={m} className={m === month ? NUM_ACTIVE : NUM}>
                        <Count value={progress.qty[line.id]?.[m] ?? 0} />
                      </td>
                    ))}
                    <td className={NUM}>
                      {done.toLocaleString('en-US')}
                      {line.quantity > 0 && (
                        <span className="text-neutral-500 dark:text-neutral-400">
                          {' '}
                          / {line.quantity.toLocaleString('en-US')}
                        </span>
                      )}
                    </td>
                    <td className={TD}>
                      <button
                        type="button"
                        onClick={() => setPickerLineId(line.id)}
                        className="whitespace-nowrap text-neutral-700 underline decoration-neutral-300 underline-offset-4 hover:text-neutral-900 dark:text-neutral-300 dark:decoration-neutral-600 dark:hover:text-neutral-100"
                      >
                        {line.report_slugs.length === 0
                          ? 'None'
                          : `${line.report_slugs.length} type${line.report_slugs.length === 1 ? '' : 's'}`}
                      </button>
                    </td>
                    {editing && (
                      <td className="px-1 py-1 text-right">
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={`Remove ${line.item || 'line'}`}
                          onClick={() => markChanged(lines.filter((l) => l.id !== line.id))}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </td>
                    )}
                  </tr>
                );
              })}
              {lines.length > 0 && (
                <tr className="border-t-2 border-neutral-300 font-semibold dark:border-neutral-600">
                  <td className={TD}>Total $</td>
                  <td />
                  <td className={NUM}>{fmtHours(sovHours(lines))}</td>
                  <td className={NUM}>{fmtMoney(sovTotal(lines))}</td>
                  {months.map((m) => (
                    <td key={m} className={m === month ? NUM_ACTIVE : NUM}>
                      {fmtMoney(monthDollars(lines, progress, m))}
                    </td>
                  ))}
                  <td />
                  <td />
                  {editing && <td />}
                </tr>
              )}
              <tr className={`${ROW} text-neutral-500 dark:text-neutral-400`}>
                <td colSpan={4} className={TD}>
                  Hours worked
                </td>
                {months.map((m) => (
                  <td key={m} className={m === month ? NUM_ACTIVE : NUM}>
                    {fmtHours(hoursByMonth[m] ?? 0)}
                  </td>
                ))}
                <td className={NUM}>{fmtHours(usedHours)}</td>
                <td />
                {editing && <td />}
              </tr>
            </tbody>
          </table>
        </div>

        {lines.length > 0 && bundle.quotedAmount > 0 && (
          <p
            className={`text-xs ${
              sovGapMatters ? 'text-amber-700 dark:text-amber-300' : 'text-neutral-500 dark:text-neutral-400'
            }`}
          >
            SOV adds up to {fmtMoney(sovDollars)}. Contract is {fmtMoney(contract)}.
            {sovGapMatters && sovGap > 0 && ` ${fmtMoney(sovGap)} is not on the SOV yet.`}
            {sovGapMatters && sovGap < 0 && ` SOV is ${fmtMoney(-sovGap)} over the contract.`}
          </p>
        )}
      </div>

      <Dialog
        open={!!pickerLine}
        onOpenChange={(open) => {
          if (!open) closePicker();
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reports that count toward {pickerLine?.item || 'this line'}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-neutral-600 dark:text-neutral-300">
            Each sent report of a checked type counts as one finished unit. A type can count toward one
            line only.
          </p>
          <input
            aria-label="Search report types"
            placeholder="Search report types"
            className={CELL_INPUT}
            value={typeSearch}
            onChange={(e) => setTypeSearch(e.target.value)}
          />
          <div className="max-h-[50vh] space-y-1 overflow-y-auto">
            {pickerTypes.length === 0 && (
              <p className="text-sm text-neutral-500 dark:text-neutral-400">
                No reports have been sent on this job yet. Show all report types to pick ahead of time.
              </p>
            )}
            {pickerLine &&
              pickerTypes.map((slug) => {
                const owner = lines.find((line) => line.report_slugs.includes(slug));
                return (
                  <label
                    key={slug}
                    className="flex cursor-pointer items-start gap-2 p-1 text-sm text-neutral-900 hover:bg-neutral-50 dark:text-neutral-100 dark:hover:bg-neutral-700/40"
                  >
                    <input
                      type="checkbox"
                      className="mt-0.5 rounded-none accent-brand"
                      checked={owner?.id === pickerLine.id}
                      onChange={() => toggleSlug(pickerLine.id, slug)}
                    />
                    <span className="flex-1">
                      {reportTypeLabel(slug)}
                      {owner && owner.id !== pickerLine.id && (
                        <span className="ml-2 text-xs text-neutral-500 dark:text-neutral-400">
                          now on {owner.item || 'another line'}
                        </span>
                      )}
                    </span>
                    <span className="font-mono text-xs text-neutral-500 dark:text-neutral-400">
                      {sentByType[slug] ?? 0} sent
                    </span>
                  </label>
                );
              })}
          </div>
          <div className="flex items-center justify-between gap-2">
            <Button variant="link" size="sm" onClick={() => setShowAllTypes((v) => !v)}>
              {showAllTypes ? 'Show only types on this job' : 'Show all report types'}
            </Button>
            <Button size="sm" onClick={closePicker}>
              Done
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={estimatePickerOpen} onOpenChange={setEstimatePickerOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Copy from estimate</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-neutral-600 dark:text-neutral-300">
            Tick the estimates that make up this job. Their rows are added to the SOV, and rows with
            the same name combine. Nothing is saved until you hit Save.
          </p>
          <div className="max-h-[45vh] space-y-1 overflow-y-auto">
            {estimates.map((estimate) => {
              const empty = estimate.rows.length === 0;
              const preview = estimate.rows
                .map((row) => `${row.item || 'Unnamed'} ×${row.quantity.toLocaleString('en-US')}`)
                .join(', ');
              return (
                <label
                  key={estimate.id}
                  className={`flex items-start gap-2 p-2 text-sm ${
                    empty
                      ? 'opacity-60'
                      : 'cursor-pointer hover:bg-neutral-50 dark:hover:bg-neutral-700/40'
                  }`}
                >
                  <input
                    type="checkbox"
                    className="mt-0.5 rounded-none accent-brand"
                    disabled={empty}
                    checked={pickedEstimateIds.includes(estimate.id)}
                    onChange={() => togglePickedEstimate(estimate.id)}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="font-medium text-neutral-900 dark:text-neutral-100">
                      {estimate.title}
                    </span>
                    {usedEstimateIds.has(estimate.id) && (
                      <span className="ml-2 text-xs text-amber-700 dark:text-amber-300">
                        already in the SOV
                      </span>
                    )}
                    <span className="block text-xs text-neutral-500 dark:text-neutral-400">
                      {new Date(estimate.updated_at).toLocaleDateString(undefined, {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                      })}
                      {estimate.status && ` · ${estimate.status.replace(/_/g, ' ')}`}
                      {empty && ' · no line items'}
                    </span>
                    {!empty && (
                      <span
                        className="block truncate text-xs text-neutral-500 dark:text-neutral-400"
                        title={preview}
                      >
                        {preview}
                      </span>
                    )}
                  </span>
                  <span className="whitespace-nowrap tabular-nums text-neutral-900 dark:text-neutral-100">
                    {fmtMoney(estimateTotal(estimate))}
                  </span>
                </label>
              );
            })}
          </div>
          {overlaps.length > 0 && (
            <Notice>
              <p className="font-medium">Same item in more than one place. Check it is not counted twice:</p>
              <ul className="mt-1 space-y-0.5">
                {overlaps.map((overlap) => (
                  <li key={overlap.item}>
                    {overlap.item}:{' '}
                    {overlap.parts.map((part) => part.quantity.toLocaleString('en-US')).join(' + ')} ={' '}
                    {overlap.total.toLocaleString('en-US')}
                  </li>
                ))}
              </ul>
            </Notice>
          )}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-neutral-600 dark:text-neutral-300">
              Adding {fmtMoney(pickedTotal)}. SOV would be {fmtMoney(sovDollars + pickedTotal)}
              {bundle.quotedAmount > 0 && ` of ${fmtMoney(contract)} contract`}.
            </p>
            <div className="flex gap-2">
              <Button variant="ghost" size="sm" onClick={() => setEstimatePickerOpen(false)}>
                Cancel
              </Button>
              <Button size="sm" onClick={addPickedEstimates} disabled={pickedEstimates.length === 0}>
                Add to SOV
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
