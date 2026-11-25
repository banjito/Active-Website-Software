/**
 * Pages with unsaved edits register here, so in-app buttons that leave the page
 * (like Admin's "Back to Dashboard") can ask first. Closing the tab or reloading
 * is covered too: the browser asks.
 */
import { useEffect } from "react";
import { confirmDialog } from "@/components/ui/confirmDialog";

const holders = new Set<symbol>();

/** Call with true while the page has edits that aren't saved yet. */
export function useUnsavedEdits(dirty: boolean) {
  useEffect(() => {
    if (!dirty) return;
    const id = Symbol("unsaved edits");
    holders.add(id);
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => {
      holders.delete(id);
      window.removeEventListener("beforeunload", warn);
    };
  }, [dirty]);
}

/** True when it's fine to leave: nothing unsaved, or the person said leave anyway. */
export async function confirmLeave(): Promise<boolean> {
  if (holders.size === 0) return true;
  return confirmDialog({
    title: "Leave without saving?",
    description: "Your changes on this page haven't been saved.",
    confirmLabel: "Leave",
    cancelLabel: "Stay",
    destructive: true,
  });
}
