import { useEffect } from "react";
import { createRoot } from "react-dom/client";
import { AlertTriangle } from "lucide-react";

/**
 * In-app replacement for window.confirm(). Centered modal, app styling,
 * dark mode. Resolves true on confirm, false on cancel / Escape / backdrop.
 *
 *   if (!(await confirmDialog({ title: "Delete this estimate?" }))) return;
 */
export interface ConfirmDialogOptions {
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Red confirm button for destructive actions. */
  destructive?: boolean;
}

function ConfirmDialogView({
  title,
  description,
  confirmLabel = "OK",
  cancelLabel = "Cancel",
  destructive = false,
  onDone,
}: ConfirmDialogOptions & { onDone: (ok: boolean) => void }) {
  useEffect(() => {
    // Capture phase on window runs before any other key handler, so Esc/Enter
    // stop here and don't also close a modal (e.g. a Headless UI Dialog) below.
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" && e.key !== "Enter") return;
      e.preventDefault();
      e.stopImmediatePropagation();
      onDone(e.key === "Enter");
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onDone]);

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
    >
      <div
        className="absolute inset-0 bg-black/40"
        onClick={() => onDone(false)}
      />
      <div className="relative w-full max-w-md rounded-none bg-white dark:bg-dark-150 shadow-xl border border-neutral-200 dark:border-dark-200 p-6">
        <div className="flex items-start gap-3">
          {destructive && (
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-none bg-red-100 dark:bg-red-950/50">
              <AlertTriangle className="h-5 w-5 text-red-600 dark:text-red-400" />
            </div>
          )}
          <div className="flex-1">
            <h3 className="text-base font-semibold text-neutral-900 dark:text-dark-900">
              {title}
            </h3>
            {description && (
              <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">
                {description}
              </p>
            )}
          </div>
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            onClick={() => onDone(false)}
            className="px-4 py-2 text-sm font-medium rounded-none border border-neutral-300 dark:border-dark-200 bg-white dark:bg-dark-100 text-neutral-700 dark:text-neutral-200 hover:bg-neutral-50 dark:hover:bg-dark-200"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            autoFocus
            onClick={() => onDone(true)}
            className={`px-4 py-2 text-sm font-medium rounded-none text-white ${
              destructive
                ? "bg-red-600 hover:bg-red-700"
                : "bg-brand hover:bg-brand/90"
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

export function confirmDialog(options: ConfirmDialogOptions): Promise<boolean> {
  return new Promise((resolve) => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);
    let settled = false;
    const onDone = (ok: boolean) => {
      if (settled) return;
      settled = true;
      root.unmount();
      host.remove();
      resolve(ok);
    };
    root.render(<ConfirmDialogView {...options} onDone={onDone} />);
  });
}

export default confirmDialog;
