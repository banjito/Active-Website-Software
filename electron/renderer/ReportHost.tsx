import { Component, useMemo, type ReactNode } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { REPORTS } from "./reportRegistry";

/**
 * Isolates a report render crash so one buggy report can't white-screen the
 * whole offline app — the tech sees a clear message and can go back. The
 * `data-report-error` marker also lets the headless all-reports test detect a
 * crash reliably (see ELECTRON_ALL_REPORTS_TEST in electron/main/main.cts).
 */
class ReportErrorBoundary extends Component<
  { slug?: string; children: ReactNode },
  { error: Error | null }
> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  componentDidCatch(error: Error) {
    console.error(`[REPORT_CRASH] ${this.props.slug}: ${error.stack ?? error.message}`);
  }
  render() {
    if (this.state.error) {
      return (
        <div
          data-report-error="true"
          className="p-8 text-neutral-700 dark:text-neutral-200"
        >
          <p className="text-lg font-semibold text-red-600 dark:text-red-400">
            This report failed to load.
          </p>
          <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
            {this.props.slug}: {this.state.error.message}
          </p>
        </div>
      );
    }
    return this.props.children;
  }
}

/** Bridge exposed by the preload (electron/preload/preload.cts). */
const electronAPI = (
  window as unknown as {
    electronAPI?: {
      pdf: {
        export: (o?: {
          defaultName?: string;
          search?: string;
          hash?: string;
        }) => Promise<{ ok: boolean }>;
      };
    };
  }
).electronAPI;

/**
 * Renders the report component for the current :slug. The dynamic route
 * (/jobs/:id/:slug/:reportId?) means the report itself reads useParams().id /
 * .reportId exactly as it does in the main app — so it runs unchanged.
 */
export default function ReportHost() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const entry = REPORTS.find((r) => r.slug === slug);
  const isPdfExport = searchParams.get("export") === "pdf";
  const exportSearch = useMemo(() => {
    const next = new URLSearchParams(searchParams);
    next.set("export", "pdf");
    next.set("print", "true");
    return next.toString();
  }, [searchParams]);

  if (!entry) {
    return (
      <div className="p-8 text-neutral-700 dark:text-neutral-200">
        <button
          onClick={() => navigate("/")}
          className="mb-4 text-sm text-blue-600 hover:underline"
        >
          ← All reports
        </button>
        <p>Unknown report: {slug}</p>
      </div>
    );
  }

  const ReportComponent = entry.component;

  return (
    <div className="min-h-screen bg-white dark:bg-neutral-900">
      {/* Sticky toolbar — hidden when printing/exporting so it never lands in the PDF. */}
      {!isPdfExport && (
        <div className="electron-report-toolbar print:hidden sticky top-0 z-50 flex items-center justify-between gap-3 border-b border-neutral-200 bg-white/90 px-4 py-2.5 backdrop-blur dark:border-neutral-800 dark:bg-neutral-950/90">
          <button
            onClick={() => navigate("/")}
            className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-medium text-neutral-600 transition hover:bg-neutral-100 hover:text-neutral-900 dark:text-neutral-300 dark:hover:bg-neutral-800 dark:hover:text-white"
          >
            <svg
              viewBox="0 0 24 24"
              className="h-4 w-4"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path
                d="m15 6-6 6 6 6"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            All reports
          </button>
          <span className="hidden flex-1 truncate text-center text-sm font-medium text-neutral-500 dark:text-neutral-400 sm:block">
            {entry.name}
          </span>
          <button
            onClick={() =>
              electronAPI?.pdf.export({
                defaultName: entry.slug,
                search: exportSearch,
                hash: window.location.hash,
              })
            }
            className="flex items-center gap-1.5 rounded-lg bg-amp-orange-600 px-3.5 py-1.5 text-sm font-semibold text-white shadow-sm shadow-amp-orange-700/30 transition hover:bg-amp-orange-700"
          >
            <svg
              viewBox="0 0 24 24"
              className="h-4 w-4"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path
                d="M12 3v12m0 0 4-4m-4 4-4-4M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            Export PDF
          </button>
        </div>
      )}
      <ReportErrorBoundary slug={entry.slug}>
        <ReportComponent />
      </ReportErrorBoundary>
    </div>
  );
}
