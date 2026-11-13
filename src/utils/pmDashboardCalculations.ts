// Pure math for the PM dashboard. No database calls, so every number on the page can be
// checked by hand from the SOV lines and the list of sent reports.

export interface SovLine {
  id: string;
  job_id: string;
  sort_order: number;
  item: string;
  quantity: number;
  /** Estimated hours for the whole line, not per unit */
  total_hours: number;
  unit_price: number;
  /** Report types whose sent reports count as a finished unit of this line */
  report_slugs: string[];
  /** Estimates this line was copied from, so the same estimate is not added twice */
  source_estimate_ids: string[];
  /** scope (estimate rows or typed in), general_conditions, or mobilization */
  line_type?: SovLineType;
  /** Times the estimate scope repeats. Quantity already includes it; shown as "10 x 6". */
  multiplier?: number;
  /** The Change Order this line bills. Null or missing: part of the original contract. */
  change_order_id?: string | null;
}

/** True for lines from the original contract, false for Change Order lines. */
export const isOriginalLine = (line: SovLine): boolean => !line.change_order_id;

export type SovLineType = 'scope' | 'general_conditions' | 'mobilization';

export const GENERAL_CONDITIONS_ITEM = 'General conditions';
export const MOBILIZATION_ITEM = 'Mobilization';

export interface SentReport {
  id: string;
  /** Report type: the report route slug, or OTHER_FILES_KEY for uploads and custom forms */
  slug: string;
  name: string;
  sent_at: string;
}

/** Stand-in report type for sent files that are not a built-in report. */
export const OTHER_FILES_KEY = 'uploaded-file';

export interface SovProgress {
  /** line id -> month (YYYY-MM) -> units sent that month */
  qty: Record<string, Record<string, number>>;
  /** report type -> sent reports that count toward no line */
  unmatched: Record<string, number>;
}

/** Shape of an SOV row inside business.estimates.data.sovItems. */
export interface EstimateSovItem {
  rowType?: string;
  item?: string;
  quantity?: number | string;
  laborMen?: number | string;
  laborHours?: number | string;
}

/** One row of an estimate, priced the way the estimate sheet prices it. */
export interface EstimateRow {
  item: string;
  quantity: number;
  /** Labor hours for one unit (techs x hours) */
  unitHours: number;
  unitPrice: number;
}

/** One estimate sheet on the job's quote. A quote can hold several: change orders, options, revisions. */
export interface EstimateOption {
  id: string;
  title: string;
  updated_at: string;
  status: string | null;
  rows: EstimateRow[];
  /**
   * Mobilization on the estimate. total is what the letter quotes; added is the part on
   * top of the price. The rest is "baked in": already inside the row prices.
   */
  mobilization?: { total: number; added: number };
}

/** An item found in more than one estimate, with how many each one carries. */
export interface EstimateOverlap {
  item: string;
  parts: { title: string; quantity: number }[];
  total: number;
}

const toNum = (v: unknown): number => {
  const n = typeof v === 'string' ? parseFloat(v) : Number(v);
  return Number.isFinite(n) ? n : 0;
};

// ---------------------------------------------------------------------------
// Months
// ---------------------------------------------------------------------------

/** Month a moment falls in, on this computer's clock. */
export const monthKey = (d: Date | string): string => {
  const date = typeof d === 'string' ? new Date(d) : d;
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
};

export const shiftMonth = (month: string, by: number): string => {
  const [y, m] = month.split('-').map(Number);
  return monthKey(new Date(y, m - 1 + by, 1));
};

export const monthLabel = (month: string, style: 'short' | 'long' = 'short'): string => {
  const [y, m] = month.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString(undefined, { month: style, year: 'numeric' });
};

// ---------------------------------------------------------------------------
// Weeks: Sunday to Saturday, like pay weeks
// ---------------------------------------------------------------------------

const ymdLocal = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const parseDay = (ymd: string): Date => {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(y, m - 1, d);
};

/** The Sunday (YYYY-MM-DD) starting the week this moment falls in, on this computer's clock. */
export const weekKey = (d: Date | string): string => {
  const date = typeof d === 'string' ? new Date(d) : d;
  const sunday = new Date(date.getFullYear(), date.getMonth(), date.getDate() - date.getDay());
  return ymdLocal(sunday);
};

