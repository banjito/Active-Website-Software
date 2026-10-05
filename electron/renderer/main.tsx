import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import OfflineApp from "./OfflineApp";
import "@/index.css";
import "./offline.css";

/**
 * On first save, reports put the new report id in the address bar with
 * `window.history.replaceState(null, "", "/jobs/<job>/<slug>/<id>")`. The
 * offline app loads from a file and routes inside the hash (#/jobs/...), so a
 * plain path either fails or points the window at a file that does not exist.
 * Then reload and PDF export reopen the report without its id (a blank form).
 * Moving those paths into the hash keeps the id where the app looks for it.
 */
function routeReportUrlsThroughHash(): void {
  for (const method of ["replaceState", "pushState"] as const) {
    const original = window.history[method].bind(window.history);
    window.history[method] = (
      data: unknown,
      unused: string,
      url?: string | URL | null,
    ) => {
      if (typeof url === "string" && url.startsWith("/jobs/")) {
        // Keep the router's own state (its history index) when reports pass null.
        original(data ?? window.history.state, unused, `#${url}`);
        return;
      }
      original(data, unused, url);
    };
  }
}

routeReportUrlsThroughHash();

const root = document.getElementById("root");
if (root) {
  createRoot(root).render(
    <StrictMode>
      <OfflineApp />
    </StrictMode>
  );
}
