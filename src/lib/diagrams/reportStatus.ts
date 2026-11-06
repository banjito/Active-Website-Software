/**
 * Coloring a diagram by report status.
 *
 * Color classes rather than hex values, so each status gets a shade that reads in both light
 * and dark mode. They're written out in full because Tailwind only keeps classes it can find.
 */

export interface StatusStyle {
  status: string;
  label: string;
  symbolClass: string;
  swatchClass: string;
  /** For the PDF, which always prints on white. */
  hex: string;
}

/** Least finished first. The order is what decides which report speaks for a job. */
export const STATUS_STYLES: StatusStyle[] = [
  {
    status: "issue",
    label: "Issue",
    symbolClass: "text-red-600 dark:text-red-400",
    swatchClass: "bg-red-600 dark:bg-red-400",
    hex: "#DC2626",
  },
  {
    status: "not started",
    label: "Not Started",
    symbolClass: "text-neutral-400 dark:text-neutral-500",
    swatchClass: "bg-neutral-400 dark:bg-neutral-500",
    hex: "#A3A3A3",
  },
  {
    status: "in_progress",
    label: "In Progress",
    symbolClass: "text-amber-600 dark:text-amber-400",
    swatchClass: "bg-amber-600 dark:bg-amber-400",
    hex: "#D97706",
  },
  {
    status: "ready_for_review",
    label: "Ready for Review",
    symbolClass: "text-blue-600 dark:text-blue-400",
    swatchClass: "bg-blue-600 dark:bg-blue-400",
    hex: "#2563EB",
  },
  {
    status: "approved",
    label: "Approved",
    symbolClass: "text-green-600 dark:text-green-400",
    swatchClass: "bg-green-600 dark:bg-green-400",
    hex: "#16A34A",
  },
  {
    status: "sent",
    label: "Sent",
    symbolClass: "text-teal-600 dark:text-teal-400",
    swatchClass: "bg-teal-600 dark:bg-teal-400",
    hex: "#0D9488",
  },
];

export const statusStyleFor = (status: string | null | undefined) =>
  STATUS_STYLES.find((style) => style.status === status);

export interface ReportStatusRow {
  equipment_asset_id: string;
  status: string | null;
  created_at: string;
}

const rank = (status: string) => {
  const index = STATUS_STYLES.findIndex((style) => style.status === status);
  return index === -1 ? STATUS_STYLES.length : index;
};

/**
 * The one status that speaks for each asset.
 *
 * From a job, the least finished report: an asset shouldn't look done while one of its
 * reports on that job is still open. From a site, the latest report, which is the asset's
 * current condition across every job. Archived reports don't count unless they're all there is.
 */
export function statusByAsset(rows: ReportStatusRow[], fromJob: boolean): Map<string, string> {
  const byAsset = new Map<string, ReportStatusRow[]>();
  for (const row of rows) {
    byAsset.set(row.equipment_asset_id, [...(byAsset.get(row.equipment_asset_id) ?? []), row]);
  }

  const statuses = new Map<string, string>();
  for (const [assetId, reports] of byAsset) {
    const live = reports.filter((report) => report.status !== "archived");
    if (live.length === 0) continue;

    const named = live.map((report) => ({ ...report, status: report.status ?? "in_progress" }));
    const [chosen] = fromJob
      ? [...named].sort((a, b) => rank(a.status) - rank(b.status))
      : [...named].sort((a, b) => b.created_at.localeCompare(a.created_at));
    statuses.set(assetId, chosen.status);
  }
  return statuses;
}