export const shiftWeekKey = (week: string, by: number): string => {
  const d = parseDay(week);
  return ymdLocal(new Date(d.getFullYear(), d.getMonth(), d.getDate() + by * 7));
};

/** A week counts toward the month its Wednesday falls in (temp hours use the same rule). */
export const weekMonth = (week: string): string => {
  const d = parseDay(week);
  return monthKey(new Date(d.getFullYear(), d.getMonth(), d.getDate() + 3));
};

/** "Nov 2 to Nov 8, 2026" */
export const weekRangeLabel = (week: string): string => {
  const start = parseDay(week);
  const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 6);
  const short = (x: Date) => x.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  return `${short(start)} to ${short(end)}, ${end.getFullYear()}`;
};

/** Every month from `from` through `to`, in order. */
export const monthRange = (from: string, to: string): string[] => {
  const months: string[] = [];
  // 240 = a 20 year cap, so a bad date can't spin forever
  for (let m = from; m <= to && months.length < 240; m = shiftMonth(m, 1)) months.push(m);
  return months;
};

// ---------------------------------------------------------------------------
// Matching report types to SOV lines
// ---------------------------------------------------------------------------

// Words that mean the same piece of equipment. An SOV line that uses any word in a group
// matches a report type that uses any other.
const KEYWORD_GROUPS: string[][] = [
  // 'tran' is what "Trans" becomes once the plural s is dropped
  ['transformer', 'xfmr', 'tran'],
  ['switchgear', 'switchboard', 'swgr', 'swbd', 'swb'],
  ['panelboard', 'panel'],
  ['breaker', 'mccb'],
  ['busway', 'busduct'],
  ['ct', 'cts', 'current'],
  ['pt', 'pts', 'potential'],
];

const INSTRUMENT_WORDS = ['ct', 'cts', 'pt', 'pts', 'current', 'potential', 'instrument'];

// Words too common to tell one line from another.
const STOP_WORDS = new Set([
  'test', 'testing', 'tests', 'report', 'inspection', 'and', 'the', 'of', 'for', 'with',
  'ats', 'mts', 'type', 'unit', 'each', 'ea', 'set', 'misc', 'new', 'existing',
]);

const VOLTAGE_CLASSES = ['lv', 'mv', 'hv'];

const singular = (word: string): string => {
  if (/(ch|sh|ss|x)es$/.test(word)) return word.slice(0, -2);
  if (word.endsWith('s') && !word.endsWith('ss') && word.length > 3) return word.slice(0, -1);
  return word;
};

const tokens = (text: string): string[] =>
  text
    .toLowerCase()
    .replace(/low[\s-]*voltage/g, 'lv')
    .replace(/medium[\s-]*voltage/g, 'mv')
    .replace(/high[\s-]*voltage/g, 'hv')
    .replace(/bus[\s-]*duct/g, 'busduct')
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
    .map(singular);

const expand = (word: string): string[] =>
  KEYWORD_GROUPS.find((group) => group.includes(word)) ?? [word];

/**
 * How well a report type fits an SOV line. 0 means it does not fit.
 * Compares whole words, so "Switches" does not match a switchgear report.
 */
export function matchScore(itemName: string, slug: string): number {
  const itemTokens = tokens(itemName).filter((t) => !STOP_WORDS.has(t) && !/^\d+$/.test(t));
  const slugTokens = new Set(tokens(slug));
  if (itemTokens.length === 0) return 0;

  // "LV Breakers" must not pick up medium voltage breaker reports.
  const itemVoltage = VOLTAGE_CLASSES.filter((v) => itemTokens.includes(v));
  const slugVoltage = VOLTAGE_CLASSES.filter((v) => slugTokens.has(v));
  if (itemVoltage.length && slugVoltage.length && !itemVoltage.some((v) => slugVoltage.includes(v))) {
    return 0;
  }

  // Current and potential transformer reports are not "Transformers" unless the line says so.
  const instrumentReport =
    slugTokens.has('transformer') && (slugTokens.has('current') || slugTokens.has('potential'));
  const instrumentLine = itemTokens.some((t) => INSTRUMENT_WORDS.includes(t));
  if (instrumentReport && !instrumentLine) return 0;

  let score = 0;
  for (const token of new Set(itemTokens)) {
    if (expand(token).some((word) => slugTokens.has(word))) score += 1;
  }
  // A voltage class alone ("LV") is not enough to claim a report.
  const onlyVoltage = score > 0 && score === itemVoltage.filter((v) => slugTokens.has(v)).length;
  return onlyVoltage ? 0 : score;
}

