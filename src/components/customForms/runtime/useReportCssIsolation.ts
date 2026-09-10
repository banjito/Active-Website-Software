/**
 * Keep the hard-coded reports' stylesheets off custom-form pages.
 *
 * Most hard-coded reports inject a global stylesheet into <head> when their
 * module loads, and App imports them all up front, so those rules are live on
 * every page from startup. Their selectors are unscoped: one centres every
 * table cell but the first, others pin columns to fixed widths or hide any
 * element whose class mentions "header". On a custom form they misalign labels
 * and crush columns, on screen and in print.
 *
 * Each of those sheets is tagged `data-report-print`. While a custom-form page
 * is mounted this disables them, including any a report injects later, and
 * re-enables exactly the ones it disabled when the page goes away, so the
 * hard-coded reports print as they always have.
 */

import { useEffect } from "react";

export const REPORT_STYLE_ATTRIBUTE = "data-report-print";

export function useReportCssIsolation(): void {
  useEffect(() => {
    if (typeof document === "undefined") return;
    const disabledHere = new Set<HTMLStyleElement>();

    const disableAll = () => {
      document
        .querySelectorAll<HTMLStyleElement>(`style[${REPORT_STYLE_ATTRIBUTE}]`)
        .forEach((sheet) => {
          if (sheet.disabled) return;
          sheet.disabled = true;
          disabledHere.add(sheet);
        });
    };

    disableAll();
    const observer = new MutationObserver(disableAll);
    observer.observe(document.head, { childList: true });

    return () => {
      observer.disconnect();
      disabledHere.forEach((sheet) => {
        sheet.disabled = false;
      });
    };
  }, []);
}
