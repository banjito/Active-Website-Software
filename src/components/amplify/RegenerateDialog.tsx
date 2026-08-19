import React, { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

/**
 * Asks for the one change to make, then hands it to the caller to run.
 *
 * A conversion is a single model pass over a hand-maintained workbook, so it
 * gets things wrong in small, specific ways: a value read off the wrong row, a
 * heading picked up as data. Rather than re-uploading, the engineer says what
 * is wrong in a sentence and the saved report is revised in place.
 *
 * The dialog owns the busy/error state so the page does not have to: `onSubmit`
 * is awaited, and anything it throws is shown here with the text still in the
 * box, ready to be reworded.
 */

export interface RegenerateDialogProps {
  open: boolean;
  onClose: () => void;
  /** Report being revised, named in the dialog so a batch is unambiguous. */
  label: string;
  /** Runs the revision. Throwing keeps the dialog open with the message shown. */
  onSubmit: (instruction: string) => Promise<void>;
}

/** Left unfinished on purpose: it reads as a sentence to complete. */
const PLACEHOLDER = "On Rated Voltage, change the value to…";

/** Whole instructions, to show the level of specificity that works. */
const EXAMPLES = [
  "Set the overall status to PASS",
  "The Insulation Resistance table is missing its Phase C row",
];

const RegenerateDialog: React.FC<RegenerateDialogProps> = ({
  open,
  onClose,
  label,
  onSubmit,
}) => {
  const [instruction, setInstruction] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Whether the current press began on the backdrop rather than the panel. */
  const pressedBackdrop = useRef(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Fresh box each time it opens: the last instruction has already been applied.
  useEffect(() => {
    if (!open) return;
    setInstruction("");
    setError(null);
    setBusy(false);
    inputRef.current?.focus();
  }, [open]);

  const close = useCallback(() => {
    if (busy) return;
    onClose();
  }, [busy, onClose]);

  const submit = useCallback(async () => {
    const ask = instruction.trim();
    if (!ask || busy) return;
    setBusy(true);
    setError(null);
    try {
      await onSubmit(ask);
      onClose();
    } catch (err) {
      setError(String((err as Error)?.message || err));
    } finally {
      setBusy(false);
    }
  }, [instruction, busy, onSubmit, onClose]);

  // Escape closes, but not mid-revision: the call is already paid for.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, close]);

  if (!open) return null;

  // Portalled to <body> for the same reason as SendToJobDialog: an ancestor
  // with a transform would otherwise pin the backdrop inside the page content.
  return createPortal(
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Regenerate report"
      onMouseDown={(e) => {
        pressedBackdrop.current = e.target === e.currentTarget;
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget && pressedBackdrop.current) close();
        pressedBackdrop.current = false;
      }}
    >
      <div className="max-h-full w-full max-w-lg overflow-y-auto border border-neutral-200 bg-white p-6 dark:border-neutral-700 dark:bg-neutral-900">
        <h2 className="text-lg font-bold text-neutral-900 dark:text-white">
          Regenerate
        </h2>
        <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
          Say what to change on {label}. Everything else is left exactly as it
          is.
        </p>

        <div className="mt-5 space-y-4">
          <div className="space-y-2">
            <label
              htmlFor="regenerate-instruction"
              className="text-sm font-medium text-neutral-900 dark:text-white"
            >
              What should change?
            </label>
            <textarea
              id="regenerate-instruction"
              ref={inputRef}
              rows={3}
              value={instruction}
              onChange={(e) => setInstruction(e.target.value)}
              // Enter alone inserts a newline: an instruction can run to a
              // second line, and a half-typed one must not be sent.
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault();
                  void submit();
                }
              }}
              placeholder={PLACEHOLDER}
              disabled={busy}
              className="w-full resize-y rounded-none border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 outline-none focus:border-brand disabled:opacity-60 dark:border-neutral-700 dark:bg-neutral-900 dark:text-white"
            />
            <p className="text-xs text-neutral-500 dark:text-neutral-400">
              One change at a time works best. ⌘/Ctrl + Enter to run.
            </p>
          </div>

          {/* Examples double as one-click starting points to edit. */}
          {!busy && instruction.trim() === "" && (
            <div className="flex flex-wrap gap-2">
              {EXAMPLES.map((example) => (
                <button
                  key={example}
                  type="button"
                  onClick={() => {
                    setInstruction(example);
                    inputRef.current?.focus();
                  }}
                  className="rounded-none border border-neutral-200 bg-white px-2.5 py-1 text-xs text-neutral-600 transition-colors hover:border-brand hover:text-brand dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-400"
                >
                  {example}
                </button>
              ))}
            </div>
          )}

          {error && (
            <div className="rounded-none border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">
              {error}
            </div>
          )}
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            onClick={close}
            disabled={busy}
            className="rounded-none border border-neutral-200 bg-white px-3.5 py-2 text-sm font-medium text-neutral-700 hover:border-neutral-300 disabled:opacity-50 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-300"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={busy || instruction.trim() === ""}
            className="rounded-none bg-brand px-3.5 py-2 text-sm font-medium text-white hover:bg-brand-dark disabled:opacity-50"
          >
            {busy ? "Regenerating…" : "Regenerate"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
};

export default RegenerateDialog;
