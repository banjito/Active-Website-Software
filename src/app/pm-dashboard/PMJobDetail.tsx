import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { AlertTriangle, ArrowLeft, Check, ChevronDown, ChevronLeft, ChevronRight, Copy, Pencil, Plus, Printer, Save, Settings, Trash2 } from 'lucide-react';
import { useAuth } from '@/lib/AuthContext';
import { useDemoMode } from '@/lib/DemoModeContext';
import { usePageTitle } from '@/hooks/usePageTitle';
import { Button } from '@/components/ui/Button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/Dialog';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { REPORT_NAMES } from '@/components/reports/reportMappings';
import { formatChangeOrderNumber } from '@/services/changeOrderService';
import {
  contractTotal,
  DEFAULT_SOV_SETTINGS,
  fetchBilledToDate,
  fetchEstimateOptions,
  fetchPmJob,
  fetchHoursByWeek,
  fetchSovSettings,
  loadJobBundles,
  reopenSovWeek,
  saveSovWeek,
  reportTypeLabel,
  saveSovLines,
  saveSovSettings,
  type BillingFrequency,
  type JobBundle,
  type PmJob,
  type SovChangeOrder,
  type SovSettings,
} from '@/services/pmDashboardService';
import {
  addEstimatesToLines,
  applyGeneralConditions,
  bestLineFor,
  completedPct,
  estimateOverlaps,
  estimateTotal,
  guessLineSlugs,
  isOriginalLine,
  lineDone,
  linesComplete,
  mergedProgress,
  monthDollars,
  monthKey,
  monthLabel,
  monthRange,
  pct,
  shiftMonth,
  shiftWeekKey,
  sovHours,
  sovTotal,
  totalHours,
  weekKey,
  weeklyQuantities,
  weekMonth,
  weekRangeLabel,
  type EstimateOption,
  type GeneralConditions,
  type SovLine,
} from '@/utils/pmDashboardCalculations';
import {
  fmtHours,
  fmtMoney,
  MonthPicker,
  Notice,
  fmtPct,
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

type JobTab = 'week' | 'sov' | 'month';

const fmtCount = (n: number): string => n.toLocaleString('en-US', { maximumFractionDigits: 2 });

/** Thin progress bar. Capped at full; `over` turns it red. */
function Bar({ value, over }: { value: number | null | undefined; over?: boolean }) {
  return (
    <div className="h-1.5 w-full bg-neutral-200 dark:bg-neutral-700" aria-hidden="true">
      <div
        className={`h-full ${over ? 'bg-red-600' : 'bg-brand'}`}
        style={{ width: `${Math.min(1, Math.max(0, value ?? 0)) * 100}%` }}
      />
    </div>
  );
}

const CHIP =
  'inline-flex items-center gap-1 whitespace-nowrap rounded-none border border-neutral-300 bg-white px-2 py-1 text-xs text-neutral-800 hover:border-neutral-500 dark:border-neutral-600 dark:bg-neutral-900 dark:text-neutral-200 dark:hover:border-neutral-400';
const SEG_BASE = 'rounded-none px-3 py-1.5 text-sm';
const SEG_ON = `${SEG_BASE} bg-neutral-800 text-white dark:bg-neutral-200 dark:text-neutral-900`;
const SEG_OFF = `${SEG_BASE} bg-white text-neutral-700 hover:bg-neutral-100 dark:bg-neutral-800 dark:text-neutral-300 dark:hover:bg-neutral-700`;

/** A count with zeros faded, so the months that had work stand out. */
function Count({ value }: { value: number }) {
  if (value === 0) return <span className="text-neutral-400 dark:text-neutral-500">0</span>;
  return <>{value.toLocaleString('en-US')}</>;
}

const parseNumber = (value: string): number => {
  const n = parseFloat(value);
  return Number.isFinite(n) && n >= 0 ? n : 0;
};

// How many month columns the SOV table shows, ending at the picked month.
// Saved per person in this browser.
const MONTH_COUNT_OPTIONS = [1, 3, 6, 12];
const DEFAULT_MONTH_COUNT = 3;
const monthCountKey = (userId: string) => `pm-dashboard:sov-month-count:${userId}`;

function readMonthCount(userId: string | undefined): number {
  if (!userId) return DEFAULT_MONTH_COUNT;
  try {
    const saved = Number(localStorage.getItem(monthCountKey(userId)));
    return MONTH_COUNT_OPTIONS.includes(saved) ? saved : DEFAULT_MONTH_COUNT;
  } catch {
    return DEFAULT_MONTH_COUNT;
  }
}

const fmtDay = (ymd: string) => {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
};

const gcFromSettings = (s: SovSettings | null): GeneralConditions | null =>
  s && (s.gc_monthly ?? 0) > 0 && (s.gc_months ?? 0) > 0
    ? { monthly: s.gc_monthly!, months: s.gc_months!, fromPrice: s.gc_from_price }
    : null;

export default function PMJobDetail() {
  const { jobId } = useParams<{ jobId: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const access = usePmAccess();
  const { maskJobTitle, maskCustomerName } = useDemoMode();
  const { user } = useAuth();
  const [monthCount, setMonthCount] = useState(() => readMonthCount(user?.id));

  useEffect(() => {
    setMonthCount(readMonthCount(user?.id));
  }, [user?.id]);

  const changeMonthCount = (n: number) => {
    setMonthCount(n);
    if (!user?.id) return;
    try {
      localStorage.setItem(monthCountKey(user.id), String(n));
    } catch {
      // Private window or blocked storage: the choice just won't stick
    }
  };

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
  usePageTitle(
    job
      ? [job.job_number, maskJobTitle(job.title)].filter(Boolean).join(' - ')
      : null,
  );
  const [bundle, setBundle] = useState<JobBundle | null>(null);
  const [lines, setLines] = useState<SovLine[]>([]);
  const [billed, setBilled] = useState<number | null>(null);
  const [setupMissing, setSetupMissing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const [pickerLineId, setPickerLineId] = useState<string | null>(null);
  const [showAllTypes, setShowAllTypes] = useState(false);
  const [typeSearch, setTypeSearch] = useState('');

  const [estimates, setEstimates] = useState<EstimateOption[]>([]);
  const [estimatePickerOpen, setEstimatePickerOpen] = useState(false);
  const [pickedEstimateIds, setPickedEstimateIds] = useState<string[]>([]);
  // Reserve blocks: how many times the picked estimates repeat
  const [estimateTimes, setEstimateTimes] = useState(1);
  // Billing frequency and general conditions. null = sov_setup.sql not run yet.
  const [settings, setSettings] = useState<SovSettings | null>(null);
  const [savedSettings, setSavedSettings] = useState<SovSettings | null>(null);
  // General conditions currently reflected in the lines (saved or just applied)
  const [appliedGc, setAppliedGc] = useState<GeneralConditions | null>(null);
  const [gcDraft, setGcDraft] = useState({ monthly: '', months: '', start: '', fromPrice: true });
  const [setupOpen, setSetupOpen] = useState(false);
  // Weekly update (item 9): defaults to last week, the one due on Monday
  const lastWeek = shiftWeekKey(weekKey(new Date()), -1);
  const [week, setWeek] = useState(lastWeek);
  const [weekDraft, setWeekDraft] = useState<Record<string, string>>({});
  const [weekSaving, setWeekSaving] = useState(false);
  const [hoursByWeek, setHoursByWeek] = useState<Record<string, number>>({});
  const [billingDraft, setBillingDraft] = useState<BillingFrequency>('monthly');
  // Change Order groups the PM opened or closed. Untouched: open until every line is done.
  const [openCos, setOpenCos] = useState<Record<string, boolean>>({});
  // Billing by month: units instead of dollars
  const [monthUnits, setMonthUnits] = useState(false);

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
      const [result, options, sovSettings] = await Promise.all([
        loadJobBundles([loaded]),
        // If the estimates will not load, the rest of the page still should.
        fetchEstimateOptions(loaded).catch((err) => {
          console.error('[PM Dashboard] Estimates failed to load:', err);
          return [] as EstimateOption[];
        }),
        fetchSovSettings(loaded.id).catch((err) => {
          console.error('[PM Dashboard] SOV settings failed to load:', err);
          return null;
        }),
      ]);
      setEstimates(options);
      fetchHoursByWeek(loaded.id)
        .then(setHoursByWeek)
        .catch((err) => console.error('[PM Dashboard] Weekly hours failed to load:', err));
      setSettings(sovSettings);
      setSavedSettings(sovSettings);
      setAppliedGc(gcFromSettings(sovSettings));
      setGcDraft({
        monthly: sovSettings?.gc_monthly ? String(sovSettings.gc_monthly) : '',
        months: sovSettings?.gc_months ? String(sovSettings.gc_months) : '',
        start: sovSettings?.gc_start ?? loaded.start_date ?? '',
        fromPrice: sovSettings?.gc_from_price ?? true,
      });
      setJob(loaded);
      setBundle(result.bundles[loaded.id]);
      setLines(result.bundles[loaded.id].lines);
      setSetupMissing(result.setupMissing);
      setDirty(false);
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

  const weeks = bundle?.weeks ?? {};
  const gcSchedule = settings
    ? { start: settings.gc_start, months: settings.gc_months }
    : bundle?.gc ?? null;
  // Typed weekly numbers win; sent reports fill the weeks nobody typed
  const progress = useMemo(
    () => mergedProgress(lines, reports, weeks, gcSchedule),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [lines, reports, weeks, gcSchedule?.start, gcSchedule?.months],
  );
  const weekly = useMemo(() => weeklyQuantities(lines, reports, weeks), [lines, reports, weeks]);

  /** report type -> how many of this job's reports of that type have been sent */
  const sentByType = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const r of reports) counts[r.slug] = (counts[r.slug] ?? 0) + 1;
    return counts;
  }, [reports]);

  // A fixed number of month columns, ending at the picked month, so moving
  // back in time doesn't keep adding columns.
  const months = useMemo(
    () => monthRange(shiftMonth(month, -(monthCount - 1)), month),
    [month, monthCount],
  );

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
    setEstimateTimes(1);
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
        addEstimatesToLines(job.id, lines, picked, () => crypto.randomUUID(), estimateTimes),
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

  /** Puts general conditions on the SOV from the form. Saved with the SOV. */
  const applyGc = () => {
    if (!job || !settings) return;
    const monthly = parseNumber(gcDraft.monthly);
    const months = Math.round(parseNumber(gcDraft.months));
    const next: GeneralConditions | null =
      monthly > 0 && months > 0 ? { monthly, months, fromPrice: gcDraft.fromPrice } : null;
    const unchanged =
      (!appliedGc && !next) ||
      (!!appliedGc &&
        !!next &&
        appliedGc.monthly === next.monthly &&
        appliedGc.months === next.months &&
        appliedGc.fromPrice === next.fromPrice);
    // Only touch the lines when general conditions changed, so prices never drift by a cent
    if (unchanged) setDirty(true);
    else markChanged(applyGeneralConditions(job.id, lines, appliedGc, next, () => crypto.randomUUID()));
    setAppliedGc(next);
    setSetupOpen(false);
    setSettings({
      ...settings,
      billing_frequency: billingDraft,
      gc_monthly: next ? monthly : null,
      gc_months: next ? months : null,
      gc_start: gcDraft.start || null,
      gc_from_price: gcDraft.fromPrice,
    });
  };

  const openSetup = () => {
    if (!settings) return;
    setBillingDraft(settings.billing_frequency);
    setGcDraft({
      monthly: appliedGc ? String(appliedGc.monthly) : '',
      months: appliedGc ? String(appliedGc.months) : '',
      start: settings.gc_start ?? job?.start_date ?? '',
      fromPrice: appliedGc?.fromPrice ?? settings.gc_from_price,
    });
    setSetupOpen(true);
  };

  const BILLING_LABEL: Record<BillingFrequency, string> = { monthly: 'monthly', weekly: 'weekly', one_time: 'one time' };
  const setupSummary = settings
    ? [
        `Bills ${BILLING_LABEL[settings.billing_frequency]}`,
        appliedGc
          ? `General conditions ${fmtMoney(appliedGc.monthly)} × ${appliedGc.months} mo${
              settings.gc_start ? ` from ${fmtDay(settings.gc_start)}` : ''
            }`
          : 'No general conditions',
      ].join(' · ')
    : null;

  // ---- Weekly update -------------------------------------------------------
  const weekLines = lines.filter((line) => line.line_type !== 'general_conditions');
  const savedWeek = weeks[week];
  const weekLocked = savedWeek?.status === 'approved';
  /** What the box shows: the typed draft, else the saved or suggested number */
  const weekValue = (lineId: string) => weekDraft[lineId] ?? String(weekly[lineId]?.[week] || '');
  const doneBefore = (lineId: string) =>
    Object.entries(weekly[lineId] ?? {}).reduce((sum, [w, n]) => (w < week ? sum + n : sum), 0);
  const weekQuantities = () =>
    Object.fromEntries(weekLines.map((line) => [line.id, parseNumber(weekValue(line.id))]));
  /** This month's $ so far, counting this week's numbers as typed */
  const wipFor = (quantities: Record<string, number>) => {
    const withThisWeek = {
      ...weeks,
      [week]: {
        id: savedWeek?.id ?? '',
        status: savedWeek?.status ?? 'draft',
        quantities,
        wip_amount: null,
        hours: null,
        approved_at: null,
      },
    };
    return monthDollars(lines, mergedProgress(lines, reports, withThisWeek, gcSchedule), weekMonth(week));
  };
  const changeWeek = (by: number) => {
    setWeek(shiftWeekKey(week, by));
    setWeekDraft({});
  };

  const saveWeek = async (approve: boolean) => {
    if (!job || !bundle) return;
    const quantities = weekQuantities();
    const wipAmount = wipFor(quantities);
    const hours = hoursByWeek[week] ?? 0;
    setWeekSaving(true);
    try {
      await saveSovWeek(job.id, week, quantities, { approve, wipAmount, hours, userId: user?.id });
      setBundle({
        ...bundle,
        weeks: {
          ...bundle.weeks,
          [week]: {
            id: savedWeek?.id ?? '',
            status: approve ? 'approved' : 'draft',
            quantities,
            wip_amount: approve ? wipAmount : null,
            hours: approve ? hours : null,
            approved_at: approve ? new Date().toISOString() : null,
          },
        },
      });
      setWeekDraft({});
    } catch (err) {
      console.error('[PM Dashboard] Weekly SOV save failed:', err);
      setSaveError(err instanceof Error ? err.message : 'Could not save the week.');
    } finally {
      setWeekSaving(false);
    }
  };

  const reopenWeek = async () => {
    if (!job || !bundle || !savedWeek) return;
    setWeekSaving(true);
    try {
      await reopenSovWeek(job.id, week);
      setBundle({ ...bundle, weeks: { ...bundle.weeks, [week]: { ...savedWeek, status: 'draft', approved_at: null } } });
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Could not reopen the week.');
    } finally {
      setWeekSaving(false);
    }
  };

  const discard = () => {
    setSettings(savedSettings);
    setAppliedGc(gcFromSettings(savedSettings));
    setLines(bundle?.lines ?? []);
    setDirty(false);
    setSaveError(null);
  };

  const save = async () => {
    if (!job || !bundle) return;
    setSaving(true);
    setSaveError(null);
    try {
      await saveSovLines(job.id, lines);
      if (settings) {
        await saveSovSettings(job.id, settings, user?.id);
        setSavedSettings(settings);
      }
      setBundle({
        ...bundle,
        lines,
        seeded: false,
        changeOrders: bundle.changeOrders.map((co) => ({ ...co, seeded: false })),
      });
      setDirty(false);
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

  // Back to the list the person came from: My Jobs, or this job's location.
  const fromScope = searchParams.get('scope');
  const backToList = () =>
    navigate(
      `/pm-dashboard?month=${month}` +
        (fromScope ? `&scope=${fromScope}` : '') +
        (fromScope !== 'mine' && job?.division ? `&division=${job.division}` : ''),
    );

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

  // A job's own PM sees only their jobs. The database enforces this for hours and the SOV.
  if (!access.fullAccess && job.project_manager_id !== user?.id) {
    return (
      <div className="mx-auto max-w-7xl space-y-4 p-6">
        <Button variant="ghost" size="sm" leftIcon={<ArrowLeft className="h-4 w-4" />} onClick={backToList}>
          My Jobs
        </Button>
        <Notice>You're not the PM on this job. Ask the location's PM or an admin if it should be yours.</Notice>
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
  // Mobilization added on top counts too; the baked-in part only moves to its own line
  const pickedTotal =
    pickedEstimates.reduce((sum, e) => sum + estimateTotal(e) + (e.mobilization?.added ?? 0), 0) *
    (estimateTimes > 0 ? estimateTimes : 1);
  // The SOV as it stands counts as one more sheet: adding an item it already has doubles it too.
  const overlaps = estimateOverlaps([
    {
      id: 'sov',
      title: 'SOV now',
      updated_at: '',
      status: null,
      rows: lines.filter(isOriginalLine).map((line) => ({
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

  // Change Orders on the SOV: each one's lines sit in their own group under the original lines
  const sovCos = bundle.changeOrders;
  const originalLines = lines.filter(isOriginalLine);
  const coLinesOf = (coId: string) => lines.filter((line) => line.change_order_id === coId);
  const coOpen = (coId: string) => openCos[coId] ?? !linesComplete(coLinesOf(coId), progress);
  const toggleCo = (coId: string) => setOpenCos((prev) => ({ ...prev, [coId]: !coOpen(coId) }));
  const coNumberById = new Map(sovCos.map((co) => [co.id, co.number]));
  const coLabel = (co: SovChangeOrder) =>
    [`Change Order ${formatChangeOrderNumber(co.number)}`, co.letter && `Letter ${co.letter}`, co.title.trim()]
      .filter(Boolean)
      .join(' · ');
  const seededCos = sovCos.filter((co) => co.seeded);
  // Lines copied in but not saved: the weekly update waits until they're saved
  const needsSave = bundle.seeded || seededCos.length > 0;

  // ---- Page layout ----------------------------------------------------------
  // Three tabs. Defaults to the weekly update once the SOV is saved, else the SOV itself.
  const tabParam = searchParams.get('tab');
  const tab: JobTab =
    tabParam === 'week' || tabParam === 'sov' || tabParam === 'month'
      ? tabParam
      : weekLines.length > 0 && !needsSave
        ? 'week'
        : 'sov';
  const setTab = (next: JobTab) =>
    setSearchParams(
      (prev) => {
        const params = new URLSearchParams(prev);
        params.set('tab', next);
        return params;
      },
      { replace: true },
    );
  const openWeek = (w: string) => {
    setWeek(w);
    setWeekDraft({});
    setTab('week');
  };

  const lineValue = (line: SovLine) => line.quantity * line.unit_price;
  const earnedOf = (list: SovLine[]) =>
    list.reduce((sum, line) => sum + lineDone(progress, line.id) * line.unit_price, 0);
  const earnedToDate = earnedOf(lines);
  const workDone = completedPct(lines, progress);
  const canPrint = lines.length > 0 && !dirty && !needsSave;
  const printSov = () => window.open(`/pm-dashboard/${job.id}/sov?month=${month}`, '_blank', 'noopener');

  // Running item numbers: original lines first, then each Change Order's
  const lineNumber = new Map(
    [...originalLines, ...sovCos.flatMap((co) => coLinesOf(co.id))].map((line, i) => [line.id, i + 1]),
  );

  // What changed since the last save, for the save bar
  const savedById = new Map(bundle.lines.map((line) => [line.id, line]));
  const changedCount =
    lines.filter((line) => {
      const saved = savedById.get(line.id);
      return (
        !saved ||
        saved.item !== line.item ||
        saved.quantity !== line.quantity ||
        saved.unit_price !== line.unit_price ||
        saved.total_hours !== line.total_hours ||
        saved.report_slugs.join(',') !== line.report_slugs.join(',')
      );
    }).length + bundle.lines.filter((saved) => !lines.some((line) => line.id === saved.id)).length;
  const showSaveBar = dirty || (needsSave && lines.length > 0);
  const saveBarText = dirty
    ? changedCount > 0
      ? `${changedCount} line${changedCount === 1 ? '' : 's'} changed. Not saved yet.`
      : 'Setup changed. Not saved yet.'
    : "Lines were copied in and aren't saved yet. Check them, then save.";

  // Things that need the PM, in one box at the top
  const lastWeekOpen =
    weekLines.length > 0 &&
    !needsSave &&
    !!job.start_date &&
    job.start_date < weekKey(new Date()) &&
    weeks[lastWeek]?.status !== 'approved';
  const seededNotice = bundle.seeded && lines.length > 0 && !dirty;
  const coNotice = seededCos.length > 0 && !dirty;
  const attentionCount = (lastWeekOpen ? 1 : 0) + (seededNotice ? 1 : 0) + (coNotice ? 1 : 0) + unmatched.length;

  const reportsLabel = (line: SovLine) => {
    const [first, ...rest] = line.report_slugs;
    if (!first) return 'Pick reports';
    return rest.length ? `${reportTypeLabel(first)} +${rest.length}` : reportTypeLabel(first);
  };

  /** One SOV row: an original line, or a line inside a Change Order group. Always editable. */
  const renderSovRow = (line: SovLine) => {
    const done = lineDone(progress, line.id);
    const isGc = line.line_type === 'general_conditions';
    // A Change Order keeps at least one line, or its lines get copied in again
    const lastInCo = !!line.change_order_id && coLinesOf(line.change_order_id).length === 1;
    return (
      <tr key={line.id} className={`${ROW} hover:bg-neutral-50 dark:hover:bg-neutral-700/40`}>
        <td className={`${TD} w-8 text-xs tabular-nums text-neutral-500 dark:text-neutral-400`}>
          {lineNumber.get(line.id)}
        </td>
        <td className={line.change_order_id ? `${TD} pl-8` : TD}>
          <input
            aria-label="Item"
            className={`${CELL_INPUT} min-w-[14rem]`}
            placeholder="Name this line"
            value={line.item}
            onChange={(e) => updateLine(line.id, { item: e.target.value })}
          />
          {line.line_type === 'mobilization' && (
            <p className="mt-0.5 text-xs text-neutral-500 dark:text-neutral-400">From the estimate</p>
          )}
        </td>
        <td className={NUM}>
          <input
            aria-label="Qty"
            type="number"
            min={0}
            step="any"
            className={`${NUMBER_INPUT} min-w-[5rem]`}
            value={line.quantity}
            onChange={(e) => updateLine(line.id, { quantity: parseNumber(e.target.value) })}
          />
          {(line.multiplier ?? 1) > 1 && (
            <p className="mt-0.5 text-xs text-neutral-500 dark:text-neutral-400">
              {line.multiplier} × <Count value={line.quantity / (line.multiplier ?? 1)} />
            </p>
          )}
        </td>
        <td className={NUM}>
          <input
            aria-label="Price each"
            type="number"
            min={0}
            step="any"
            className={`${NUMBER_INPUT} min-w-[7rem]`}
            value={line.unit_price}
            onChange={(e) => updateLine(line.id, { unit_price: parseNumber(e.target.value) })}
          />
        </td>
        <td className={`${NUM} font-semibold`}>{fmtMoney(lineValue(line))}</td>
        <td className={NUM}>
          <input
            aria-label="Estimated hours"
            type="number"
            min={0}
            step="any"
            className={`${NUMBER_INPUT} min-w-[5rem]`}
            value={line.total_hours}
            onChange={(e) => updateLine(line.id, { total_hours: parseNumber(e.target.value) })}
          />
        </td>
        <td className={TD}>
          {isGc ? (
            <span className="whitespace-nowrap text-xs text-neutral-500 dark:text-neutral-400">
              Bills monthly{settings?.gc_start ? ` from ${fmtDay(settings.gc_start)}` : ''}
            </span>
          ) : (
            <button
              type="button"
              onClick={() => setPickerLineId(line.id)}
              className={`${CHIP} ${line.report_slugs.length ? '' : 'text-neutral-500 dark:text-neutral-400'}`}
              title={line.report_slugs.map((slug) => reportTypeLabel(slug)).join(', ') || undefined}
            >
              <span className="max-w-[11rem] truncate">{reportsLabel(line)}</span>
              <ChevronDown className="h-3.5 w-3.5 flex-shrink-0" />
            </button>
          )}
        </td>
        <td className={TD}>
          <div className="flex min-w-[9rem] items-center gap-2">
            <Bar value={line.quantity > 0 ? done / line.quantity : null} />
            <span className="whitespace-nowrap text-xs tabular-nums text-neutral-600 dark:text-neutral-300">
              {fmtCount(done)} of {fmtCount(line.quantity)}
            </span>
          </div>
        </td>
        <td className="px-1 py-1 text-right">
          {!lastInCo && (
            <Button
              variant="ghost"
              size="icon"
              aria-label={`Remove ${line.item || 'line'}`}
              onClick={() => markChanged(lines.filter((l) => l.id !== line.id))}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
        </td>
      </tr>
    );
  };

  /** One row of the weekly update. */
  const renderWeekRow = (line: SovLine) => {
    const before = doneBefore(line.id);
    const thisWeek = parseNumber(weekValue(line.id));
    const left = line.quantity - before - thisWeek;
    return (
      <tr key={line.id} className={ROW}>
        <td className={line.change_order_id ? `${TD} pl-8` : TD}>{line.item || 'Unnamed line'}</td>
        <td className={NUM}>
          <Count value={line.quantity} />
        </td>
        <td className={NUM}>
          <Count value={before} />
        </td>
        <td className={NUM}>
          <input
            aria-label={`${line.item || 'Line'} this week`}
            type="number"
            min={0}
            step="any"
            className={`${NUMBER_INPUT} min-w-[5rem]`}
            disabled={weekLocked}
            placeholder="0"
            value={weekValue(line.id)}
            onChange={(e) => setWeekDraft({ ...weekDraft, [line.id]: e.target.value })}
          />
        </td>
        <td className={`${NUM} ${left < 0 ? 'text-amber-700 dark:text-amber-300' : ''}`}>
          <Count value={left} />
        </td>
        <td className={`${TD} w-36`}>
          <Bar value={line.quantity > 0 ? (before + thisWeek) / line.quantity : null} />
        </td>
      </tr>
    );
  };

  /** One row of Billing by month: dollars, or units when that's picked. */
  const renderMonthRow = (line: SovLine) => {
    const done = lineDone(progress, line.id);
    const show = (units: number) => (monthUnits ? <Count value={units} /> : fmtMoney(units * line.unit_price));
    return (
      <tr key={line.id} className={ROW}>
        <td className={line.change_order_id ? `${TD} pl-8` : TD}>{line.item || 'Unnamed line'}</td>
        <td className={NUM}>{show(line.quantity)}</td>
        {months.map((m) => {
          const units = progress.qty[line.id]?.[m] ?? 0;
          return (
            <td key={m} className={m === month ? NUM_ACTIVE : NUM}>
              {units ? show(units) : ''}
            </td>
          );
        })}
        <td className={NUM}>{show(done)}</td>
        <td className={NUM}>{show(line.quantity - done)}</td>
      </tr>
    );
  };

  /** Group row in Billing by month: dollar subtotals, blank in units (units don't add up across lines). */
  const monthGroupCells = (list: SovLine[]) =>
    monthUnits ? (
      <td colSpan={months.length + 3} />
    ) : (
      <>
        <td className={NUM}>{fmtMoney(sovTotal(list))}</td>
        {months.map((m) => {
          const dollars = monthDollars(list, progress, m);
          return (
            <td key={m} className={m === month ? NUM_ACTIVE : NUM}>
              {dollars ? fmtMoney(dollars) : ''}
            </td>
          );
        })}
        <td className={NUM}>{fmtMoney(earnedOf(list))}</td>
        <td className={NUM}>{fmtMoney(sovTotal(list) - earnedOf(list))}</td>
      </>
    );

  /** Change Order group heading, shared by the three tabs. */
  const coToggle = (co: SovChangeOrder) => {
    const open = coOpen(co.id);
    return (
      <button
        type="button"
        aria-expanded={open}
        onClick={() => toggleCo(co.id)}
        className="flex items-center gap-1.5 text-left font-medium text-neutral-900 dark:text-neutral-100"
      >
        {open ? <ChevronDown className="h-4 w-4 flex-shrink-0" /> : <ChevronRight className="h-4 w-4 flex-shrink-0" />}
        {coLabel(co)}
        {linesComplete(coLinesOf(co.id), progress) && (
          <span className="ml-2 text-xs font-normal text-green-700 dark:text-green-400">Done</span>
        )}
      </button>
    );
  };

  const GROUP_ROW = `${ROW} bg-neutral-50 dark:bg-neutral-900/40`;

  const stats: { label: string; value: string; note: string; bar?: number | null; over?: boolean }[] = [
    {
      label: 'Contract',
      value: fmtMoney(contract),
      note: bundle.approvedChangeOrders
        ? `Includes ${fmtMoney(bundle.approvedChangeOrders)} in Change Orders`
        : bundle.quotedAmount > 0
          ? 'From the quote'
          : 'Adds up the SOV lines',
    },
    {
      label: 'Billed to date',
      value: !qboId ? 'n/a' : billed == null ? '...' : fmtMoney(billed),
      note: !qboId
        ? 'Job is not linked to QuickBooks'
        : billed == null
          ? 'Checking QuickBooks...'
          : `${fmtPct(pct(billed, contract))} · from QuickBooks`,
      bar: qboId && billed != null ? pct(billed, contract) : undefined,
    },
    {
      label: `Earned in ${monthName}`,
      value: fmtMoney(monthDollars(lines, progress, month)),
      note: 'From the weekly numbers',
    },
    {
      label: 'Work done',
      value: fmtPct(workDone),
      note: sovDollars > 0 ? `${fmtMoney(earnedToDate)} of ${fmtMoney(sovDollars)}` : 'Fill in Qty and Price each',
      bar: workDone,
    },
    {
      label: 'Hours used',
      value: fmtHours(usedHours),
      note:
        estimatedHours > 0
          ? `${fmtPct(pct(usedHours, estimatedHours))} of ${fmtHours(estimatedHours)} estimated`
          : 'No hours estimate yet',
      bar: estimatedHours > 0 ? pct(usedHours, estimatedHours) : undefined,
      over: estimatedHours > 0 && usedHours > estimatedHours,
    },
  ];

  const tabs: { id: JobTab; label: string; sub: string }[] = [
    { id: 'week', label: 'Weekly update', sub: weekRangeLabel(week) },
    {
      id: 'sov',
      label: 'Schedule of values',
      sub: `${lines.length} line${lines.length === 1 ? '' : 's'} · ${fmtMoney(sovDollars)}`,
    },
    { id: 'month', label: 'Billing by month', sub: `${fmtMoney(monthDollars(lines, progress, month))} in ${monthLabel(month)}` },
  ];

  return (
    <div className="mx-auto max-w-7xl space-y-4 p-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
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

      <div className="grid grid-cols-2 border border-neutral-200 bg-white dark:border-neutral-700 dark:bg-neutral-800 sm:grid-cols-3 lg:grid-cols-5">
        {stats.map((s) => (
          <div key={s.label} className="flex flex-col gap-1 border-b border-r border-neutral-100 p-4 dark:border-neutral-700">
            <span className="text-xs font-medium text-neutral-500 dark:text-neutral-400">{s.label}</span>
            <span className="font-mono text-xl font-semibold text-neutral-900 dark:text-neutral-100">{s.value}</span>
            {s.bar !== undefined && <Bar value={s.bar} over={s.over} />}
            <span className="text-xs text-neutral-500 dark:text-neutral-400">{s.note}</span>
          </div>
        ))}
      </div>

      {saveError && (
        <div className="rounded-none border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300">
          {saveError}
        </div>
      )}

      {attentionCount > 0 && (
        <div className="space-y-2 rounded-none border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200">
          <p className="font-semibold">
            {attentionCount === 1 ? '1 thing needs you' : `${attentionCount} things need you`}
          </p>
          {lastWeekOpen && (
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span>Week of {weekRangeLabel(lastWeek)} isn't approved yet.</span>
              <Button variant="outline" size="sm" onClick={() => openWeek(lastWeek)}>
                Open that week
              </Button>
            </div>
          )}
          {seededNotice && (
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span>The SOV was copied from the estimate and isn't saved yet. Check the lines and which reports count.</span>
              {tab !== 'sov' && (
                <Button variant="outline" size="sm" onClick={() => setTab('sov')}>
                  Review
                </Button>
              )}
            </div>
          )}
          {coNotice && (
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span>
                {seededCos.length === 1
                  ? `${coLabel(seededCos[0])} is approved. Its lines were copied from its estimate`
                  : `${seededCos.length} Change Orders are approved. Their lines were copied from their estimates`}
                , priced to add up to the approved amount. Check them, then save.
              </span>
              {tab !== 'sov' && (
                <Button variant="outline" size="sm" onClick={() => setTab('sov')}>
                  Review
                </Button>
              )}
            </div>
          )}
          {unmatched.map(([slug, count]) => {
            const suggested = bestLineFor(lines, slug);
            return (
              <div key={slug} className="flex flex-wrap items-center justify-between gap-2">
                <span>
                  {count} sent {reportTypeLabel(slug)} report{count === 1 ? '' : 's'} {count === 1 ? "doesn't" : "don't"}{' '}
                  count toward any line yet.
                </span>
                <select
                  aria-label={`Count ${reportTypeLabel(slug)} toward`}
                  value=""
                  onChange={(e) => assignUnmatched(slug, e.target.value)}
                  className="rounded-none border border-neutral-300 bg-white px-2 py-1 text-sm text-neutral-900 dark:border-neutral-600 dark:bg-neutral-900 dark:text-neutral-100"
                >
                  <option value="">Choose a line...</option>
                  {lines.map((line) => (
                    <option key={line.id} value={line.id}>
                      {line.change_order_id
                        ? `Change Order ${formatChangeOrderNumber(coNumberById.get(line.change_order_id) ?? 0)}: `
                        : ''}
                      {line.item || 'Unnamed line'}
                      {line.id === suggested?.id ? ' (best guess)' : ''}
                    </option>
                  ))}
                  <option value={NEW_LINE}>New SOV line</option>
                </select>
              </div>
            );
          })}
          {unmatched.length > 1 && (
            <Button
              variant="outline"
              size="sm"
              leftIcon={<Plus className="h-4 w-4" />}
              onClick={() => markChanged([...lines, ...unmatched.map(([slug]) => lineForType(slug))])}
            >
              Make a line for each
            </Button>
          )}
        </div>
      )}

      <div className="rounded-none border border-neutral-200 bg-white dark:border-neutral-700 dark:bg-neutral-800">
        <div role="tablist" aria-label="Job sections" className="flex flex-wrap gap-1 border-b border-neutral-200 px-3 dark:border-neutral-700">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              onClick={() => setTab(t.id)}
              className={`-mb-px min-h-[3rem] border-b-[3px] px-3 text-left text-sm ${
                tab === t.id
                  ? 'border-brand font-semibold text-neutral-900 dark:text-neutral-100'
                  : 'border-transparent font-medium text-neutral-500 hover:text-neutral-800 dark:text-neutral-400 dark:hover:text-neutral-200'
              }`}
            >
              {t.label}
              <span className="ml-2 text-xs font-normal text-neutral-500 dark:text-neutral-400">{t.sub}</span>
            </button>
          ))}
        </div>

        {tab === 'week' && (
          <div className="space-y-3 p-4">
            {weekLines.length === 0 ? (
              <p className="py-6 text-center text-sm text-neutral-500 dark:text-neutral-400">
                Add lines on the Schedule of values tab first.
              </p>
            ) : (
              <>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" aria-label="Previous week" onClick={() => changeWeek(-1)}>
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <div className="min-w-[11rem] text-center text-sm font-semibold text-neutral-900 dark:text-neutral-100">
                      {weekRangeLabel(week)}
                    </div>
                    <Button variant="outline" size="sm" aria-label="Next week" onClick={() => changeWeek(1)}>
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                    <span
                      className={`whitespace-nowrap rounded-none border px-2 py-0.5 text-xs ${
                        weekLocked
                          ? 'border-green-300 bg-green-50 text-green-800 dark:border-green-800 dark:bg-green-950 dark:text-green-200'
                          : week === lastWeek
                            ? 'border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200'
                            : 'border-neutral-300 text-neutral-600 dark:border-neutral-600 dark:text-neutral-300'
                      }`}
                    >
                      {weekLocked ? 'Approved' : week === lastWeek ? 'Due Monday' : savedWeek ? 'Draft' : 'Not started'}
                    </span>
                  </div>
                  <p className="text-xs text-neutral-500 dark:text-neutral-400">
                    Type what got done this week. Sent reports fill in a guess; your numbers win.
                  </p>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-sm text-neutral-900 dark:text-neutral-100">
                    <thead>
                      <tr>
                        <th className={`${TH} text-left`}>Item</th>
                        <th className={`${TH} text-right`}>Total</th>
                        <th className={`${TH} text-right`}>Done before</th>
                        <th className={`${TH} text-right`}>This week</th>
                        <th className={`${TH} text-right`}>Left</th>
                        <th className={`${TH} text-left`}>Progress</th>
                      </tr>
                    </thead>
                    <tbody>
                      {weekLines.filter(isOriginalLine).map(renderWeekRow)}
                      {sovCos.map((co) => {
                        const coWeekLines = weekLines.filter((line) => line.change_order_id === co.id);
                        if (coWeekLines.length === 0) return null;
                        return (
                          <React.Fragment key={co.id}>
                            <tr className={GROUP_ROW}>
                              <td className={TD} colSpan={6}>
                                {coToggle(co)}
                              </td>
                            </tr>
                            {coOpen(co.id) && coWeekLines.map(renderWeekRow)}
                          </React.Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                {lines.some((line) => line.line_type === 'general_conditions') && (
                  <p className="text-xs text-neutral-500 dark:text-neutral-400">
                    General conditions aren't listed. They bill on their own each month.
                  </p>
                )}

                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-neutral-200 pt-3 text-sm dark:border-neutral-700">
                  <div className="flex flex-wrap gap-x-6 gap-y-1 text-neutral-600 dark:text-neutral-300">
                    <span>
                      Hours this week{' '}
                      <b className="text-neutral-900 dark:text-neutral-100">{fmtHours(hoursByWeek[week] ?? 0)}</b>
                      <span className="text-xs text-neutral-500 dark:text-neutral-400"> clock + temps</span>
                    </span>
                    <span>
                      Earned in {monthLabel(weekMonth(week), 'long')} so far{' '}
                      <b className="text-neutral-900 dark:text-neutral-100">{fmtMoney(wipFor(weekQuantities()))}</b>
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    {(dirty || needsSave) && !weekLocked && (
                      <span className="text-xs text-amber-700 dark:text-amber-300">Save the SOV first</span>
                    )}
                    {weekLocked ? (
                      <Button variant="outline" size="sm" isLoading={weekSaving} onClick={reopenWeek}>
                        Reopen
                      </Button>
                    ) : (
                      <>
                        <Button
                          variant="outline"
                          size="sm"
                          isLoading={weekSaving}
                          disabled={dirty || needsSave}
                          onClick={() => saveWeek(false)}
                        >
                          Save draft
                        </Button>
                        <Button
                          size="sm"
                          leftIcon={<Check className="h-4 w-4" />}
                          isLoading={weekSaving}
                          disabled={dirty || needsSave}
                          onClick={() => saveWeek(true)}
                        >
                          Approve week
                        </Button>
                      </>
                    )}
                  </div>
                </div>
                <p className="text-xs text-neutral-500 dark:text-neutral-400">
                  Billing ahead? Add the extra in the month's last week; the customer only sees the month.
                </p>
              </>
            )}
          </div>
        )}

        {tab === 'sov' && (
          <div className="space-y-3 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm text-neutral-600 dark:text-neutral-300">
                  What the job is worth, line by line. Click any box to change it.
                </p>
                {setupSummary && <p className="text-xs text-neutral-500 dark:text-neutral-400">{setupSummary}</p>}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button variant="outline" size="sm" leftIcon={<Plus className="h-4 w-4" />} onClick={addLine}>
                  Add line
                </Button>
                {estimates.length > 0 && (
                  <Button variant="outline" size="sm" leftIcon={<Copy className="h-4 w-4" />} onClick={openEstimatePicker}>
                    Copy from estimate
                  </Button>
                )}
                {settings && (
                  <Button variant="outline" size="sm" leftIcon={<Settings className="h-4 w-4" />} onClick={openSetup}>
                    Setup
                  </Button>
                )}
                {lines.length > 0 && (
                  <Button
                    variant="outline"
                    size="sm"
                    leftIcon={<Printer className="h-4 w-4" />}
                    onClick={printSov}
                    disabled={!canPrint}
                    title={canPrint ? undefined : 'Save the SOV first'}
                  >
                    Print SOV
                  </Button>
                )}
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm text-neutral-900 dark:text-neutral-100">
                <thead>
                  <tr>
                    <th className={`${TH} text-left`}>#</th>
                    <th className={`${TH} text-left`}>Item</th>
                    <th className={`${TH} text-right`}>Qty</th>
                    <th className={`${TH} text-right`}>Price each</th>
                    <th className={`${TH} text-right`}>Line total</th>
                    <th className={`${TH} text-right`}>Est. hours</th>
                    <th className={`${TH} text-left`}>Counts these reports</th>
                    <th className={`${TH} text-left`}>Done</th>
                    <th className={TH} />
                  </tr>
                </thead>
                <tbody>
                  {lines.length === 0 && (
                    <tr className={ROW}>
                      <td colSpan={9} className="px-3 py-6 text-center text-neutral-500 dark:text-neutral-400">
                        {estimates.length > 1
                          ? `This job's quote has ${estimates.length} estimates. Use Copy from estimate to pick the ones that apply.`
                          : estimates.length === 1
                            ? 'No SOV lines yet. Use Copy from estimate, or Add line.'
                            : 'No SOV lines yet. This job has no estimate to copy from. Use Add line.'}
                      </td>
                    </tr>
                  )}
                  {sovCos.length > 0 && originalLines.length > 0 && (
                    <tr className={GROUP_ROW}>
                      <td className={TD} />
                      <td className={`${TD} font-medium`} colSpan={3}>
                        Original contract
                      </td>
                      <td className={`${NUM} font-medium`}>{fmtMoney(sovTotal(originalLines))}</td>
                      <td colSpan={4} />
                    </tr>
                  )}
                  {originalLines.map(renderSovRow)}
                  {sovCos.map((co) => {
                    const coLines = coLinesOf(co.id);
                    const share = completedPct(coLines, progress);
                    return (
                      <React.Fragment key={co.id}>
                        <tr className={GROUP_ROW}>
                          <td className={TD} />
                          <td className={TD} colSpan={3}>
                            {coToggle(co)}
                            {co.status !== 'approved' && (
                              <p className="ml-6 mt-1 text-xs text-amber-700 dark:text-amber-300">
                                Not approved anymore. Approve it again, or remove its lines.
                              </p>
                            )}
                          </td>
                          <td className={`${NUM} font-medium`}>{fmtMoney(sovTotal(coLines))}</td>
                          <td />
                          <td className={TD}>
                            <Button
                              variant="ghost"
                              size="sm"
                              leftIcon={<Plus className="h-4 w-4" />}
                              onClick={() => {
                                setOpenCos((prev) => ({ ...prev, [co.id]: true }));
                                markChanged([...lines, newLine({ change_order_id: co.id })]);
                              }}
                            >
                              Line
                            </Button>
                          </td>
                          <td className={`${TD} text-xs text-neutral-600 dark:text-neutral-300`}>
                            {!linesComplete(coLines, progress) && share != null ? `${Math.round(share * 100)}% done` : ''}
                          </td>
                          <td />
                        </tr>
                        {coOpen(co.id) && coLines.map(renderSovRow)}
                      </React.Fragment>
                    );
                  })}
                  {lines.length > 0 && (
                    <tr className="border-t-2 border-neutral-300 font-semibold dark:border-neutral-600">
                      <td className={TD} />
                      <td className={TD} colSpan={3}>
                        Total
                      </td>
                      <td className={NUM}>{fmtMoney(sovDollars)}</td>
                      <td className={NUM}>{fmtHours(sovHours(lines))}</td>
                      <td />
                      <td className={`${TD} text-xs`}>{workDone != null ? `${fmtPct(workDone)} done` : ''}</td>
                      <td />
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {lines.length > 0 && bundle.quotedAmount > 0 && (
              <p
                className={`flex items-center gap-1.5 text-xs ${
                  sovGapMatters ? 'text-amber-700 dark:text-amber-300' : 'text-green-700 dark:text-green-400'
                }`}
              >
                {!sovGapMatters && <Check className="h-4 w-4" />}
                {sovGapMatters
                  ? `SOV adds up to ${fmtMoney(sovDollars)}. Contract is ${fmtMoney(contract)}. ${
                      sovGap > 0 ? `${fmtMoney(sovGap)} is not on the SOV yet.` : `SOV is ${fmtMoney(-sovGap)} over the contract.`
                    }`
                  : `Adds up to the contract (${fmtMoney(contract)}).`}
              </p>
            )}
          </div>
        )}

        {tab === 'month' && (
          <div className="space-y-3 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-3">
                <div className="inline-flex border border-neutral-300 dark:border-neutral-600" role="group" aria-label="Months to show">
                  {MONTH_COUNT_OPTIONS.map((n) => (
                    <button
                      key={n}
                      type="button"
                      aria-pressed={monthCount === n}
                      onClick={() => changeMonthCount(n)}
                      className={monthCount === n ? SEG_ON : SEG_OFF}
                    >
                      {n === 1 ? '1 month' : `${n} months`}
                    </button>
                  ))}
                </div>
                <div className="inline-flex border border-neutral-300 dark:border-neutral-600" role="group" aria-label="Show as">
                  <button type="button" aria-pressed={!monthUnits} onClick={() => setMonthUnits(false)} className={monthUnits ? SEG_OFF : SEG_ON}>
                    Dollars
                  </button>
                  <button type="button" aria-pressed={monthUnits} onClick={() => setMonthUnits(true)} className={monthUnits ? SEG_ON : SEG_OFF}>
                    Units
                  </button>
                </div>
              </div>
              {lines.length > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  leftIcon={<Printer className="h-4 w-4" />}
                  onClick={printSov}
                  disabled={!canPrint}
                  title={canPrint ? undefined : 'Save the SOV first'}
                >
                  Print SOV
                </Button>
              )}
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm text-neutral-900 dark:text-neutral-100">
                <thead>
                  <tr>
                    <th className={`${TH} min-w-[14rem] text-left`}>Item</th>
                    <th className={`${TH} text-right`}>{monthUnits ? 'Qty' : 'Line total'}</th>
                    {months.map((m) => (
                      <th key={m} className={`${m === month ? TH_ACTIVE : TH} text-right`}>
                        <button type="button" onClick={() => setMonth(m)} className="hover:underline">
                          {monthLabel(m)}
                        </button>
                      </th>
                    ))}
                    <th className={`${TH} text-right`}>{monthUnits ? 'Done to date' : 'Earned to date'}</th>
                    <th className={`${TH} text-right`}>Left</th>
                  </tr>
                </thead>
                <tbody>
                  {lines.length === 0 && (
                    <tr className={ROW}>
                      <td colSpan={4 + months.length} className="px-3 py-6 text-center text-neutral-500 dark:text-neutral-400">
                        Add lines on the Schedule of values tab first.
                      </td>
                    </tr>
                  )}
                  {sovCos.length > 0 && originalLines.length > 0 && (
                    <tr className={GROUP_ROW}>
                      <td className={`${TD} font-medium`}>Original contract</td>
                      {monthGroupCells(originalLines)}
                    </tr>
                  )}
                  {originalLines.map(renderMonthRow)}
                  {sovCos.map((co) => {
                    const coLines = coLinesOf(co.id);
                    return (
                      <React.Fragment key={co.id}>
                        <tr className={GROUP_ROW}>
                          <td className={TD}>{coToggle(co)}</td>
                          {monthGroupCells(coLines)}
                        </tr>
                        {coOpen(co.id) && coLines.map(renderMonthRow)}
                      </React.Fragment>
                    );
                  })}
                  {lines.length > 0 && !monthUnits && (
                    <tr className="border-t-2 border-neutral-300 font-semibold dark:border-neutral-600">
                      <td className={TD}>Total</td>
                      <td className={NUM}>{fmtMoney(sovDollars)}</td>
                      {months.map((m) => (
                        <td key={m} className={m === month ? NUM_ACTIVE : NUM}>
                          {fmtMoney(monthDollars(lines, progress, m))}
                        </td>
                      ))}
                      <td className={NUM}>{fmtMoney(earnedToDate)}</td>
                      <td className={NUM}>{fmtMoney(sovDollars - earnedToDate)}</td>
                    </tr>
                  )}
                  <tr className={`${ROW} text-neutral-500 dark:text-neutral-400`}>
                    <td className={TD} colSpan={2}>
                      Hours worked
                    </td>
                    {months.map((m) => (
                      <td key={m} className={m === month ? NUM_ACTIVE : NUM}>
                        {fmtHours(hoursByMonth[m] ?? 0)}
                      </td>
                    ))}
                    <td className={NUM}>{fmtHours(usedHours)}</td>
                    <td />
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Floats at the bottom of the screen, so nothing on the page shifts when it appears */}
        {showSaveBar &&
          createPortal(
          <div className="fixed bottom-6 left-1/2 z-50 flex w-[calc(100%-2rem)] max-w-xl -translate-x-1/2 flex-wrap items-center justify-between gap-3 rounded-none border border-neutral-700 bg-neutral-900 px-4 py-3 text-sm text-white shadow-lg print:hidden dark:border-neutral-600 dark:bg-neutral-950">
            <span>{saveBarText}</span>
            <div className="flex items-center gap-2">
              {dirty && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={discard}
                  disabled={saving}
                  className="border-neutral-500 bg-transparent text-white hover:bg-neutral-800 dark:bg-transparent"
                >
                  Discard
                </Button>
              )}
              <Button size="sm" leftIcon={<Save className="h-4 w-4" />} onClick={save} isLoading={saving} disabled={setupMissing}>
                Save SOV
              </Button>
            </div>
          </div>,
            document.body,
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

      <Dialog open={setupOpen} onOpenChange={setSetupOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>SOV setup</DialogTitle>
          </DialogHeader>
          <div className="space-y-5 text-sm">
            <div className="space-y-2">
              <div className="font-medium text-neutral-900 dark:text-neutral-100" id="sov-billing">
                Billing
              </div>
              <div className="flex" role="radiogroup" aria-labelledby="sov-billing">
                {(
                  [
                    ['monthly', 'Monthly'],
                    ['weekly', 'Weekly'],
                    ['one_time', '1 time'],
                  ] as const
                ).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    role="radio"
                    aria-checked={billingDraft === value}
                    onClick={() => setBillingDraft(value)}
                    className={`-ml-px flex-1 border px-3 py-1.5 first:ml-0 ${
                      billingDraft === value
                        ? 'relative z-10 border-brand bg-brand/10 font-medium text-neutral-900 dark:text-white'
                        : 'border-neutral-300 text-neutral-600 hover:border-neutral-400 dark:border-neutral-600 dark:text-neutral-300'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <div className="font-medium text-neutral-900 dark:text-neutral-100">General conditions</div>
              <div className="grid grid-cols-3 gap-2">
                <label className="space-y-1 text-xs text-neutral-500 dark:text-neutral-400" htmlFor="sov-gc-monthly">
                  <span>$ a month</span>
                  <input
                    id="sov-gc-monthly"
                    type="number"
                    min={0}
                    placeholder="0"
                    className={`${NUMBER_INPUT} w-full`}
                    value={gcDraft.monthly}
                    onChange={(e) => setGcDraft({ ...gcDraft, monthly: e.target.value })}
                  />
                </label>
                <label className="space-y-1 text-xs text-neutral-500 dark:text-neutral-400" htmlFor="sov-gc-months">
                  <span>Months</span>
                  <input
                    id="sov-gc-months"
                    type="number"
                    min={0}
                    placeholder="0"
                    className={`${NUMBER_INPUT} w-full`}
                    value={gcDraft.months}
                    onChange={(e) => setGcDraft({ ...gcDraft, months: e.target.value })}
                  />
                </label>
                <label className="space-y-1 text-xs text-neutral-500 dark:text-neutral-400" htmlFor="sov-gc-start">
                  <span>From</span>
                  <input
                    id="sov-gc-start"
                    type="date"
                    className={`${CELL_INPUT} w-full`}
                    value={gcDraft.start}
                    onChange={(e) => setGcDraft({ ...gcDraft, start: e.target.value })}
                  />
                </label>
              </div>
              <label className="flex items-center gap-2 text-neutral-700 dark:text-neutral-300" htmlFor="sov-gc-from-price">
                <input
                  id="sov-gc-from-price"
                  type="checkbox"
                  className="rounded-none accent-brand"
                  checked={gcDraft.fromPrice}
                  onChange={(e) => setGcDraft({ ...gcDraft, fromPrice: e.target.checked })}
                />
                Take it out of the other lines
              </label>
              <p className="text-xs text-neutral-500 dark:text-neutral-400">
                Bills each month from the start date, then stops, even if the job runs long. Leave
                blank for none.
              </p>
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setSetupOpen(false)}>
              Cancel
            </Button>
            <Button size="sm" onClick={applyGc}>
              Apply
            </Button>
          </div>
          <p className="-mt-2 text-right text-xs text-neutral-500 dark:text-neutral-400">Then Save the SOV.</p>
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
          <label className="flex items-center gap-2 text-sm text-neutral-700 dark:text-neutral-300" htmlFor="sov-times">
            Times
            <input
              id="sov-times"
              type="number"
              min={1}
              step={1}
              className={`${NUMBER_INPUT} w-20`}
              value={estimateTimes}
              onChange={(e) => setEstimateTimes(Math.max(1, Math.round(parseNumber(e.target.value)) || 1))}
            />
            <span className="text-xs text-neutral-500 dark:text-neutral-400">
              For reserve blocks: 10 blocks add each line at 10 times the quantity.
            </span>
          </label>
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
