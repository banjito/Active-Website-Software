// Time helpers shared by the scheduling screens.
import type { Dayjs } from "dayjs";

/**
 * The database requires an assignment's end time to be after its start time,
 * so "Unknown hours" is stored as the start time plus one second.
 * Screens compare only hours:minutes, so it still shows as "Unknown".
 */
export const unknownHoursEnd = (start: string): string => {
  const [h = "00", m = "00"] = String(start || "").split(":");
  return `${h.padStart(2, "0")}:${m.padStart(2, "0")}:01`;
};

export const isAllDayRange = (start?: string, end?: string): boolean =>
  !!start?.startsWith("00:00") &&
  (!!end?.startsWith("23:59") || !!end?.startsWith("24:00"));

export const isUnknownRange = (start?: string, end?: string): boolean =>
  !!start && !!end && start.slice(0, 5) === end.slice(0, 5);

export const formatTimeRange = (start?: string, end?: string): string => {
  if (isAllDayRange(start, end)) return "All Day";
  if (isUnknownRange(start, end)) return "Unknown hours";
  return `${start?.slice(0, 5) ?? ""} - ${end?.slice(0, 5) ?? ""}`;
};

/** Monday of the week containing the given date (YYYY-MM-DD). */
export const mondayOf = (d: Dayjs): string =>
  d.subtract((d.day() + 6) % 7, "day").format("YYYY-MM-DD");
