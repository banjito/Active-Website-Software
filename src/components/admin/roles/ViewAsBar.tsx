import { useEffect } from "react";
import { createPortal } from "react-dom";
import { Eye, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { getViewAs, stopViewAs } from "@/lib/viewAs";

/** Bar across the bottom of a "View as" tab (Roles scope item 4). */
export default function ViewAsBar() {
  const viewAs = getViewAs();

  // Keep the bottom of every page reachable above the bar.
  useEffect(() => {
    if (!viewAs) return;
    const before = document.body.style.paddingBottom;
    document.body.style.paddingBottom = "88px";
    return () => {
      document.body.style.paddingBottom = before;
    };
  }, [viewAs]);

  if (!viewAs) return null;

  return createPortal(
    <div
      role="status"
      className="fixed inset-x-0 bottom-0 z-[9999] border-t-4 border-brand bg-white text-neutral-900 shadow-[0_-4px_16px_rgba(0,0,0,0.12)] dark:bg-neutral-900 dark:text-white print:hidden"
    >
      <div className="mx-auto flex max-w-screen-xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
        <Eye className="h-5 w-5 shrink-0 text-brand" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">
            Viewing as {viewAs.label}
            {viewAs.unsaved && (
              <span className="font-normal text-neutral-500 dark:text-neutral-400">
                {" "}
                (with unsaved changes)
              </span>
            )}
          </p>
          <p className="text-xs text-neutral-600 dark:text-neutral-400">
            Read-only, nothing saves. Shows this role's menus and screens; the data is still what you can see.
          </p>
        </div>
        <Button size="sm" leftIcon={<X className="h-4 w-4" />} onClick={stopViewAs}>
          Exit View as
        </Button>
      </div>
    </div>,
    document.body,
  );
}
