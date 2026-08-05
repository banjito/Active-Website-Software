import {
  TERMINAL_TESTING_STATUSES,
  addCalendarDays,
  formatScheduleDate,
  fromISO,
  getScheduleState,
  toISO,
  workingDaysBetween,
  type ScheduledTestRow,
} from "@/lib/types/testScheduling";

// The four ways a PM looks at the same set of scheduled tests, plus the grouping that
// makes each of them readable. Kept out of the table component because these are rules
// about the work, not about rendering.

export type SortKey =
  | "substation"
  | "identifier"
  | "part_of"
  | "work"
  | "start_date"
  | "finish_date"
  | "equipment_status"
  | "testing_status"
  | "result";

export type GroupBy =
  | "none"
  | "due_bucket"
  | "week"
  | "equipment_type"
  | "substation"
  | "building_area";

export const GROUP_BY_LABELS: Record<GroupBy, string> = {
  none: "No grouping",
  due_bucket: "When it's due",
  week: "Week",
  equipment_type: "Equipment type",
  substation: "Substation",
  building_area: "Building / area",
};

/**
 * A scope that a preset view applies on top of the ordinary column filters. Separate from
 * them so switching views doesn't wipe out a substation the user picked.
 */
export type StateScope = "all" | "due_and_late" | "ready";

export interface TrackerViewState {
  substation: string;
  testing: string;
  equipment: string;
  result: string;
  showCompleted: boolean;
  stateScope: StateScope;
  sortKey: SortKey;
  sortAsc: boolean;
  groupBy: GroupBy;
}

export interface TrackerView extends TrackerViewState {
  id: string;
  label: string;
  hint: string;
  /** User-saved views are editable and deletable; presets are not. */
  custom?: boolean;
}

const NEUTRAL_FILTERS = {
  substation: "all",
  testing: "all",
  equipment: "all",
  result: "all",
};

/**
 * The four preset views.
 *
 * "Due & past due" is first and is what the tab opens to. It's the Monday-morning
 * question — what's late and what's this week — and anything else being the landing view
 * means someone has to filter their way to it every single time.
 */
export const PRESET_VIEWS: TrackerView[] = [
  {
    id: "due",
    label: "Due & Past Due",
    hint: "What's late and what's happening in the next two weeks.",
    ...NEUTRAL_FILTERS,
    showCompleted: false,
    stateScope: "due_and_late",
    sortKey: "finish_date",
    sortAsc: true,
    groupBy: "due_bucket",
  },
  {
    id: "ready",
    label: "Ready for Testing",
    hint: "Equipment that's installed and waiting — what you can put a crew on now.",
    ...NEUTRAL_FILTERS,
    showCompleted: false,
    stateScope: "ready",
    sortKey: "start_date",
    sortAsc: true,
    groupBy: "substation",
  },
  {
    id: "schedule",
    label: "Schedule",
    hint: "Everything in date order, week by week. Mirrors the customer's export.",
    ...NEUTRAL_FILTERS,
    showCompleted: true,
    stateScope: "all",
    sortKey: "start_date",
    sortAsc: true,
    groupBy: "week",
  },
  {
    id: "equipment",
    label: "By Equipment",
    hint: "How many of each kind are left, and when the next one is due.",
    ...NEUTRAL_FILTERS,
    showCompleted: true,
    stateScope: "all",
    sortKey: "identifier",
    sortAsc: true,
    groupBy: "equipment_type",
  },
];

// ── Due buckets ───────────────────────────────────────────────────────────────

export type DueBucket = "past_due" | "this_week" | "next_week" | "later" | "unscheduled";

const DUE_BUCKET_LABELS: Record<DueBucket, string> = {
  past_due: "Past Due",
  this_week: "Due This Week",
  next_week: "Due Next Week",
  later: "Later",
  unscheduled: "No dates set",
};

/** Monday of the week containing `iso`. ISO weeks, matching how the P6 export groups. */
export function startOfWeek(iso: string): string {
  const date = fromISO(iso);
  const day = date.getDay();
  // getDay() is 0 for Sunday, so Sunday walks back six days rather than forward one.
  const offset = day === 0 ? -6 : 1 - day;
  date.setDate(date.getDate() + offset);
  return toISO(date);
}

export function dueBucket(row: ScheduledTestRow, today: string): DueBucket {
  const state = getScheduleState(row, today);
  if (state === "unscheduled") return "unscheduled";
  if (state === "past_due") return "past_due";

  const reference = row.finish_date || row.start_date;
  if (!reference) return "unscheduled";

  const thisWeek = startOfWeek(today);
  const nextWeek = addCalendarDays(thisWeek, 7);
  const weekAfter = addCalendarDays(thisWeek, 14);
  if (reference < nextWeek) return "this_week";
  if (reference < weekAfter) return "next_week";
  return "later";
}

/** Does this row belong in the current view's scope? Column filters run separately. */
export function matchesScope(
  row: ScheduledTestRow,
  scope: StateScope,
  today: string,
): boolean {
  if (scope === "all") return true;

  const isTerminal = TERMINAL_TESTING_STATUSES.includes(row.testing_status);
  if (scope === "ready") {
    return row.equipment_status === "ready_for_testing" && !isTerminal;
  }
  // due_and_late: everything that needs attention now or in the next fortnight.
  if (isTerminal) return false;
  return dueBucket(row, today) !== "later";
}

// ── Grouping ──────────────────────────────────────────────────────────────────

