import { confirmDialog } from "@/components/ui/confirmDialog";

/**
 * Asked when a Static text column becomes User entry: keep its text as
 * default values the technician can change, or clear it.
 */
export function askKeepStaticAsDefaults(rows: number): Promise<boolean> {
  return confirmDialog({
    title: "Keep the static text as default values?",
    description: `This column has fixed text in ${rows} row${rows === 1 ? "" : "s"}. Keep it as starting values the technician can change, or clear it so the cells start blank.`,
    confirmLabel: "Keep as defaults",
    cancelLabel: "Clear it",
  });
}
