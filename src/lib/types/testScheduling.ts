// Test scheduling: Asset -> Scheduled Test -> Report.
//
// Phase 1 gave us the equipment registry (src/lib/types/assetTracking.ts) and a way to
// hang a report off a piece of equipment. A Scheduled Test is the record in between:
// this asset, this scope of work, this date window, this status. Every Project Tracker
// view is a filter over these rows.
//
// Not to be confused with src/lib/types/scheduling.ts, which is technician availability
// and job assignments — people, not equipment.
//
// Dates here are always "YYYY-MM-DD" strings, never Date objects or timestamps. A test
// schedule is discussed in whole days ("we're testing MVG-A1 the week of the 12th"), and
// a timestamp would let two people in different timezones read different days off the
// same row.

/** A built-in report slug, a custom form, or free text. Exactly one is set. */
export interface WorkScheduled {
  /** Route slug of a built-in report, from REPORT_NAMES in reportMappings.ts. */
  report_slug?: string | null;
  custom_form_template_id?: string | null;
  /** The "Other — describe" fallback, for work with no report form. */
  work_scheduled_text?: string | null;
}

export type EquipmentStatus =
  | "not_installed"
  | "ready_for_testing"
  | "in_service"
  | "out_of_service";

export type TestingStatus =
  | "not_started"
  | "in_progress"
  | "complete"
  | "on_hold"
  | "retest_required"
  | "not_required";

export type TestResult = "pass" | "fail" | "limited_service";

export type ScheduleSource = "manual" | "p6_import" | "template";

export interface ScheduledTest extends WorkScheduled {
  id: string;
  site_id: string;
  equipment_asset_id: string;
  /** The project this was scheduled under, if any. The site's schedule outlives the job. */
  job_id?: string | null;

  start_date?: string | null;
  finish_date?: string | null;

  /**
   * Physical state of the equipment. Null is a real value meaning "nobody has said" —
   * the tracker treats it differently from "Not Installed", which is a claim.
   */
  equipment_status?: EquipmentStatus | null;
  testing_status: TestingStatus;

  /** The report document (neta_ops.assets row) that completed this. */
  report_asset_id?: string | null;
  result?: TestResult | null;

  notes?: string | null;

  source: ScheduleSource;
  external_activity_id?: string | null;
  external_batch_id?: string | null;
  /** Customer-fixed date (a trailing "*" in their P6 export). Bulk shifts warn on these. */
  has_date_constraint: boolean;

  created_by?: string | null;
  updated_by?: string | null;
  created_at?: string;
  updated_at?: string;
  deleted_at?: string | null;
}

/** A scheduled test joined to the asset it covers — what every tracker row renders from. */
export interface ScheduledTestRow extends ScheduledTest {
  identifier: string;
  substation?: string | null;
  building_area?: string | null;
  equipment_location?: string | null;
  equipment_type?: string | null;
  /** Parent asset's identifier — the "Part of" column. Null when it has no parent. */
  part_of?: string | null;
}

/** The editable half — what the schedule dialog and the importer produce. */
export interface ScheduledTestInput extends WorkScheduled {
  site_id: string;
  equipment_asset_id: string;
  job_id?: string | null;
  start_date?: string | null;
  finish_date?: string | null;
  equipment_status?: EquipmentStatus | null;
  testing_status?: TestingStatus;
  notes?: string | null;
}

// ── Labels ────────────────────────────────────────────────────────────────────

export const EQUIPMENT_STATUS_LABELS: Record<EquipmentStatus, string> = {
  not_installed: "Not Installed",
  ready_for_testing: "Ready for Testing",
  in_service: "In Service",
  out_of_service: "Out of Service",
};

export const TESTING_STATUS_LABELS: Record<TestingStatus, string> = {
  not_started: "Not Started",
  in_progress: "In Progress",
  complete: "Complete",
  on_hold: "On Hold",
  retest_required: "Retest Required",
  not_required: "Not Required",
};

export const RESULT_LABELS: Record<TestResult, string> = {
  pass: "PASS",
  fail: "FAIL",
  limited_service: "LIMITED SERVICE",
};

export const EQUIPMENT_STATUS_OPTIONS = (
  Object.keys(EQUIPMENT_STATUS_LABELS) as EquipmentStatus[]
).map((value) => ({ value, label: EQUIPMENT_STATUS_LABELS[value] }));

export const TESTING_STATUS_OPTIONS = (
  Object.keys(TESTING_STATUS_LABELS) as TestingStatus[]
).map((value) => ({ value, label: TESTING_STATUS_LABELS[value] }));

/** Testing statuses that mean there is no more work to do on this row. */
export const TERMINAL_TESTING_STATUSES: TestingStatus[] = ["complete", "not_required"];

// ── Schedule state — derived, never stored ────────────────────────────────────

/**
 * Where a row sits relative to today. Recomputed on every render rather than stored,
 * because a stored "past due" would be wrong by morning.
 *
 * Note `retest_required` is deliberately *not* terminal: a retest-required item whose
 * finish date has passed reads past due and stays red. That is the entire point of the
 * flag — it's work that still has to happen.
 */
