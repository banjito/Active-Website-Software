// Which job page tab a user lands on when opening a job (Settings menu).
// Keys match JobDetail's activeTab values ("assets" is the Reports list,
// "reports" is Report Approvals). A ?tab= link always wins over this.

import type { PermissionKey } from "@/lib/permissions";

export const JOB_DEFAULT_TAB_PREF = "ui.jobDefaultTab";
export const JOB_DEFAULT_TAB_FALLBACK = "assets";

export const JOB_DEFAULT_TAB_OPTIONS: {
  key: string;
  label: string;
  /** Only offered to people with this permission. */
  needs?: PermissionKey;
}[] = [
  { key: "overview", label: "Overview" },
  { key: "assets", label: "Reports" },
  { key: "reports", label: "Report Approvals", needs: "reports.review" },
  { key: "equipment-assets", label: "Assets" },
  { key: "project-tracker", label: "Project Tracker" },
  { key: "tracking", label: "Tracking" },
  { key: "delays", label: "Delays" },
  { key: "deliverables", label: "Deliverables" },
  { key: "pictures", label: "Pictures" },
  { key: "after-action", label: "After-Action Reports" },
  { key: "change-orders", label: "Change Orders" },
  { key: "profitability", label: "Profitability", needs: "jobs.view_money" },
  { key: "notes", label: "Notes" },
];

/** The saved tab if this user may see it, otherwise the Reports list. */
export function resolveJobDefaultTab(
  saved: string | null | undefined,
  can: (key: PermissionKey) => boolean,
): string {
  const option = JOB_DEFAULT_TAB_OPTIONS.find((o) => o.key === saved);
  if (!option || (option.needs && !can(option.needs))) {
    return JOB_DEFAULT_TAB_FALLBACK;
  }
  return option.key;
}
