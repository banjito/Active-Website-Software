import { useParams, useNavigate } from "react-router-dom";
import { REPORTS } from "./reportRegistry";

/** Bridge exposed by the preload (electron/preload/preload.cts). */
const electronAPI = (window as unknown as {
  electronAPI?: {
    pdf: { export: (o?: { defaultName?: string }) => Promise<{ ok: boolean }> };
  };
}).electronAPI;

/**
 * Renders the report component for the current :slug. The dynamic route
 * (/jobs/:id/:slug/:reportId?) means the report itself reads useParams().id /
 * .reportId exactly as it does in the main app — so it runs unchanged.
 */
export default function ReportHost() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const entry = REPORTS.find((r) => r.slug === slug);

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
      {/* Thin toolbar — hidden when printing so it never lands in the PDF. */}
      <div className="print:hidden sticky top-0 z-50 flex items-center justify-between border-b border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800 px-4 py-2">
        <button
          onClick={() => navigate("/")}
          className="text-sm font-medium text-neutral-700 dark:text-neutral-200 hover:text-blue-600"
        >
          ← All reports
        </button>
        <span className="truncate px-3 text-sm text-neutral-500 dark:text-neutral-400">
          {entry.name}
        </span>
        <button
          onClick={() => electronAPI?.pdf.export({ defaultName: entry.slug })}
          className="rounded bg-blue-600 px-3 py-1 text-sm font-medium text-white hover:bg-blue-700"
        >
          Export PDF
        </button>
      </div>
      <ReportComponent />
    </div>
  );
}