/** The line a report type fits best, or null. Ties go to the line listed first. */
export function bestLineFor(lines: SovLine[], slug: string): SovLine | null {
  let best: SovLine | null = null;
  let bestScore = 0;
  for (const line of lines) {
    const score = matchScore(line.item, slug);
    if (score > bestScore) {
      best = line;
      bestScore = score;
    }
  }
  return best;
}

/**
 * First guess at which report types count toward which line. Each type goes to one line
 * only, so a sent report is never counted twice. Lines that already count something are
 * left alone, and so are types a line already counts: a guess never undoes a PM's choice.
 */
export function guessLineSlugs(lines: SovLine[], slugs: string[]): SovLine[] {
  const taken = new Set(lines.flatMap((line) => line.report_slugs));
  const open = lines.filter((line) => line.report_slugs.length === 0);
  const picked = new Map<string, string[]>();
  for (const slug of slugs) {
    if (slug === OTHER_FILES_KEY || taken.has(slug)) continue;
    const line = bestLineFor(open, slug);
    if (line) picked.set(line.id, [...(picked.get(line.id) ?? []), slug]);
  }
  return lines.map((line) =>
    picked.has(line.id) ? { ...line, report_slugs: picked.get(line.id)! } : line,
  );
}

// ---------------------------------------------------------------------------
// SOV from estimates
// ---------------------------------------------------------------------------

const round2 = (n: number): number => Math.round(n * 100) / 100;

/** Same item, however it was typed: case and extra spaces do not matter. */
const nameKey = (name: string): string => name.trim().toLowerCase().replace(/\s+/g, ' ');

/**
 * Item rows of a full estimate (headings and blank rows dropped). A row's price is its
 * labor unit times the estimate's dollars per labor hour, the sheet's "SOV item price".
 */
export function estimateRows(items: EstimateSovItem[], pricePerLaborHour: number): EstimateRow[] {
  return items
    .filter((it) => !it.rowType || it.rowType === 'item')
    .map((it) => {
      const unitHours = toNum(it.laborMen) * toNum(it.laborHours);
      return {
        item: (it.item ?? '').trim(),
        quantity: toNum(it.quantity),
        unitHours,
        unitPrice: round2(pricePerLaborHour * unitHours),
      };
    })
    .filter((row) => row.item !== '' || row.quantity > 0);
}

/** Rows of a simple estimate, where each line carries its own price instead of labor hours. */
export function simpleEstimateRows(
  items: { item?: string; quantity?: unknown; price?: unknown }[],
  markup: unknown,
): EstimateRow[] {
  const factor = toNum(markup) > 0 ? toNum(markup) : 1;
  return items
    .filter((li) => (li.item ?? '').trim() !== '')
    .map((li) => ({
      item: (li.item ?? '').trim(),
      quantity: toNum(li.quantity) || 1,
      unitHours: 0,
      unitPrice: round2(toNum(li.price) * factor),
    }));
}

export const estimateTotal = (option: EstimateOption): number =>
  option.rows.reduce((sum, row) => sum + row.quantity * row.unitPrice, 0);

/**
 * Adds the rows of the picked estimates to an SOV. Rows with the same name combine:
 * quantities and hours add up, and $ each becomes the blended price so the line's dollars
 * still equal what the estimates quoted.
 */
