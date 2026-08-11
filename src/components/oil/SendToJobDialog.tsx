import React, { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  fetchJobSubstations,
  searchJobs,
  uploadJobAsset,
  type JobOption,
} from "@/lib/jobAssetUpload";

/**
 * Sends a generated oil analysis PDF to a job.
 *
 * The PDF is built lazily on submit rather than up front, so opening the
 * dialog and changing your mind costs nothing.
 */

export interface SendToJobDialogProps {
  open: boolean;
  onClose: () => void;
  /** Default asset name, without extension. */
  defaultName: string;
  /** Prefilled from the report's nameplate when the lab recorded one. */
  defaultSubstation?: string;
  /** Builds the PDF to attach. */
  buildFile: (fileName: string) => Promise<File>;
  onUploaded?: (jobId: string) => void;
}

const labelFor = (job: JobOption): string =>
  [job.jobNumber, job.title].filter(Boolean).join(" — ") || job.id;

const SendToJobDialog: React.FC<SendToJobDialogProps> = ({
  open,
  onClose,
  defaultName,
  defaultSubstation,
  buildFile,
  onUploaded,
}) => {
  const [query, setQuery] = useState("");
  const [jobs, setJobs] = useState<JobOption[]>([]);
  const [job, setJob] = useState<JobOption | null>(null);
  const [name, setName] = useState(defaultName);
  const [substation, setSubstation] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadingJobs, setLoadingJobs] = useState(false);
  /** Results are hidden once a job is picked, and shown again while typing. */
  const [showResults, setShowResults] = useState(false);
  const [substations, setSubstations] = useState<string[]>([]);
  const [substationOpen, setSubstationOpen] = useState(false);
  /** Whether the current press began on the backdrop rather than the panel. */
  const pressedBackdrop = useRef(false);
  const jobFieldRef = useRef<HTMLDivElement>(null);
  const substationFieldRef = useRef<HTMLDivElement>(null);

  // Reset to the report's own defaults each time the dialog opens.
  useEffect(() => {
    if (!open) return;
    setName(defaultName);
    // The report's substation is a hint, not a value: it comes from the lab's
    // nameplate and is often not what the job files it under.
    setSubstation("");
    setJob(null);
    setQuery("");
    setError(null);
    setShowResults(false);
    setSubstations([]);
    setSubstationOpen(false);
  }, [open, defaultName, defaultSubstation]);

  // Substation vocabulary comes from the chosen job's existing assets.
  useEffect(() => {
    if (!job) {
      setSubstations([]);
      return;
    }
    let cancelled = false;

    (async () => {
      try {
        const rows = await fetchJobSubstations(job.id);
        if (!cancelled) setSubstations(rows);
      } catch {
        // Suggestions are optional; typing a substation still works.
        if (!cancelled) setSubstations([]);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [job]);

  // The suggestion lists float over the form, so a click anywhere else has to
  // dismiss them.
  useEffect(() => {
    if (!open) return;

    const onPointerDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (!jobFieldRef.current?.contains(target)) setShowResults(false);
      if (!substationFieldRef.current?.contains(target)) {
        setSubstationOpen(false);
      }
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
        const rows = await searchJobs(query);
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
  }, [open, query]);

  /** Job substations narrowed by whatever has been typed so far. */
  const matchingSubstations = substations.filter(
    (s) =>
      s.toLowerCase() !== substation.trim().toLowerCase() &&
      s.toLowerCase().includes(substation.trim().toLowerCase()),
  );

  const submit = useCallback(async () => {
    if (!job || !name.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const fileName = `${name.trim().replace(/\.pdf$/i, "")}.pdf`;
      const file = await buildFile(fileName);
      await uploadJobAsset({
        jobId: job.id,
        file,
        name: name.trim(),
        substation,
      });
      onUploaded?.(job.id);
      onClose();
    } catch (err) {
      setError(String((err as Error)?.message || err));
    } finally {
      setBusy(false);
    }
  }, [job, name, substation, buildFile, onUploaded, onClose]);

  if (!open) return null;

  // Portalled to <body>: an ancestor of the page content creates a containing
  // block for position:fixed, which otherwise pins the backdrop to the <main>
  // box and leaves the header and sidebar undimmed. z-index clears the app
  // header, which is sticky at z-50.
  return createPortal(
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Send report to a job"
      // Close only when the press *started* on the backdrop. A drag that
      // begins inside the panel and releases outside it still fires a click on
      // the backdrop (the common ancestor), which would otherwise close the
      // dialog mid text-selection.
      onMouseDown={(e) => {
        pressedBackdrop.current = e.target === e.currentTarget;
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget && pressedBackdrop.current && !busy) {
          onClose();
        }
        pressedBackdrop.current = false;
      }}
    >
      <div className="max-h-full w-full max-w-lg overflow-y-auto border border-neutral-200 bg-white p-6 dark:border-neutral-700 dark:bg-neutral-900">
        <h2 className="text-lg font-bold text-neutral-900 dark:text-white">
          Send to Job
        </h2>
        <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
          Attaches the branded PDF to the job's Reports tab for review.
        </p>

        <div className="mt-5 space-y-4">
          <div className="space-y-2">
            <label
              htmlFor="send-job-name"
              className="text-sm font-medium text-neutral-900 dark:text-white"
            >
              File name *
            </label>
            <input
              id="send-job-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-none border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 outline-none focus:border-brand dark:border-neutral-700 dark:bg-neutral-900 dark:text-white"
            />
            <p className="text-xs text-neutral-500 dark:text-neutral-400">
              Saved as {name.trim().replace(/\.pdf$/i, "") || "report"}.pdf
            </p>
          </div>

          <div className="space-y-2" ref={jobFieldRef}>
            <label
              htmlFor="send-job-search"
              className="text-sm font-medium text-neutral-900 dark:text-white"
            >
              Job *
            </label>
            {/* Anchored to the input, so the list floats over what follows
                instead of shoving the rest of the form down. */}
            <div className="relative">
              <input
                id="send-job-search"
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
              <div className="absolute left-0 right-0 top-full z-10 max-h-44 overflow-y-auto border border-neutral-200 bg-white shadow-lg dark:border-neutral-700 dark:bg-neutral-900">
                {loadingJobs ? (
                  <p className="px-3 py-2 text-sm text-neutral-400">Loading…</p>
                ) : jobs.length === 0 ? (
                  <p className="px-3 py-2 text-sm text-neutral-400">
                    No jobs found.
                  </p>
                ) : (
                  jobs.map((option) => (
                    <button
                      key={option.id}
                      type="button"
                      onClick={() => {
                        setJob(option);
                        // Collapse the list and show the choice in the field.
                        setQuery(labelFor(option));
                        setShowResults(false);
                      }}
                      className="block w-full px-3 py-2 text-left text-sm text-neutral-700 transition-colors hover:bg-neutral-50 dark:text-neutral-300 dark:hover:bg-neutral-800"
                    >
                      {labelFor(option)}
                    </button>
                  ))
                )}
                </div>
              )}
            </div>

            {job && !showResults && (
              <p className="text-xs text-neutral-500 dark:text-neutral-400">
                Sending to {labelFor(job)}
              </p>
            )}
          </div>

          <div className="space-y-2" ref={substationFieldRef}>
            <label
              htmlFor="send-job-substation"
              className="text-sm font-medium text-neutral-900 dark:text-white"
            >
              Substation
            </label>
            <div className="relative">
              <input
                id="send-job-substation"
                value={substation}
                onChange={(e) => {
                  setSubstation(e.target.value);
                  setSubstationOpen(true);
                }}
                onFocus={() => setSubstationOpen(true)}
                placeholder={defaultSubstation || "e.g., Main Substation"}
                className="w-full rounded-none border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 outline-none focus:border-brand dark:border-neutral-700 dark:bg-neutral-900 dark:text-white"
              />

              {/* Suggestions from the selected job. Free text still wins, so a
                  substation not yet used on the job can be typed in. */}
              {substationOpen && matchingSubstations.length > 0 && (
                <div className="absolute left-0 right-0 top-full z-10 max-h-36 overflow-y-auto border border-neutral-200 bg-white shadow-lg dark:border-neutral-700 dark:bg-neutral-900">
                  {matchingSubstations.map((option) => (
                    <button
                      key={option}
                      type="button"
                      onClick={() => {
                        setSubstation(option);
                        setSubstationOpen(false);
                      }}
                      className="block w-full px-3 py-2 text-left text-sm text-neutral-700 transition-colors hover:bg-neutral-50 dark:text-neutral-300 dark:hover:bg-neutral-800"
                    >
                      {option}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <p className="text-xs text-neutral-500 dark:text-neutral-400">
              You can edit this later if needed
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
            disabled={busy || !job || !name.trim()}
            className="rounded-none bg-brand px-3.5 py-2 text-sm font-medium text-white hover:bg-brand-dark disabled:opacity-50"
          >
            {busy ? "Sending…" : "Send to Job"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
};

export default SendToJobDialog;
