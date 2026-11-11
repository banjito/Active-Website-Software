import { useEffect } from "react";

/**
 * Puts `className` on <html> while the report is mounted.
 *
 * Report print stylesheets are injected globally and stay in the page after
 * the report closes, so an unscoped rule like `table input { … }` reaches
 * every other report. Prefix such rules with `html.<className>` and they only
 * apply while their own report is open, without changing the report's markup.
 */
export function useReportScopeClass(className: string): void {
  useEffect(() => {
    if (typeof document === "undefined") return;
    const root = document.documentElement;
    root.classList.add(className);
    return () => root.classList.remove(className);
  }, [className]);
}
