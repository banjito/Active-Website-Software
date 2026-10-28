import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import {
  fetchReportActivity,
  fetchUserNames,
  reportStatusLabel,
  type ReportActivity,
} from "@/services/reportActivityService";
import {
  ACTION_ITEM_STATUS_LABELS,
  type ActionItemStatus,
} from "@/services/reportActionItemService";

interface ReportHistoryDialogProps {
  assetId: string;
  reportName?: string;
  /** From the assets row; shown as the first entry. */
  createdAt?: string | null;
  createdBy?: string | null;
  onClose: () => void;
}

const DOT_STYLES: Record<string, string> = {
  in_progress: "bg-yellow-500",
  ready_for_review: "bg-blue-500",
  approved: "bg-green-500",
  sent: "bg-purple-500",
  issue: "bg-red-500",
};

const formatWhen = (iso: string) =>
  new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

function describe(row: ReportActivity): string {
  if (row.kind === "fix_note") return "Fix note";
  if (row.kind === "review_comment") return "Reviewer note updated";
  if (row.kind === "action_item") {
    const label = (s: string | null) =>
      ACTION_ITEM_STATUS_LABELS[s as ActionItemStatus] ?? s ?? "";
    return row.from_status
      ? `Action item ${label(row.from_status)} → ${label(row.to_status)}`
      : "Action item added";
  }
  return `${reportStatusLabel(row.from_status)} → ${reportStatusLabel(row.to_status)}`;
}

/**
 * Timeline of everything that happened to one report: status changes with who
 * and when, reviewer notes, and the tech's fix notes. Opened from the report's
 * status menu.
 */
export const ReportHistoryDialog: React.FC<ReportHistoryDialogProps> = ({
  assetId,
  reportName,
  createdAt,
  createdBy,
  onClose,
}) => {
  const [rows, setRows] = useState<ReportActivity[] | null>(null);
  const [creatorName, setCreatorName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [activity, names] = await Promise.all([
          fetchReportActivity(assetId),
          fetchUserNames([createdBy]),
        ]);
        if (cancelled) return;
        setRows(activity);
        setCreatorName(createdBy ? names[createdBy] ?? null : null);
      } catch (e) {
        console.error("[ReportHistory] Failed to load:", e);
        if (!cancelled) setError("Couldn't load this report's history. Try again in a moment.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [assetId, createdBy]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Newest first, so the latest review is at the top.
  const entries = rows ? [...rows].reverse() : [];
  const hasBackfilled = entries.some((r) => r.backfilled);

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4 print:hidden"
      role="dialog"
      aria-modal="true"
      aria-labelledby="report-history-title"
    >
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full max-w-xl max-h-[85vh] flex flex-col rounded-none bg-white dark:bg-dark-150 shadow-xl border border-neutral-200 dark:border-dark-200">
        <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-neutral-200 dark:border-dark-200">
          <div className="min-w-0">
            <h3
              id="report-history-title"
              className="text-base font-semibold text-neutral-900 dark:text-dark-900"
            >
              Report history
            </h3>
            {reportName && (
              <p className="text-sm text-neutral-600 dark:text-neutral-400 truncate">
                {reportName}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close history"
            className="p-1 rounded-none text-neutral-500 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-dark-100"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="overflow-y-auto px-5 py-4">
          {error ? (
            <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
          ) : rows === null ? (
            <div className="flex justify-center py-6">
              <LoadingSpinner size="sm" />
            </div>
          ) : (
            <ol className="flex flex-col">
              {entries.map((row) => (
                <li key={row.id} className="flex gap-3 pb-4">
                  <span
                    className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-none ${
                      row.kind === "fix_note" || row.kind === "action_item"
                        ? "bg-brand"
                        : row.kind === "review_comment"
                          ? "bg-neutral-400"
                          : DOT_STYLES[row.to_status || ""] || "bg-neutral-400"
                    }`}
                    aria-hidden="true"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-neutral-900 dark:text-dark-900">
                      {describe(row)}
                    </p>
                    <p className="text-xs text-neutral-500 dark:text-neutral-400">
                      {[row.actor_name, formatWhen(row.created_at)]
                        .filter(Boolean)
                        .join(" · ")}
                      {row.backfilled && " · from backups"}
                    </p>
                    {row.comment && (
                      <p
                        className={`mt-1 px-3 py-2 text-sm whitespace-pre-wrap break-words ${
                          row.to_status === "issue" && row.kind !== "fix_note"
                            ? "bg-red-50 text-red-800 dark:bg-red-900/30 dark:text-red-200"
                            : "bg-neutral-100 text-neutral-800 dark:bg-dark-100 dark:text-neutral-200"
                        }`}
                      >
                        {row.comment}
                      </p>
                    )}
                  </div>
                </li>
              ))}
              {createdAt && (
                <li className="flex gap-3">
                  <span
                    className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-none bg-neutral-400"
                    aria-hidden="true"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-neutral-900 dark:text-dark-900">
                      Report created
                    </p>
                    <p className="text-xs text-neutral-500 dark:text-neutral-400">
                      {[creatorName, formatWhen(createdAt)]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  </div>
                </li>
              )}
              {entries.length === 0 && !createdAt && (
                <li className="text-sm text-neutral-500 dark:text-neutral-400">
                  No history yet.
                </li>
              )}
            </ol>
          )}
          {hasBackfilled && (
            <p className="mt-2 text-xs text-neutral-500 dark:text-neutral-400">
              "From backups" entries were rebuilt from saved copies of the
              report, so who made them can be missing.
            </p>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
};

export default ReportHistoryDialog;