export interface TrackerGroup {
  key: string;
  label: string;
  rows: ScheduledTestRow[];
  /** Rollup shown in the header, so the answer is there before anyone expands anything. */
  stats: {
    total: number;
    complete: number;
    pastDue: number;
    /** Earliest upcoming start, for "next 12 Oct". */
    nextDate: string | null;
    /** Total working days in the group — the week headers carry this. */
    workingDays: number;
  };
}

const BUCKET_ORDER: DueBucket[] = [
  "past_due",
  "this_week",
  "next_week",
  "later",
  "unscheduled",
];

/**
 * Split rows into display groups, preserving the order they arrived in within each group
 * so the table's own sort still governs the rows.
 */
export function groupRows(
  rows: ScheduledTestRow[],
  groupBy: GroupBy,
  today: string,
): TrackerGroup[] {
  if (groupBy === "none") {
    return [{ key: "all", label: "", rows, stats: buildStats(rows, today) }];
  }

  const buckets = new Map<string, ScheduledTestRow[]>();
  for (const row of rows) {
    const key = groupKey(row, groupBy, today);
    const list = buckets.get(key) ?? [];
    list.push(row);
    buckets.set(key, list);
  }

  const groups: TrackerGroup[] = Array.from(buckets.entries()).map(([key, list]) => ({
    key,
    label: groupLabel(key, groupBy),
    rows: list,
    stats: buildStats(list, today),
  }));

  return groups.sort((a, b) => compareGroups(a, b, groupBy));
}

function groupKey(row: ScheduledTestRow, groupBy: GroupBy, today: string): string {
  switch (groupBy) {
    case "due_bucket":
      return dueBucket(row, today);
    case "week": {
      const reference = row.start_date || row.finish_date;
      return reference ? startOfWeek(reference) : "";
    }
    case "equipment_type":
      return row.equipment_type?.trim() || "";
    case "substation":
      return row.substation?.trim() || "";
    case "building_area":
      return row.building_area?.trim() || "";
    default:
      return "";
  }
}

function groupLabel(key: string, groupBy: GroupBy): string {
  if (groupBy === "due_bucket") return DUE_BUCKET_LABELS[key as DueBucket] ?? key;
  if (!key) {
    return groupBy === "week" ? "No dates set" : "Not recorded";
  }
  if (groupBy === "week") return `Week of ${formatScheduleDate(key)}`;
  return key;
}

/** Blank groups sort last; due buckets follow their own urgency order, not the alphabet. */
function compareGroups(a: TrackerGroup, b: TrackerGroup, groupBy: GroupBy): number {
  if (groupBy === "due_bucket") {
    return (
      BUCKET_ORDER.indexOf(a.key as DueBucket) - BUCKET_ORDER.indexOf(b.key as DueBucket)
    );
  }
  if (!a.key && !b.key) return 0;
  if (!a.key) return 1;
  if (!b.key) return -1;
  if (groupBy === "week") return a.key.localeCompare(b.key);
  return a.label.localeCompare(b.label);
}

function buildStats(rows: ScheduledTestRow[], today: string): TrackerGroup["stats"] {
  let complete = 0;
  let pastDue = 0;
  let nextDate: string | null = null;
  let workingDays = 0;

  for (const row of rows) {
    const state = getScheduleState(row, today);
    if (state === "complete") complete += 1;
    else if (state === "past_due") pastDue += 1;

    // "Next" means the soonest thing still ahead of us, so completed work is ignored.
    const start = row.start_date;
    if (start && state !== "complete" && start >= today) {
      if (!nextDate || start < nextDate) nextDate = start;
    }
    if (row.start_date && row.finish_date) {
      workingDays += workingDaysBetween(row.start_date, row.finish_date);
    }
  }

  return { total: rows.length, complete, pastDue, nextDate, workingDays };
}

/** "24 scheduled · 9 complete · 3 past due · next 12 Oct 2026" */
export function describeGroup(group: TrackerGroup, groupBy: GroupBy): string {
  const parts = [`${group.stats.total} scheduled`];
  if (group.stats.complete > 0) parts.push(`${group.stats.complete} complete`);
  if (group.stats.pastDue > 0) parts.push(`${group.stats.pastDue} past due`);
  if (groupBy === "week" && group.stats.workingDays > 0) {
    parts.push(`${group.stats.workingDays} working days`);
  }
  if (group.stats.nextDate) {
    parts.push(`next ${formatScheduleDate(group.stats.nextDate)}`);
  }
  return parts.join(" · ");
}

// ── User-saved views ──────────────────────────────────────────────────────────

/**
 * Custom views live in localStorage rather than the database.
 *
 * A saved view is a personal habit, not shared project data — a PM's "my halls this
 * month" means nothing to anyone else, and putting it in Postgres would mean a table, an
 * API and a sharing model for something nobody asked to share. If that changes, the shape
 * here moves across unaltered.
 */
const CUSTOM_VIEWS_KEY = "amp:tracker:custom-views";

export function loadCustomViews(siteId: string): TrackerView[] {
  try {
    const raw = window.localStorage.getItem(`${CUSTOM_VIEWS_KEY}:${siteId}`);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as TrackerView[]) : [];
  } catch {
    // Private-mode storage, or a value written by an older shape of this state.
    return [];
  }
}

export function saveCustomViews(siteId: string, views: TrackerView[]): void {
  try {
    window.localStorage.setItem(
      `${CUSTOM_VIEWS_KEY}:${siteId}`,
      JSON.stringify(views),
    );
  } catch {
    // Storage full or blocked — the view just doesn't persist. Not worth an error toast.
  }
}
