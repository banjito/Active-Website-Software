import { useSyncExternalStore } from "react";

/**
 * Whether the report on screen actually reached the server.
 *
 * Auto-save used to fail silently: the catch block logged to the console and
 * the technician kept typing into a form that was no longer being saved
 * anywhere. Reports were lost that way. Every auto-save now reports its outcome
 * here, and `SaveStatusBanner` (rendered by `ReportWrapper`, so every report
 * gets it) turns that into something impossible to miss on screen.
 *
 * A single module-level value is enough because only one report is open at a
 * time. The path of the failing report is recorded so a stale failure cannot
 * follow the user onto a different report.
 */

export interface SaveStatus {
  state: "ok" | "error";
  /** Plain-English reason, shown to the technician. */
  message?: string;
  /** Path of the report that failed, so the warning stays with it. */
  path?: string;
  /** Last time a save is known to have succeeded, if ever this session. */
  lastSavedAt: number | null;
}

const OK: SaveStatus = { state: "ok", lastSavedAt: null };

let snapshot: SaveStatus = OK;
const listeners = new Set<() => void>();

const emit = () => {
  listeners.forEach((l) => l());
};

export const currentPath = () =>
  typeof window === "undefined" ? "" : window.location.pathname;

/** Warn before the tab closes while a save is known to be failing. */
const warnBeforeUnload = (event: BeforeUnloadEvent) => {
  event.preventDefault();
  event.returnValue = "";
  return "";
};

const setUnloadGuard = (on: boolean) => {
  if (typeof window === "undefined") return;
  window.removeEventListener("beforeunload", warnBeforeUnload);
  if (on) window.addEventListener("beforeunload", warnBeforeUnload);
};

export function reportSaveSucceeded(): void {
  snapshot = { state: "ok", lastSavedAt: Date.now() };
  setUnloadGuard(false);
  emit();
}

export function reportSaveFailed(error: unknown): void {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : (error as { message?: string })?.message || "Unknown error";

  snapshot = {
    state: "error",
    message,
    path: currentPath(),
    lastSavedAt: snapshot.lastSavedAt,
  };
  setUnloadGuard(true);
  emit();
}

/** Clears any warning, e.g. when a report unmounts. */
export function resetSaveStatus(): void {
  snapshot = { state: "ok", lastSavedAt: snapshot.lastSavedAt };
  setUnloadGuard(false);
  emit();
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

const getSnapshot = () => snapshot;

export function useAutoSaveStatus(): SaveStatus {
  const status = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  // A failure belongs to the report it happened on; never carry it onto another.
  if (status.state === "error" && status.path && status.path !== currentPath()) {
    return { state: "ok", lastSavedAt: status.lastSavedAt };
  }
  return status;
}
