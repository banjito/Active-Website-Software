/**
 * Opening a freshly created report in its own tab.
 *
 * "Copy nameplate data to new report" is used to keep one finished report on
 * screen as a template while the copies are filled in, so the copy has to land
 * in a *new* tab and leave the template alone. The catch is that the copy does
 * not exist yet: it takes a save, an insert and an asset link before there is a
 * URL to open, and by the time those awaits resolve the browser has forgotten
 * the click and blocks `window.open` as an unrequested popup.
 *
 * So the tab is claimed synchronously inside the click handler, holds a "one
 * moment" page while the work runs, and is pointed at the report -- or closed
 * again -- once the outcome is known.
 */

export interface PendingReportTab {
  /** True when the browser actually gave us the tab. */
  readonly opened: boolean;
  /** Send the waiting tab to the new report. */
  go(path: string): void;
  /** The report could not be created; take the waiting tab back down. */
  cancel(): void;
}

const PLACEHOLDER = `<!doctype html><html><head><meta charset="utf-8">
<title>Creating report…</title>
<style>
  html { color-scheme: light dark; }
  body { margin:0; height:100vh; display:flex; align-items:center; justify-content:center;
         font:14px system-ui,-apple-system,"Segoe UI",sans-serif; color:#525252; }
  @media (prefers-color-scheme: dark) { body { background:#171717; color:#a3a3a3; } }
</style></head><body>Creating the new report…</body></html>`;

/**
 * Claim a tab now, before any awaiting, so the browser still counts it as part
 * of the user's click. Call this first thing in the handler.
 */
export function openPendingReportTab(): PendingReportTab {
  let tab: Window | null = null;
  try {
    tab = window.open("", "_blank");
    if (tab) tab.document.write(PLACEHOLDER);
  } catch {
    tab = null;
  }

  return {
    get opened() {
      return Boolean(tab) && !tab!.closed;
    },
    go(path: string) {
      if (!tab || tab.closed) {
        // Popup blocked, or the user closed the placeholder while we worked.
        // The report itself is already saved and attached to the job, so say
        // where it went rather than dragging this tab off the template.
        alert(
          "The new report was created and added to the job, but your browser " +
            "blocked the new tab. Allow pop-ups for this site to have copies " +
            "open automatically.",
        );
        return;
      }
      tab.location.replace(path);
    },
    cancel() {
      if (tab && !tab.closed) tab.close();
    },
  };
}