export type ScheduleState =
  | "complete"
  | "on_hold"
  | "past_due"
  | "due_now"
  | "upcoming"
  | "unscheduled";

export const SCHEDULE_STATE_LABELS: Record<ScheduleState, string> = {
  complete: "Complete",
  on_hold: "On Hold",
  past_due: "Past Due",
  due_now: "Due Now",
  upcoming: "Upcoming",
  unscheduled: "Unscheduled",
};

export function getScheduleState(
  test: Pick<ScheduledTest, "testing_status" | "start_date" | "finish_date">,
  today: string = todayISO(),
): ScheduleState {
  if (TERMINAL_TESTING_STATUSES.includes(test.testing_status)) return "complete";
  if (test.testing_status === "on_hold") return "on_hold";

  const start = test.start_date || null;
  const finish = test.finish_date || null;
  if (!start && !finish) return "unscheduled";

  if (finish && finish < today) return "past_due";
  // A finish-only row (P6 milestones carry no start) has nothing to wait for, so treat a
  // missing start as "already started" rather than hiding it under Upcoming.
  if ((!start || start <= today) && (!finish || finish >= today)) return "due_now";
  return "upcoming";
}

// ── Date helpers ──────────────────────────────────────────────────────────────
//
// All of these take and return "YYYY-MM-DD". They build Date objects only for the
// weekday arithmetic and always in local time, so no value ever crosses a timezone
// boundary and shifts a day.

export function todayISO(): string {
  return toISO(new Date());
}

export function toISO(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

/** Local-time parse. `new Date("2026-08-03")` is UTC midnight and can land a day early. */
export function fromISO(iso: string): Date {
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(year, (month ?? 1) - 1, day ?? 1);
}

export function isWeekend(iso: string): boolean {
  const day = fromISO(iso).getDay();
  return day === 0 || day === 6;
}

export function addCalendarDays(iso: string, days: number): string {
  const date = fromISO(iso);
  date.setDate(date.getDate() + days);
  return toISO(date);
}

/**
 * Move to a weekday. Every one of the 262 activities in the customer's P6 export starts
 * and finishes Mon–Fri, so a date that lands on a weekend is a bug in our arithmetic, not
 * a real plan.
 */
export function snapToWorkingDay(iso: string, direction: 1 | -1 = 1): string {
  let current = iso;
  while (isWeekend(current)) current = addCalendarDays(current, direction);
  return current;
}

/**
 * Add N working days, skipping Sat/Sun. Negative N walks backwards.
 *
 * Zero snaps forward off a weekend rather than doing nothing, so callers don't have to
 * special-case a date that arrived dirty.
 *
 * Holidays are not handled — a site holiday calendar is deliberately out of Phase 2, and
 * the shift dialog says so rather than letting anyone assume Thanksgiving is accounted for.
 */
export function addWorkingDays(iso: string, days: number): string {
  if (days === 0) return snapToWorkingDay(iso);
  const step = days > 0 ? 1 : -1;
  let current = snapToWorkingDay(iso, step);
  let remaining = Math.abs(days);
  while (remaining > 0) {
    current = addCalendarDays(current, step);
    if (!isWeekend(current)) remaining -= 1;
  }
  return current;
}

/**
 * Working days from start to finish, counting both ends — a Mon–Fri window is 5, matching
 * how the customer's export states its durations.
 */
export function workingDaysBetween(startISO: string, finishISO: string): number {
  if (finishISO < startISO) return 0;
  let count = 0;
  let current = startISO;
  while (current <= finishISO) {
    if (!isWeekend(current)) count += 1;
    current = addCalendarDays(current, 1);
  }
  return count;
}

/** Default start for a new scheduled test: today, or Monday if today is the weekend. */
export function nextWorkingDay(from: string = todayISO()): string {
  return snapToWorkingDay(from);
}

/** "12 Oct 2026" — how dates read in the tracker and in the shift preview. */
export function formatScheduleDate(iso?: string | null): string {
  if (!iso) return "—";
  const date = fromISO(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString("en-US", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/** "12 – 16 Oct 2026", collapsing the repeated month and year. */
export function formatDateRange(
  startISO?: string | null,
  finishISO?: string | null,
): string {
  if (!startISO && !finishISO) return "Not scheduled";
  if (!startISO) return `Due ${formatScheduleDate(finishISO)}`;
  if (!finishISO) return `From ${formatScheduleDate(startISO)}`;
  if (startISO === finishISO) return formatScheduleDate(startISO);

  const start = fromISO(startISO);
  const finish = fromISO(finishISO);
  const sameYear = start.getFullYear() === finish.getFullYear();
  if (sameYear && start.getMonth() === finish.getMonth()) {
    return `${start.getDate()} – ${formatScheduleDate(finishISO)}`;
  }
  const startLabel = sameYear
    ? start.toLocaleDateString("en-US", { day: "numeric", month: "short" })
    : formatScheduleDate(startISO);
  return `${startLabel} – ${formatScheduleDate(finishISO)}`;
}