export function addEstimatesToLines(
  jobId: string,
  lines: SovLine[],
  options: EstimateOption[],
  makeId: () => string,
  /** How many times the scope repeats (reserve blocks). Quantities and hours are multiplied. */
  times = 1,
): SovLine[] {
  const next = lines.map((line) => ({ ...line }));
  const n = times > 0 ? times : 1;

  for (const option of options) {
    // Mobilization gets its own line. The baked-in part already sits inside the row
    // prices, so take it back out of them; the added part is on top of the price.
    const mob = option.mobilization;
    const rowsTotal = option.rows.reduce((sum, row) => sum + row.quantity * row.unitPrice, 0);
    const baked = mob ? Math.max(0, mob.total - mob.added) : 0;
    const priceFactor = baked > 0 && rowsTotal > baked ? (rowsTotal - baked) / rowsTotal : 1;

    for (const row of option.rows) {
      const key = nameKey(row.item);
      const rowQty = row.quantity * n;
      const rowPrice = round2(row.unitPrice * priceFactor);
      const hours = round2(rowQty * row.unitHours);
      // Change Order lines stay in their own group: never fold an estimate row into them
      const existing = key
        ? next.find(
            (line) =>
              isOriginalLine(line) && (line.line_type ?? 'scope') === 'scope' && nameKey(line.item) === key,
          )
        : undefined;

      if (!existing) {
        next.push({
          id: makeId(),
          job_id: jobId,
          sort_order: next.length,
          item: row.item,
          quantity: rowQty,
          total_hours: hours,
          unit_price: rowPrice,
          report_slugs: [],
          source_estimate_ids: [option.id],
          line_type: 'scope',
          multiplier: n,
        });
        continue;
      }

      if ((existing.multiplier ?? 1) !== n) existing.multiplier = 1;
      const row2 = { quantity: rowQty, unitPrice: rowPrice };
      const quantity = existing.quantity + row2.quantity;
      if (quantity > 0) {
        existing.unit_price = round2(
          (existing.quantity * existing.unit_price + row2.quantity * row2.unitPrice) / quantity,
        );
      }
      existing.quantity = quantity;
      existing.total_hours = round2(existing.total_hours + hours);
      if (!existing.source_estimate_ids.includes(option.id)) {
        existing.source_estimate_ids = [...existing.source_estimate_ids, option.id];
      }
    }

    if (mob && mob.total > 0) {
      const amount = round2(mob.total * n);
      const mobLine = next.find((line) => isOriginalLine(line) && line.line_type === 'mobilization');
      if (mobLine) {
        mobLine.unit_price = round2(mobLine.quantity * mobLine.unit_price + amount);
        mobLine.quantity = 1;
        if (!mobLine.source_estimate_ids.includes(option.id)) {
          mobLine.source_estimate_ids = [...mobLine.source_estimate_ids, option.id];
        }
      } else {
        next.push({
          id: makeId(),
          job_id: jobId,
          sort_order: next.length,
          item: MOBILIZATION_ITEM,
          quantity: 1,
          total_hours: 0,
          unit_price: amount,
          report_slugs: [],
          source_estimate_ids: [option.id],
          line_type: 'mobilization',
          multiplier: 1,
        });
      }
    }
  }

  return next;
}

/** What the SOV needs to know about one Change Order. */
export interface ChangeOrderForSov {
  id: string;
  number: number;
  title: string;
  /** What the customer approved */
  amount: number;
}

/**
 * The SOV lines for one approved Change Order, copied from its estimate sheet. Prices are
 * scaled so the lines add up to the approved amount: that is what gets billed. With no
 * usable estimate (a quick priced Change Order, or a credit) it is one line for the amount.
 */
export function changeOrderLines(
  jobId: string,
  co: ChangeOrderForSov,
  option: EstimateOption | null,
  makeId: () => string,
): SovLine[] {
  let lines = option && co.amount >= 0 ? addEstimatesToLines(jobId, [], [option], makeId) : [];
  const total = sovTotal(lines);

  if (lines.length === 0 || total <= 0) {
    lines = [
      {
        id: makeId(),
        job_id: jobId,
        sort_order: 0,
        item: co.title.trim() || `Change Order ${String(co.number).padStart(3, '0')}`,
        quantity: 1,
        total_hours: 0,
        unit_price: round2(co.amount),
        report_slugs: [],
        source_estimate_ids: option ? [option.id] : [],
        line_type: 'scope',
        multiplier: 1,
      },
    ];
  } else if (co.amount > 0 && Math.abs(total - co.amount) >= 0.01) {
    const factor = co.amount / total;
    lines = lines.map((line) => ({ ...line, unit_price: round2(line.unit_price * factor) }));
  }

  return lines.map((line) => ({ ...line, change_order_id: co.id }));
}

/** Every line of the group is done. With nothing to count, it is not done. */
export function linesComplete(lines: SovLine[], progress: SovProgress): boolean {
  const counted = lines.filter((line) => line.quantity > 0);
  return counted.length > 0 && counted.every((line) => lineDone(progress, line.id) >= line.quantity);
}

