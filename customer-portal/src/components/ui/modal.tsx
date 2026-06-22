import { useEffect } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  description?: string;
  titleAction?: React.ReactNode;
  panelClassName?: string;
  children: React.ReactNode;
}

/**
 * Minimal accessible modal — backdrop click + Escape to close, body scroll
 * locked while open. Renders as a centered card on desktop and a bottom sheet
 * on mobile. No external dialog dependency.
 */
export function Modal({
  open,
  onClose,
  title,
  description,
  titleAction,
  panelClassName,
  children,
}: ModalProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-end justify-center sm:items-center"
      role="dialog"
      aria-modal="true"
    >
      <div
        className="absolute inset-0 animate-fade-in bg-background/70 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden
      />
      <div
        className={cn(
          "relative z-10 max-h-[90vh] w-full max-w-md animate-scale-in overflow-y-auto border bg-card p-6 shadow-lift",
          panelClassName,
        )}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute right-4 top-4 inline-flex h-8 w-8 items-center justify-center text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>
        {(title || titleAction) && (
          <div className="flex min-w-0 items-center gap-3 pr-10">
            {title && (
              <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
            )}
            {titleAction && <div className="shrink-0">{titleAction}</div>}
          </div>
        )}
        {description && (
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        )}
        <div className={title || description ? "mt-5" : ""}>{children}</div>
      </div>
    </div>,
    document.body,
  );
}
