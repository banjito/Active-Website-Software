// Which job page tab a user lands on when opening a job (Settings menu).
// Keys match JobDetail's activeTab values ("assets" is the Reports list,
// "reports" is Report Approvals). A ?tab= link always wins over this.

export const JOB_DEFAULT_TAB_PREF = "ui.jobDefaultTab";
export const JOB_DEFAULT_TAB_FALLBACK = "assets";

export const JOB_DEFAULT_TAB_OPTIONS: {
  key: string;
  label: string;
  adminOnly?: boolean;
}[] = [
  { key: "overview", label: "Overview" },
  { key: "assets", label: "Reports" },
  { key: "reports", label: "Report Approvals", adminOnly: true },
  { key: "equipment-assets", label: "Assets" },
  { key: "project-tracker", label: "Project Tracker" },
  { key: "tracking", label: "Tracking" },
  { key: "delays", label: "Delays" },
  { key: "deliverables", label: "Deliverables" },
  { key: "pictures", label: "Pictures" },
  { key: "after-action", label: "After-Action Reports" },
  { key: "change-orders", label: "Change Orders" },
  { key: "profitability", label: "Profitability", adminOnly: true },
  { key: "notes", label: "Notes" },
];

/** The saved tab if this user may see it, otherwise the Reports list. */
export function resolveJobDefaultTab(
  saved: string | null | undefined,
  isAdmin: boolean,
): string {
  const option = JOB_DEFAULT_TAB_OPTIONS.find((o) => o.key === saved);
  if (!option || (option.adminOnly && !isAdmin)) {
    return JOB_DEFAULT_TAB_FALLBACK;
  }
  return option.key;
}
