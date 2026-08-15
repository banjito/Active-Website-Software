import { CloudAlert } from "lucide-react";
import { useAutoSaveStatus } from "./autoSaveStatus";

const formatTime = (ms: number | null) =>
  ms
    ? new Date(ms).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
    : null;

/**
 * Shown only when auto-save is failing. Rendered by `ReportWrapper`, so every
 * report gets it without per-report wiring.
 *
 * Deliberately loud and fixed to the top of the window: the whole point is that
 * a technician filling in a form must not be able to keep working for an hour
 * believing their results are being saved when they are not.
 */
export const SaveStatusBanner = () => {
  const status = useAutoSaveStatus();
  if (status.state !== "error") return null;

  const lastSaved = formatTime(status.lastSavedAt);

  return (
    <div
      role="alert"
      aria-live="assertive"
      className="fixed inset-x-0 top-0 z-50 rounded-none border-b-2 border-red-800 bg-red-600 px-4 py-3 text-white shadow-lg print:hidden"
    >
      <div className="mx-auto flex max-w-5xl items-start gap-3">
        <CloudAlert className="mt-0.5 h-6 w-6 shrink-0" aria-hidden="true" />
        <div className="min-w-0">
          <p className="text-sm font-semibold">
            Not saved. Your last changes did not reach the server.
          </p>
          <p className="mt-1 text-sm">
            Keep this tab open and check your connection. This report will save
            itself once you are back online.{" "}
            {lastSaved
              ? `Last successful save was at ${lastSaved}.`
              : "Nothing on this report has been saved yet."}
          </p>
          {status.message ? (
            <p className="mt-1 truncate text-xs opacity-80" title={status.message}>
              {status.message}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
};

export default SaveStatusBanner;