export interface GeneralConditions {
  monthly: number;
  months: number;
  /** true: take it out of the scope lines so the SOV total stays the same */
  fromPrice: boolean;
}

/**
 * Puts general conditions on the SOV as one line (months x monthly amount), replacing
 * any earlier one. With fromPrice, the scope lines give up that amount in proportion,
 * so the total still matches the contract. The earlier setting is undone first, so
 * applying twice never takes it out twice. Mobilization lines are left alone.
 */
export function applyGeneralConditions(
  jobId: string,
  lines: SovLine[],
  previous: GeneralConditions | null,
  next: GeneralConditions | null,
  makeId: () => string,
): SovLine[] {
  // Change Orders are priced on their own, so general conditions never come out of them
  const isScope = (line: SovLine) => isOriginalLine(line) && (line.line_type ?? 'scope') === 'scope';
  const scopeTotal = (list: SovLine[]) =>
    list.filter(isScope).reduce((sum, line) => sum + line.quantity * line.unit_price, 0);
  const scale = (list: SovLine[], factor: number) =>
    list.map((line) => (isScope(line) ? { ...line, unit_price: round2(line.unit_price * factor) } : line));

  let out = lines.filter((line) => line.line_type !== 'general_conditions').map((line) => ({ ...line }));

  // Give back what the earlier general conditions took out
  const before = previous && previous.fromPrice ? previous.monthly * previous.months : 0;
  const nowScope = scopeTotal(out);
  if (before > 0 && nowScope > 0) out = scale(out, (nowScope + before) / nowScope);

  if (!next || next.monthly <= 0 || next.months <= 0) return out;

  const amount = next.monthly * next.months;
  const scope = scopeTotal(out);
  if (next.fromPrice && scope > amount) out = scale(out, (scope - amount) / scope);

  return [
    {
      id: makeId(),
      job_id: jobId,
      sort_order: 0,
      item: GENERAL_CONDITIONS_ITEM,
      quantity: next.months,
      total_hours: 0,
      unit_price: round2(next.monthly),
      report_slugs: [],
      source_estimate_ids: [],
      line_type: 'general_conditions',
      multiplier: 1,
    },
    ...out,
  ].map((line, i) => ({ ...line, sort_order: i }));
}

/**
 * Items that show up in more than one of these estimates. Usually a double count: one
 * sheet is a revision of another, or already the sum of two others.
 */
export function estimateOverlaps(options: EstimateOption[]): EstimateOverlap[] {
  const byName = new Map<string, EstimateOverlap>();

  for (const option of options) {
    const inThisOne = new Map<string, { item: string; quantity: number }>();
    for (const row of option.rows) {
      const key = nameKey(row.item);
      if (!key) continue;
      const seen = inThisOne.get(key);
      inThisOne.set(key, { item: row.item, quantity: (seen?.quantity ?? 0) + row.quantity });
    }
    for (const [key, { item, quantity }] of inThisOne) {
      const overlap = byName.get(key) ?? { item, parts: [], total: 0 };
      overlap.parts.push({ title: option.title, quantity });
      overlap.total += quantity;
      byName.set(key, overlap);
    }
  }

  return [...byName.values()].filter((overlap) => overlap.parts.length > 1);
}

// ---------------------------------------------------------------------------
// Progress
// ---------------------------------------------------------------------------

/** Buckets sent reports by SOV line and by the month they were sent. */
export function computeProgress(
  lines: SovLine[],
  reports: SentReport[],
  /** Bucket for each sent report: its month by default, or its week */
  bucket: (sentAt: string) => string = monthKey,
): SovProgress {
  const lineForSlug = new Map<string, string>();
  for (const line of lines) {
    for (const slug of line.report_slugs) {
      if (!lineForSlug.has(slug)) lineForSlug.set(slug, line.id);
    }
  }

  const progress: SovProgress = { qty: {}, unmatched: {} };
  for (const report of reports) {
    const lineId = lineForSlug.get(report.slug);
    if (!lineId) {
      progress.unmatched[report.slug] = (progress.unmatched[report.slug] ?? 0) + 1;
      continue;
    }
    const key = bucket(report.sent_at);
    const byKey = (progress.qty[lineId] ??= {});
    byKey[key] = (byKey[key] ?? 0) + 1;
  }
  return progress;
}

