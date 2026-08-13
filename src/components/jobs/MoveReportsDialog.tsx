import React, { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  describeJob,
  fetchMoveTargetJobs,
  moveReportsToJob,
  type MovedReport,
  type MoveTargetJob,
} from "@/services/reportMoveService";

/**
 * Moves the selected reports to another job.
 *
 * Nothing is copied: the same report rows keep their ids and every reading, photo,
 * comment and approval goes with them. Only which job they hang off changes.
 */

export interface MoveReportsDialogProps {
  open: boolean;
  onClose: () => void;
  sourceJobId: string;
  /** How the job being moved from is labelled in the confirmation copy. */
  sourceJobLabel: string;
  /** The reports the reviewer selected, in display order. */
  reports: Array<{ id: string; name: string }>;
  /** Fired after a successful move so the caller can refresh its list. */
  onMoved: (moved: MovedReport[], targetJob: MoveTargetJob) => void;
}

const MoveReportsDialog: React.FC<MoveReportsDialogProps> = ({
  open,
  onClose,
  sourceJobId,
  sourceJobLabel,
  reports,
  onMoved,
}) => {
  const [query, setQuery] = useState("");
  const [jobs, setJobs] = useState<MoveTargetJob[]>([]);
  const [job, setJob] = useState<MoveTargetJob | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadingJobs, setLoadingJobs] = useState(false);
  /** Results are hidden once a job is picked, and shown again while typing. */
  const [showResults, setShowResults] = useState(false);
  /** Whether the current press began on the backdrop rather than the panel. */
  const pressedBackdrop = useRef(false);
  const jobFieldRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setJob(null);
    setReason("");
    setError(null);
    setShowResults(false);
  }, [open]);

  // The suggestion list floats over the form, so a click anywhere else dismisses it.
  useEffect(() => {
    if (!open) return;

    const onPointerDown = (e: MouseEvent) => {
      if (!jobFieldRef.current?.contains(e.target as Node)) setShowResults(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [open]);

  // Close on Escape, and hold the page still behind the backdrop.
  useEffect(() => {
    if (!open) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onClose();
    };
    document.addEventListener("keydown", onKeyDown);

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [open, busy, onClose]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoadingJobs(true);

    // Debounced so typing does not fire a query per keystroke.
    const timer = setTimeout(async () => {
      try {
        const rows = await fetchMoveTargetJobs(sourceJobId, query);
        if (!cancelled) setJobs(rows);
      } catch (err) {
        if (!cancelled) setError(String((err as Error)?.message || err));
      } finally {
        if (!cancelled) setLoadingJobs(false);
      }
    }, 250);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [open, query, sourceJobId]);

  const submit = useCallback(async () => {
    if (!job || reports.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      const moved = await moveReportsToJob({
        assetIds: reports.map((r) => r.id),
        sourceJobId,
        targetJobId: job.id,
        reason,
      });
      onMoved(moved, job);
      onClose();
    } catch (err) {
      setError(String((err as Error)?.message || err));
    } finally {
      setBusy(false);
    }
  }, [job, reports, sourceJobId, reason, onMoved, onClose]);

  if (!open) return null;

  const count = reports.length;
  const plural = count === 1 ? "report" : "reports";

  // Portalled to <body>: an ancestor of the page content creates a containing block for
  // position:fixed, which otherwise pins the backdrop to the <main> box and leaves the
  // header and sidebar undimmed. z-index clears the app header, which is sticky at z-50.
  return createPortal(
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Move reports to another job"
      // Close only when the press *started* on the backdrop, so a drag that begins inside
      // the panel and releases outside it does not close the dialog mid text-selection.
      onMouseDown={(e) => {
        pressedBackdrop.current = e.target === e.currentTarget;
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget && pressedBackdrop.current && !busy) onClose();
        pressedBackdrop.current = false;
      }}
    >
      <div className="max-h-full w-full max-w-lg overflow-y-auto border border-neutral-200 bg-white p-6 dark:border-neutral-700 dark:bg-neutral-900">
        <h2 className="text-lg font-bold text-neutral-900 dark:text-white">
          Move {count} {plural} to another job
        </h2>
        <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
          The {plural} {count === 1 ? "keeps" : "keep"} every reading, photo, comment and
          approval. Nothing is retyped and nothing is copied — only which job{" "}
          {count === 1 ? "it hangs" : "they hang"} off changes.
        </p>

        <div className="mt-5 space-y-4">
          <div className="space-y-2">
            <span className="text-sm font-medium text-neutral-900 dark:text-white">
              Moving from
            </span>
            <p className="text-sm text-neutral-600 dark:text-neutral-300">
              {sourceJobLabel}
            </p>
          </div>

          {/* Named up front: moving the wrong report is the mistake this dialog can
              cause, and the reviewer selected these on a different screen. */}
          <div className="space-y-2">
            <span className="text-sm font-medium text-neutral-900 dark:text-white">
              Moving
            </span>
            <ul className="max-h-32 overflow-y-auto border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm text-neutral-700 dark:border-neutral-700 dark:bg-neutral-800/50 dark:text-neutral-300">
              {reports.map((report) => (
                <li key={report.id} className="truncate py-0.5">
                  {report.name || "Untitled report"}
                </li>
              ))}
            </ul>
          </div>

          <div className="space-y-2" ref={jobFieldRef}>
            <label
              htmlFor="move-reports-job"
              className="text-sm font-medium text-neutral-900 dark:text-white"
            >
              Move to job *
            </label>
            {/* Anchored to the input, so the list floats over what follows instead of
                shoving the rest of the form down. */}
            <div className="relative">
              <input
                id="move-reports-job"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  // Typing means they are looking again.
                  setShowResults(true);
                  setJob(null);
                }}
                onFocus={() => setShowResults(true)}
                placeholder="Search by job number or title"
                className="w-full rounded-none border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 outline-none focus:border-brand dark:border-neutral-700 dark:bg-neutral-900 dark:text-white"
              />

              {showResults && (
                <div className="absolute left-0 right-0 top-full z-10 max-h-56 overflow-y-auto border border-neutral-200 bg-white shadow-lg dark:border-neutral-700 dark:bg-neutral-900">
                  {loadingJobs ? (
                    <p className="px-3 py-2 text-sm text-neutral-400">Loading…</p>
                  ) : jobs.length === 0 ? (
                    <p className="px-3 py-2 text-sm text-neutral-400">No jobs found.</p>
                  ) : (
                    jobs.map((option) => (
                      <button
                        key={option.id}
                        type="button"
                        onClick={() => {
                          setJob(option);
                          // Collapse the list and show the choice in the field.
                          setQuery(describeJob(option));
                          setShowResults(false);
                        }}
                        className="block w-full px-3 py-2 text-left text-sm text-neutral-700 transition-colors hover:bg-neutral-50 dark:text-neutral-300 dark:hover:bg-neutral-800"
                      >
                        <span className="flex items-center gap-2">
                          <span className="truncate">{describeJob(option)}</span>
                          {/* The whole point of this feature is two projects at one
                              facility, so say which jobs those are. */}
                          {option.sameSite && (
                            <span className="shrink-0 bg-brand/10 px-1.5 py-0.5 text-xs font-medium text-brand">
                              Same site
                            </span>
                          )}
                        </span>
                        {option.customerName && (
                          <span className="mt-0.5 block truncate text-xs text-neutral-500 dark:text-neutral-400">
                            {option.customerName}
                          </span>
                        )}
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>

            {job && !showResults && (
              <p className="text-xs text-neutral-500 dark:text-neutral-400">
                Moving to {describeJob(job)}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <label
              htmlFor="move-reports-reason"
              className="text-sm font-medium text-neutral-900 dark:text-white"
            >
              Reason
            </label>
            <input
              id="move-reports-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. filed under the wrong DNN4 project"
              className="w-full rounded-none border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 outline-none focus:border-brand dark:border-neutral-700 dark:bg-neutral-900 dark:text-white"
            />
            <p className="text-xs text-neutral-500 dark:text-neutral-400">
              Optional. Recorded with the move so the next person to ask "why is this on
              the other project?" has an answer.
            </p>
          </div>

          {error && (
            <div className="rounded-none border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">
              {error}
            </div>
          )}
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="rounded-none border border-neutral-200 bg-white px-3.5 py-2 text-sm font-medium text-neutral-700 hover:border-neutral-300 disabled:opacity-50 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-300"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={busy || !job || count === 0}
            className="rounded-none bg-brand px-3.5 py-2 text-sm font-medium text-white hover:bg-brand-dark disabled:opacity-50"
          >
            {busy ? "Moving…" : `Move ${count} ${plural}`}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
};

export default MoveReportsDialog;
