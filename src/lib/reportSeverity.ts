/**
 * Severity vocabulary shared by every converted-report renderer.
 *
 * The scale itself is generic ("is this fine, watch it, or act on it"); what
 * differs per report family is how a printed value maps onto it. Each family
 * keeps its own mapper — conditionSeverity in oilReport.ts, resultSeverity in
 * amplifyReport.ts — and imports the labels and classes from here so the page
 * and the PDF cannot drift apart.
 */

export type Severity = "good" | "caution" | "alert" | "unknown";

export const severityLabel: Record<Severity, string> = {
  good: "Normal",
  caution: "Monitor",
  alert: "Investigate",
  unknown: "Not rated",
};

/** Badge classes per severity. */
export const severityClasses: Record<Severity, string> = {
  good: "bg-emerald-50 text-emerald-700 ring-emerald-600/20 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-400/30",
  caution:
    "bg-amber-50 text-amber-800 ring-amber-600/20 dark:bg-amber-500/10 dark:text-amber-300 dark:ring-amber-400/30",
  alert:
    "bg-red-50 text-red-700 ring-red-600/20 dark:bg-red-500/10 dark:text-red-300 dark:ring-red-400/30",
  unknown:
    "bg-neutral-100 text-neutral-600 ring-neutral-500/20 dark:bg-neutral-800 dark:text-neutral-400 dark:ring-neutral-600/30",
};

/** Dot color per severity, for compact indicators that cannot carry a badge. */
export const severityDot: Record<Severity, string> = {
  good: "bg-emerald-500",
  caution: "bg-amber-500",
  alert: "bg-red-500",
  unknown: "bg-neutral-400",
};
