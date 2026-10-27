import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { supabase } from "@/lib/supabase";
import { toast } from "@/components/ui/toast";
import {
  addFixNote,
  awaitingFixNote,
  fetchReportActivity,
  issueRounds,
  type ReportActivity,
} from "@/services/reportActivityService";

/**
 * Asks the tech what they fixed before a report that was sent to Issue goes
 * back to Ready for Review. The note is shown to the next reviewer beside the
 * original Issue comment. Same imperative pattern as confirmDialog.
 */
function FixNoteDialogView({
  issueComment,
  onDone,
}: {
  issueComment: string | null;
  onDone: (note: string | null) => void;
}) {
  const [note, setNote] = useState("");
  const canSave = note.trim().length > 0;

  useEffect(() => {
    // Capture phase so Esc doesn't also close a modal underneath.
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      e.stopImmediatePropagation();
      onDone(null);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onDone]);

  return (
    <div
      className="fixed inset-0 z-[100000] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="fix-note-title"
    >
      <div
        className="absolute inset-0 bg-black/40"
        onClick={() => onDone(null)}
      />
      <div className="relative w-full max-w-lg rounded-none bg-white dark:bg-dark-150 shadow-xl border border-neutral-200 dark:border-dark-200 p-6 flex flex-col gap-4">
        <div>
          <h3
            id="fix-note-title"
            className="text-base font-semibold text-neutral-900 dark:text-dark-900"
          >
            What did you fix?
          </h3>
          <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">
            The reviewer will see this next to their original comment.
          </p>
        </div>
        {issueComment && (
          <div className="border-l-4 border-red-400 dark:border-red-600 bg-red-50 dark:bg-red-900/30 px-3 py-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-red-700 dark:text-red-300">
              Reviewer said
            </p>
            <p className="text-sm text-red-800 dark:text-red-200 whitespace-pre-wrap break-words">
              {issueComment}
            </p>
          </div>
        )}
        <textarea
          id="fix-note-input"
          autoFocus
          rows={4}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="e.g. Retested B phase contact resistance, added 38 µΩ to the table."
          className="form-input w-full rounded-none resize-y"
        />
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={() => onDone(null)}
            className="px-4 py-2 text-sm font-medium rounded-none border border-neutral-300 dark:border-dark-200 bg-white dark:bg-dark-100 text-neutral-700 dark:text-neutral-200 hover:bg-neutral-50 dark:hover:bg-dark-200"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!canSave}
            onClick={() => onDone(note.trim())}
            className="px-4 py-2 text-sm font-medium rounded-none text-white bg-brand hover:bg-brand/90 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Resubmit for Review
          </button>
        </div>
      </div>
    </div>
  );
}

/** Resolves the note, or null when the tech cancels. */
export function askForFixNote(issueComment: string | null): Promise<string | null> {
  return new Promise((resolve) => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);
    let settled = false;
    const onDone = (note: string | null) => {
      if (settled) return;
      settled = true;
      root.unmount();
      host.remove();
      resolve(note);
    };
    root.render(<FixNoteDialogView issueComment={issueComment} onDone={onDone} />);
  });
}

/**
 * Call before moving a report to Ready for Review. If its latest send-back to
 * Issue has no fix note, asks for one and saves it. Resolves false when the tech
 * cancels, so the caller should stop.
 */
export async function ensureFixNote(
  assetId: string,
  currentStatus?: string | null,
): Promise<boolean> {
  // Only reports on their way back from Issue need a note.
  if (
    currentStatus &&
    !["issue", "in_progress", "not started"].includes(currentStatus)
  ) {
    return true;
  }

  let activity: ReportActivity[] = [];
  try {
    activity = await fetchReportActivity(assetId);
  } catch (e) {
    console.warn("[fixNote] Could not load report history:", e);
    if (currentStatus !== "issue") return true;
  }

  const rounds = issueRounds(activity);
  // An Issue from before history was logged has no row, so trust the status.
  const needed =
    awaitingFixNote(activity) ||
    (currentStatus === "issue" && rounds.length === 0);
  if (!needed) return true;

  let issueComment = rounds[rounds.length - 1]?.issue.comment ?? null;
  if (!issueComment) {
    const { data } = await supabase
      .schema("neta_ops")
      .from("assets")
      .select("review_comments")
      .eq("id", assetId)
      .maybeSingle();
    issueComment = data?.review_comments?.trim() || null;
  }

  const note = await askForFixNote(issueComment);
  if (note === null) return false;

  try {
    await addFixNote(assetId, note);
  } catch (e) {
    // Don't hold up the resubmit over the log; the status change still goes through.
    console.error("[fixNote] Failed to save fix note:", e);
    toast({
      title: "Fix note not saved",
      description: "The report will still be resubmitted.",
      variant: "warning",
    });
  }
  return true;
}
