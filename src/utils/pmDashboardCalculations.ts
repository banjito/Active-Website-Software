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
  /** scope (estimate rows or typed in), general_conditions, mobilization, or bond */
  line_type?: SovLineType;
  /** Times the estimate scope repeats. Quantity already includes it; shown as "10 x 6". */
  multiplier?: number;
  /** The Change Order this line bills. Null or missing: part of the original contract. */
  change_order_id?: string | null;
  /** Area of the job this line sits under (an estimate section). Null or missing: none. */
  section?: string | null;
}

/** True for lines from the original contract, false for Change Order lines. */
export const isOriginalLine = (line: SovLine): boolean => !line.change_order_id;

export type SovLineType = 'scope' | 'general_conditions' | 'mobilization' | 'bond';

export const GENERAL_CONDITIONS_ITEM = 'General conditions';
export const MOBILIZATION_ITEM = 'Mobilization';
export const BOND_ITEM = 'Bond';

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
  /** Heading the row sits under on the estimate and the letter */
  section?: string | null;
}

/** How long the customer has to pay. Longer terms cost more. */
export type NetTerm = 'net30' | 'net60' | 'net90';

export const NET_TERMS: { key: NetTerm; label: string }[] = [
  { key: 'net30', label: 'NET 30' },
  { key: 'net60', label: 'NET 60' },
  { key: 'net90', label: 'NET 90' },
];