/** One saved weekly update: the PM's numbers for each line that week. */
export interface SavedWeek {
  id: string;
  status: 'draft' | 'approved';
  /** line id -> units done that week */
  quantities: Record<string, number>;
  wip_amount: number | null;
  hours: number | null;
  approved_at: string | null;
}

/** week (YYYY-MM-DD Sunday) -> saved update */
export type SavedWeeks = Record<string, SavedWeek>;

/** General conditions bill once a month from the start month, for this many months. */
export interface GcSchedule {
  start: string | null;
  months: number | null;
}

/**
 * Units per line per week. Weeks the PM saved use their numbers (typed wins); other
 * weeks use sent reports as the suggestion.
 */
export function weeklyQuantities(
  lines: SovLine[],
  reports: SentReport[],
  saved: SavedWeeks = {},
): Record<string, Record<string, number>> {
  const fromReports = computeProgress(lines, reports, weekKey).qty;
  const out: Record<string, Record<string, number>> = {};
  for (const line of lines) {
    const byWeek: Record<string, number> = { ...(fromReports[line.id] ?? {}) };
    for (const [week, update] of Object.entries(saved)) byWeek[week] = update.quantities[line.id] ?? 0;
    out[line.id] = byWeek;
  }
  return out;
}

/**
 * Progress by month, built from the weekly numbers: saved weeks win, sent reports fill
 * the rest, and each week lands in the month of its Wednesday. General conditions
 * count one per month from their start, up to this month and no more than planned.
 */
export function mergedProgress(
  lines: SovLine[],
  reports: SentReport[],
  saved: SavedWeeks = {},
  gc?: GcSchedule | null,
): SovProgress {
  const weekly = weeklyQuantities(lines, reports, saved);
  const qty: SovProgress['qty'] = {};
  const thisMonth = monthKey(new Date());

  for (const line of lines) {
    const byMonth: Record<string, number> = {};
    if (line.line_type === 'general_conditions') {
      const months = Math.min(gc?.months ?? 0, line.quantity || 0);
      if (gc?.start && months > 0) {
        const first = gc.start.slice(0, 7);
        for (let i = 0; i < months; i++) {
          const m = shiftMonth(first, i);
          if (m > thisMonth) break;
          byMonth[m] = 1;
        }
      }
    } else {
      for (const [week, n] of Object.entries(weekly[line.id] ?? {})) {
        if (!n) continue;
        const m = weekMonth(week);
        byMonth[m] = (byMonth[m] ?? 0) + n;
      }
    }
    if (Object.keys(byMonth).length) qty[line.id] = byMonth;
  }

  return { qty, unmatched: computeProgress(lines, reports).unmatched };
}

export const lineDone = (progress: SovProgress, lineId: string): number =>
  Object.values(progress.qty[lineId] ?? {}).reduce((sum, n) => sum + n, 0);

export const sovTotal = (lines: SovLine[]): number =>
  lines.reduce((sum, line) => sum + line.quantity * line.unit_price, 0);

export const sovHours = (lines: SovLine[]): number =>
  lines.reduce((sum, line) => sum + line.total_hours, 0);

/** Dollars earned in one month: units sent that month times $ each. */
export const monthDollars = (lines: SovLine[], progress: SovProgress, month: string): number =>
  lines.reduce((sum, line) => sum + (progress.qty[line.id]?.[month] ?? 0) * line.unit_price, 0);

export const unmatchedCount = (progress: SovProgress): number =>
  Object.values(progress.unmatched).reduce((sum, n) => sum + n, 0);

/** A share from 0 to 1, or null when there is nothing to divide by. */
export const pct = (part: number, whole: number): number | null =>
  whole > 0 ? Math.min(Math.max(part / whole, 0), 1) : null;

/**
 * Share of the job that is done. Weighted by dollars so it lines up with Billed %.
 * Each line stops at its own quantity: extra breakers do not finish the transformers.
 * Falls back to a plain unit count when the SOV has no prices.
 */
