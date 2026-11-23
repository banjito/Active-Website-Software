import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { Download, FileText, X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/Dialog";

export interface FileViewerAction {
  icon: LucideIcon;
  /** Shown on hover and read by screen readers. */
  label: string;
  onClick: () => void;
  /** Red on hover, for delete-type actions. */
  danger?: boolean;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  subtitle?: ReactNode;
  /** The file's address. PDFs and images preview; anything else offers a download. */
  url?: string | null;
  /** Original file name, used to tell the file type when the address doesn't show it. */
  fileName?: string | null;
  /** MIME type, when known (e.g. "application/pdf"). Wins over the name. */
  fileType?: string | null;
  /** Icon-only buttons in the header (download, share link, ...). */
  actions?: FileViewerAction[];
  /** Used when there's no preview, e.g. a Word file. */
  onDownload?: () => void;
  /** Custom content instead of the file preview. */
  children?: ReactNode;
}

const extensionOf = (value?: string | null) =>
  (value ?? "").split(/[?#]/)[0].split(".").pop()?.toLowerCase() ?? "";

/** Shared icon button: no border, gray until hovered. */
export const viewerIconButtonClass =
  "p-2 text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-white";
const dangerIconButtonClass =
  "p-2 text-neutral-500 transition-colors hover:bg-red-50 hover:text-red-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500 dark:text-neutral-400 dark:hover:bg-red-950/40 dark:hover:text-red-400";

/**
 * Near full-screen document viewer: slim header, icon-only actions, the file
 * fills the rest. One close button (the window's own, top right).
 */
export default function FileViewerDialog({
  open,
  onOpenChange,
  title,
  subtitle,
  url,
  fileName,
  fileType,
  actions = [],
  onDownload,
  children,
}: Props) {
  const ext = extensionOf(url) || extensionOf(fileName);
  const fromName = extensionOf(fileName);
  const mime = (fileType ?? "").toLowerCase();
  const isPdf = mime === "application/pdf" || ext === "pdf" || fromName === "pdf";
  const isImage =
    mime.startsWith("image/") ||
    /^(jpg|jpeg|png|gif|svg|webp)$/.test(ext) ||
    /^(jpg|jpeg|png|gif|svg|webp)$/.test(fromName);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* [&>button]:hidden hides the window's own close; ours sits in line with the other icons */}
      <DialogContent className="flex h-[96vh] max-h-[96vh] w-[98vw] max-w-[98vw] flex-col gap-0 overflow-hidden p-0 sm:max-w-[98vw] [&>button]:hidden">
        <div className="flex shrink-0 items-center gap-3 border-b border-neutral-200 py-2 pl-4 pr-2 dark:border-neutral-800">
          <div className="min-w-0 flex-1">
            <DialogTitle className="truncate text-base font-semibold leading-tight">{title}</DialogTitle>
            {subtitle ? (
              <DialogDescription className="truncate text-xs text-neutral-500 dark:text-neutral-400">
                {subtitle}
              </DialogDescription>
            ) : (
              <DialogDescription className="sr-only">Document preview</DialogDescription>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-1">
              {actions.map((a) => {
                const Icon = a.icon;
                return (
                  <button
                    key={a.label}
                    type="button"
                    onClick={a.onClick}
                    title={a.label}
                    aria-label={a.label}
                    className={a.danger ? dangerIconButtonClass : viewerIconButtonClass}
                  >
                    <Icon className="h-4 w-4" />
                  </button>
                );
              })}
              <button
                type="button"
                onClick={() => onOpenChange(false)}
                title="Close"
                aria-label="Close"
                className={viewerIconButtonClass}
              >
                <X className="h-4 w-4" />
              </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 bg-neutral-100 dark:bg-neutral-900">
          {children ??
            (!url ? (
              <div className="flex h-full items-center justify-center text-sm text-neutral-500 dark:text-neutral-400">
                No file attached.
              </div>
            ) : isPdf ? (
              <iframe src={url} title={title} className="block h-full w-full border-0" />
            ) : isImage ? (
              <img src={url} alt={title} className="h-full w-full object-contain" />
            ) : (
              <div className="flex h-full items-center justify-center">
                <div className="text-center">
                  <FileText className="mx-auto mb-3 h-12 w-12 text-neutral-400" aria-hidden="true" />
                  <p className="text-sm text-neutral-600 dark:text-neutral-400">No preview for this file type.</p>
                  {onDownload && (
                    <button
                      type="button"
                      onClick={onDownload}
                      className="mt-3 inline-flex items-center gap-2 border border-neutral-300 px-3 py-1.5 text-sm text-neutral-800 hover:bg-white dark:border-neutral-600 dark:text-neutral-100 dark:hover:bg-neutral-800"
                    >
                      <Download className="h-4 w-4" aria-hidden="true" />
                      Download to view
                    </button>
                  )}
                </div>
              </div>
            ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