/** One estimate sheet on the job's quote. A quote can hold several: change orders, options, revisions. */
export interface EstimateOption {
  id: string;
  title: string;
  updated_at: string;
  status: string | null;
  rows: EstimateRow[];
  /** What the rows add up to on the letter, before cents rounding on each price */
  rowsTotal?: number;
  /** Terms the rows are priced at. Missing on a simple estimate, which has one price. */
  term?: NetTerm;
  /** The same rows priced at each term */
  byTerm?: Record<NetTerm, { rows: EstimateRow[]; rowsTotal?: number }>;
  /** Naming mistakes to fix on the estimate before copying it */
  warnings?: string[];
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
    // Same item in several areas: one area would claim every area's reports
    if (line && !repeatsAcrossAreas(lines, line)) picked.set(line.id, [...(picked.get(line.id) ?? []), slug]);
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

const areaKey = (line: { section?: string | null }): string => nameKey(line.section ?? '');

/** The line's name with its area in front, for lists that have no area headings. */
export const lineLabel = (line: Pick<SovLine, 'item' | 'section'>, unnamed = 'Unnamed line'): string => {
  const item = line.item || unnamed;
  return line.section ? `${line.section}: ${item}` : item;
};

/** True when the same item is on the SOV under another area too. */
export const repeatsAcrossAreas = (lines: SovLine[], line: SovLine): boolean =>
  !!areaKey(line) &&
  lines.some(
    (other) =>
      !!areaKey(other) && areaKey(other) !== areaKey(line) && nameKey(other.item) === nameKey(line.item),
  );

export interface SovArea {
  /** Heading to show. Null: no heading (mobilization, general conditions, or no areas at all) */
  label: string | null;
  /** Area new lines in this group belong to */
  section: string | null;
  lines: SovLine[];
}

/**
 * Splits lines into areas, in the order the areas first show up. Mobilization and general
 * conditions go on top, and lines with no area go last as "Other". With no areas at all it
 * is one group in the order given. Pass original lines or one Change Order's, not a mix.
 */
export function groupByArea(lines: SovLine[]): SovArea[] {
  if (!lines.some(areaKey)) return lines.length ? [{ label: null, section: null, lines }] : [];

  const top: SovLine[] = [];
  const other: SovLine[] = [];
  const areas = new Map<string, SovArea>();
  for (const line of lines) {
    const key = areaKey(line);
    if (key) {
      const area = areas.get(key) ?? { label: line.section!.trim(), section: line.section!.trim(), lines: [] };
      area.lines.push(line);
      areas.set(key, area);
    } else if ((line.line_type ?? 'scope') === 'scope') other.push(line);
    else top.push(line);
  }

  return [
    { label: null, section: null, lines: top },
    ...areas.values(),
    { label: 'Other', section: null, lines: other },
  ].filter((area) => area.lines.length > 0);
}

/** Lines in the order the SOV shows them. */
export const sortByArea = (lines: SovLine[]): SovLine[] => groupByArea(lines).flatMap((area) => area.lines);

/**
 * Item rows of a full estimate, each with the heading it sits under (blank rows dropped).
 * A row's price is its labor unit times the estimate's dollars per labor hour, the sheet's
 * "SOV item price".
 */
export function estimateRows(items: EstimateSovItem[], pricePerLaborHour: number): EstimateRow[] {
  const rows: EstimateRow[] = [];
  let section = '';
  let subsection = '';
  for (const it of items) {
    const item = (it.item ?? '').trim();
    if (it.rowType === 'section') {
      section = item;
      subsection = '';
      continue;
    }
    if (it.rowType === 'subsection') {
      subsection = item;
      continue;
    }
    if (it.rowType && it.rowType !== 'item') continue;

    const quantity = toNum(it.quantity);
    if (item === '' && quantity <= 0) continue;
    const unitHours = toNum(it.laborMen) * toNum(it.laborHours);
    rows.push({
      item,
      quantity,
      unitHours,
      unitPrice: round2(pricePerLaborHour * unitHours),
      section: [section, subsection].filter(Boolean).join(' · ') || null,
    });
  }
  return rows;
}

/**
 * What these estimates cost on top of their NET 30 price at other terms. The quote's amount
 * is always the NET 30 letter price, so this is what the contract grows by at NET 60 or 90.
 * Null term: each estimate at the term it was copied at.
 */
export function termAdjustment(options: EstimateOption[], term: NetTerm | null): number {
  let sum = 0;
  for (const option of options) {
    const at = term ?? option.term;
    if (!option.byTerm || !at) continue;
    sum += (option.byTerm[at].rowsTotal ?? 0) - (option.byTerm.net30.rowsTotal ?? 0);
  }
  return round2(sum);
}

/** The estimate priced at these terms. Null, or a simple estimate: as it is. */
export const atTerm = (option: EstimateOption, term: NetTerm | null): EstimateOption =>
  term && option.byTerm ? { ...option, term, ...option.byTerm[term] } : option;

/**
 * Naming mistakes that make a confusing SOV: two areas with the same name (they would
 * combine), and items named like an area.
 */
export function estimateNameWarnings(items: EstimateSovItem[]): string[] {
  const headings = new Map<string, { name: string; count: number }>();
  const named = new Map<string, number>();
  let section = '';
  let subsection = '';
  let pending = false;

  const addHeading = () => {
    const name = [section, subsection].filter(Boolean).join(' · ');
    const seen = headings.get(nameKey(name));
    headings.set(nameKey(name), { name: seen?.name ?? name, count: (seen?.count ?? 0) + 1 });
  };

  for (const it of items) {
    const item = (it.item ?? '').trim();
    if (it.rowType === 'section' || it.rowType === 'subsection') {
      if (it.rowType === 'section') {
        section = item;
        subsection = '';
      } else subsection = item;
      pending = !!(section || subsection);
    } else if ((!it.rowType || it.rowType === 'item') && item) {
      // A heading counts once it has a row under it
      if (pending) addHeading();
      pending = false;
      named.set(nameKey(item), (named.get(nameKey(item)) ?? 0) + 1);
    }
  }

  const warnings: string[] = [];
  for (const [key, { name, count }] of headings) {
    if (count > 1) warnings.push(`${count} areas are named "${name}". They would combine into one.`);
    const rows = named.get(key);
    if (rows) warnings.push(`${rows} item${rows === 1 ? ' is' : 's are'} named "${name}", the same as an area.`);
  }
  return warnings;
}

/**
 * One price per item name across the areas of an estimate, so the customer sees the same
 * $ each everywhere. An estimate with no areas is left alone: its same-name rows combine.
 */
function blendAcrossAreas(rows: EstimateRow[]): EstimateRow[] {
  if (!rows.some((row) => row.section)) return rows;
  const totals = new Map<string, { quantity: number; dollars: number }>();
  for (const row of rows) {
    const key = nameKey(row.item);
    const sum = totals.get(key) ?? { quantity: 0, dollars: 0 };
    sum.quantity += row.quantity;
    sum.dollars += row.quantity * row.unitPrice;
    totals.set(key, sum);
  }
  return rows.map((row) => {
    const sum = totals.get(nameKey(row.item))!;
    return nameKey(row.item) && sum.quantity > 0
      ? { ...row, unitPrice: round2(sum.dollars / sum.quantity) }
      : row;
  });
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
  option.rowsTotal ?? option.rows.reduce((sum, row) => sum + row.quantity * row.unitPrice, 0);

const lineDollars = (line: SovLine): number => line.quantity * line.unit_price;

/**
 * Prices are whole cents, so a line of 1,800 can be dollars off what it should be. Puts what
 * that lost (`short`) on the biggest of these lines, the last one in a tie. Changes the line.
 */
function absorbRounding(lines: SovLine[], short: number): void {
  let biggest: SovLine | null = null;
  for (const line of lines) {
    if (lineDollars(line) > 0 && (!biggest || lineDollars(line) >= lineDollars(biggest))) biggest = line;
  }
  if (!biggest || Math.abs(short) < 0.005) return;
  const price = biggest.unit_price + short / biggest.quantity;
  if (price > 0) biggest.unit_price = Math.round(price * 1e8) / 1e8;
}

/** Multiplies these lines' prices so they add up to `target` to the cent. Changes the lines. */
function scaleTo(lines: SovLine[], target: number): void {
  const total = sovTotal(lines);
  if (total <= 0 || target <= 0) return;
  for (const line of lines) line.unit_price = round2(line.unit_price * (target / total));
  absorbRounding(lines, target - sovTotal(lines));
}

/**
 * Adds the rows of the picked estimates to an SOV, one line per item per area. Rows with
 * the same name in the same area combine: quantities and hours add up, and $ each becomes
 * the blended price. The biggest line takes the cents each price lost to rounding, so the
 * dollars equal what the estimates quoted.
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
    const totalBefore = sovTotal(next);
    const touched = new Set<SovLine>();

    for (const row of blendAcrossAreas(option.rows)) {
      const key = nameKey(row.item);
      const rowQty = row.quantity * n;
      const rowPrice = round2(row.unitPrice * priceFactor);
      const hours = round2(rowQty * row.unitHours);
      // Change Order lines stay in their own group: never fold an estimate row into them
      const existing = key
        ? next.find(
            (line) =>
              isOriginalLine(line) &&
              (line.line_type ?? 'scope') === 'scope' &&
              nameKey(line.item) === key &&
              areaKey(line) === areaKey(row),
          )
        : undefined;

      if (!existing) {
        const added: SovLine = {
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
          section: row.section ?? null,
        };
        next.push(added);
        touched.add(added);
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
      touched.add(existing);
    }

    if (option.rowsTotal != null) {
      const target = round2((option.rowsTotal - (priceFactor < 1 ? baked : 0)) * n);
      absorbRounding([...touched], target - (sovTotal(next) - totalBefore));
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

  if (!next.some(areaKey)) return next;
  return [...sortByArea(next.filter(isOriginalLine)), ...next.filter((line) => !isOriginalLine(line))].map(
    (line, i) => ({ ...line, sort_order: i }),
  );
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
    scaleTo(lines, co.amount);
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
 * applying twice never takes it out twice. Mobilization and bond lines are left alone.
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

  const out = lines.filter((line) => line.line_type !== 'general_conditions').map((line) => ({ ...line }));

  // Give back what the earlier general conditions took out
  const before = previous && previous.fromPrice ? round2(previous.monthly) * previous.months : 0;
  const scopeLines = out.filter(isScope);
  if (before > 0) scaleTo(scopeLines, sovTotal(scopeLines) + before);

  if (!next || next.monthly <= 0 || next.months <= 0) return out;

  const amount = round2(next.monthly) * next.months;
  const scope = sovTotal(scopeLines);
  if (next.fromPrice && scope > amount) scaleTo(scopeLines, scope - amount);

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
 * What a general conditions percent is taken of: the original contract, without the bond
 * (it goes on top). General conditions already on the SOV count only when they came out of
 * the other lines, so the answer is the same before and after they are applied.
 */
export const generalConditionsBase = (lines: SovLine[], applied: GeneralConditions | null): number =>
  round2(
    sovTotal(
      lines.filter(
        (line) =>
          isOriginalLine(line) &&
          line.line_type !== 'bond' &&
          (line.line_type !== 'general_conditions' || !!applied?.fromPrice),
      ),
    ),
  );

/** One month of general conditions at a percent of the contract. */
export const monthlyFromPercent = (base: number, percent: number, months: number): number =>
  months > 0 ? round2((base * percent) / 100 / months) : 0;

export const isBondLine = (line: SovLine): boolean => isOriginalLine(line) && line.line_type === 'bond';

/** Puts the bond on the SOV as one line on top of the contract, or takes it off at 0. */
export function applyBond(jobId: string, lines: SovLine[], amount: number, makeId: () => string): SovLine[] {
  const bond = lines.find(isBondLine);
  if (!(amount > 0)) return bond ? lines.filter((line) => !isBondLine(line)) : lines;
  const price = round2(amount);
  if (bond) return lines.map((line) => (line === bond ? { ...line, quantity: 1, unit_price: price } : line));

  const line: SovLine = {
    id: makeId(),
    job_id: jobId,
    sort_order: 0,
    item: BOND_ITEM,
    quantity: 1,
    total_hours: 0,
    unit_price: price,
    report_slugs: [],
    source_estimate_ids: [],
    line_type: 'bond',
    multiplier: 1,
  };
  // Right after mobilization, or at the end of the original lines
  const mob = lines.findIndex((l) => isOriginalLine(l) && l.line_type === 'mobilization');
  const at = mob >= 0 ? mob + 1 : lines.filter(isOriginalLine).length;
  return [...lines.slice(0, at), line, ...lines.slice(at)].map((l, i) => ({ ...l, sort_order: i }));
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

/** A line's name on the pay application: "Busplug Fused Disconnect (1800)". */
export function payAppLabel(line: SovLine): string {
  const item = line.item || 'Untitled line';
  if ((line.line_type ?? 'scope') !== 'scope' || line.quantity <= 1) return item;
  const qty = `(${round2(line.quantity)})`;
  return item.replace(/[\s,]/g, '').endsWith(qty) ? item : `${item} ${qty}`;
}

/** Pay application rows split into areas. Pass original rows or one Change Order's. */
export function payAppAreas(rows: PayAppRow[]): { label: string | null; rows: PayAppRow[] }[] {
  const byId = new Map(rows.map((row) => [row.line.id, row]));
  return groupByArea(rows.map((row) => row.line)).map((area) => ({
    label: area.label,
    rows: area.lines.map((line) => byId.get(line.id)!),
  }));
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
