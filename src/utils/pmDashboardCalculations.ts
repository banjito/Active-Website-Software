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
}

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
): SovLine[] {
  const next = lines.map((line) => ({ ...line }));

  for (const option of options) {
    for (const row of option.rows) {
      const key = nameKey(row.item);
      const hours = round2(row.quantity * row.unitHours);
      const existing = key ? next.find((line) => nameKey(line.item) === key) : undefined;

      if (!existing) {
        next.push({
          id: makeId(),
          job_id: jobId,
          sort_order: next.length,
          item: row.item,
          quantity: row.quantity,
          total_hours: hours,
          unit_price: row.unitPrice,
          report_slugs: [],
          source_estimate_ids: [option.id],
        });
        continue;
      }

      const quantity = existing.quantity + row.quantity;
      if (quantity > 0) {
        existing.unit_price = round2(
          (existing.quantity * existing.unit_price + row.quantity * row.unitPrice) / quantity,
        );
      }
      existing.quantity = quantity;
      existing.total_hours = round2(existing.total_hours + hours);
      if (!existing.source_estimate_ids.includes(option.id)) {
        existing.source_estimate_ids = [...existing.source_estimate_ids, option.id];
      }
    }
  }

  return next;
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
export function computeProgress(lines: SovLine[], reports: SentReport[]): SovProgress {
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
    const month = monthKey(report.sent_at);
    const byMonth = (progress.qty[lineId] ??= {});
    byMonth[month] = (byMonth[month] ?? 0) + 1;
  }
  return progress;
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
export function completedPct(lines: SovLine[], progress: SovProgress): number | null {
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
