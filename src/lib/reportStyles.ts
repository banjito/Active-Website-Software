/**
 * The old reports' styles stay off unless a report is open.
 *
 * Most hard-coded reports put a global stylesheet in <head> when their file loads, and
 * App loads them all up front. Some add more when a report opens and leave them behind.
 * Their rules aren't scoped, so on every page they made text boxes 200px tall and added
 * 100px under the page, and after some reports they also hid anything called a nav or
 * header and drew orange lines over headings.
 *
 * Every one of those sheets is tagged data-report-print. This keeps them switched off,
 * and on only while a report is on screen: ReportWrapper calls useReportStyles(), and so
 * do the few reports that don't use it. Inside a report nothing changes: all the sheets
 * are on, as before. Custom-form pages keep them off even then (useNoReportStyles).
 */
import { useLayoutEffect } from "react";

export const REPORT_STYLE_ATTRIBUTE = "data-report-print";

let reportsOpen = 0;
let blockers = 0;
let started = false;

function apply() {
  if (typeof document === "undefined") return;
  const on = reportsOpen > 0 && blockers === 0;
  document.querySelectorAll<HTMLStyleElement>(`style[${REPORT_STYLE_ATTRIBUTE}]`).forEach((sheet) => {
    if (sheet.disabled === on) sheet.disabled = !on;
  });
}

/** Call once from main.tsx, before the app first draws. */
export function startReportStyleGate(): void {
  if (started || typeof document === "undefined") return;
  started = true;
  apply();
  // Reports add sheets when their file loads or when they open, so keep watching
  new MutationObserver(apply).observe(document.head, { childList: true });
}

/** A report is on screen. The report styles are on while this is mounted. */
export function useReportStyles(): void {
  // Layout effect: on before the report is first drawn, so it never flashes unstyled
  useLayoutEffect(() => {
    reportsOpen++;
    apply();
    return () => {
      reportsOpen--;
      apply();
    };
  }, []);
}

/** Keeps the report styles off while mounted, even when a report is open too. */
export function useNoReportStyles(): void {
  useLayoutEffect(() => {
    blockers++;
    apply();
    return () => {
      blockers--;
      apply();
    };
  }, []);
}