export function completedPct(allLines: SovLine[], progress: SovProgress): number | null {
  // Work done is measured on scope lines. General conditions and mobilization bill on
  // their own schedule, not by sent reports, so they'd hold the bar below 100%.
  const lines = allLines.filter((line) => (line.line_type ?? 'scope') === 'scope');
  const done = (line: SovLine) => Math.min(lineDone(progress, line.id), line.quantity);
  const total = sovTotal(lines);
  if (total > 0) {
    return pct(lines.reduce((sum, line) => sum + done(line) * line.unit_price, 0), total);
  }
  return pct(
    lines.reduce((sum, line) => sum + done(line), 0),
    lines.reduce((sum, line) => sum + line.quantity, 0),
  );
}

export const totalHours = (hoursByMonth: Record<string, number>): number =>
  Object.values(hoursByMonth).reduce((sum, h) => sum + h, 0);

// ---------------------------------------------------------------------------
// Pay application (the AIA-style SOV printout)
// ---------------------------------------------------------------------------

const cents = (n: number): number => Math.round(n * 100) / 100;

export interface PayAppRow {
  line: SovLine;
  scheduled: number;
  /** Billed in months before this one */
  previous: number;
  thisPeriod: number;
  /** previous + thisPeriod */
  completed: number;
  /** completed / scheduled; null when the line has no value */
  pct: number | null;
  balance: number;
  retainage: number;
}

export interface PayApp {
  rows: PayAppRow[];
  /** Scheduled value of the original contract lines */
  originalContract: number;
  /** Scheduled value of the Change Order lines */
  changeOrders: number;
  contractToDate: number;
  previous: number;
  thisPeriod: number;
  completed: number;
  retainage: number;
  /** Retainage on the work billed before this month */
  previousRetainage: number;
  /** completed - retainage */
  earnedLessRetainage: number;
  /** What was due on earlier applications: previous - previousRetainage */
  previousCertificates: number;
  /** earnedLessRetainage - previousCertificates */
  currentDue: number;
  /** contractToDate - earnedLessRetainage */
  balanceWithRetainage: number;
  /** Months with billing before this one, plus this one */
  applicationNumber: number;
}

/**
 * One month's pay application from the SOV: per line, what was billed before, this
 * month, to date, what's left and what the customer holds back.
 */
export function payApplication(
  lines: SovLine[],
  progress: SovProgress,
  month: string,
  retainagePct: number,
): PayApp {
  const rate = Math.max(0, Math.min(100, retainagePct || 0)) / 100;
  const priorMonths = new Set<string>();

  const rows = lines.map((line): PayAppRow => {
    const byMonth = progress.qty[line.id] ?? {};
    let prevUnits = 0;
    for (const [m, n] of Object.entries(byMonth)) {
      if (m < month && n) {
        prevUnits += n;
        priorMonths.add(m);
      }
    }
    const scheduled = cents(line.quantity * line.unit_price);
    const previous = cents(prevUnits * line.unit_price);
    const thisPeriod = cents((byMonth[month] ?? 0) * line.unit_price);
    const completed = cents(previous + thisPeriod);
    return {
      line,
      scheduled,
      previous,
      thisPeriod,
      completed,
      pct: scheduled ? completed / scheduled : null,
      balance: cents(scheduled - completed),
      retainage: cents(completed * rate),
    };
  });

  const sum = (pick: (r: PayAppRow) => number, only?: (r: PayAppRow) => boolean) =>
    cents(rows.filter(only ?? (() => true)).reduce((s, r) => s + pick(r), 0));

  const originalContract = sum((r) => r.scheduled, (r) => isOriginalLine(r.line));
  const changeOrders = sum((r) => r.scheduled, (r) => !isOriginalLine(r.line));
  const contractToDate = cents(originalContract + changeOrders);
  const previous = sum((r) => r.previous);
  const thisPeriod = sum((r) => r.thisPeriod);
  const completed = sum((r) => r.completed);
  // Taken on the totals, the same way as previous retainage, so no stray cents
  const retainage = cents(completed * rate);
  const previousRetainage = cents(previous * rate);
  const earnedLessRetainage = cents(completed - retainage);
  const previousCertificates = cents(previous - previousRetainage);

  return {
    rows,
    originalContract,
    changeOrders,
    contractToDate,
    previous,
    thisPeriod,
    completed,
    retainage,
    previousRetainage,
    earnedLessRetainage,
    previousCertificates,
    currentDue: cents(earnedLessRetainage - previousCertificates),
    balanceWithRetainage: cents(contractToDate - earnedLessRetainage),
    applicationNumber: priorMonths.size + 1,
  };
}
