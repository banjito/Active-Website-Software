import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { toast } from "./toast";
import {
  createDivision,
  slugifyDivisionId,
  type Division,
} from "@/services/divisionsService";

const WIDTH = 300;
const GAP = 8;
const ESTIMATED_HEIGHT = 240;

interface NewDivisionPopoverProps {
  /** Where the "+ New Division" button sits, in viewport coordinates. */
  anchor: DOMRect;
  onClose: () => void;
  onCreated: (division: Division) => void;
}

export function NewDivisionPopover({
  anchor,
  onClose,
  onCreated,
}: NewDivisionPopoverProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [label, setLabel] = useState("");
  const [saving, setSaving] = useState(false);

  // Fixed rather than absolute, for the same reason AssignDivisionLeadPopover is:
  // the sidebar scrolls, and would clip a popover positioned inside it.
  const position = useMemo(() => {
    const spaceRight = window.innerWidth - anchor.right;
    const left =
      spaceRight >= WIDTH + GAP
        ? anchor.right + GAP
        : Math.max(GAP, anchor.left - WIDTH - GAP);
    const top = Math.min(
      Math.max(GAP, anchor.top),
      Math.max(GAP, window.innerHeight - ESTIMATED_HEIGHT - GAP),
    );
    return { left, top };
  }, [anchor]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    const onPointerDown = (e: MouseEvent) => {
      if (!panelRef.current?.contains(e.target as Node)) onClose();
    };
    const onResize = () => onClose();

    document.addEventListener("keydown", onKeyDown);
    // Capture phase, so a click lands before the button underneath reopens it.
    document.addEventListener("mousedown", onPointerDown, true);
    window.addEventListener("resize", onResize);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("mousedown", onPointerDown, true);
      window.removeEventListener("resize", onResize);
    };
  }, [onClose]);

  const previewId = slugifyDivisionId(label);

  const submit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (saving || !previewId) return;
      setSaving(true);
      try {
        const division = await createDivision({ label });
        toast({
          title: `${division.label} added`,
          description: `Jobs can now be filed under /${division.id}/jobs.`,
          variant: "success",
        });
        onCreated(division);
        onClose();
      } catch (err: any) {
        console.error("Failed to create division:", err);
        toast({
          title: "Could not add the division",
          description: err?.message,
          variant: "destructive",
        });
      } finally {
        setSaving(false);
      }
    },
    [label, previewId, saving, onClose, onCreated],
  );

  return createPortal(
    <form
      ref={panelRef}
      onSubmit={submit}
      role="dialog"
      aria-label="Add a division"
      style={{ position: "fixed", left: position.left, top: position.top, width: WIDTH }}
      className="z-[60] flex flex-col rounded-none border border-neutral-300 bg-white shadow-lg dark:border-neutral-600 dark:bg-dark-150"
    >
      <div className="flex items-start gap-2 border-b border-neutral-200 px-3 py-2 dark:border-neutral-700">
        <span className="text-sm font-semibold text-neutral-900 dark:text-white">
          New division
        </span>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="ml-auto shrink-0 p-1 text-neutral-400 transition-colors hover:text-neutral-700 dark:hover:text-white"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="flex flex-col gap-2 p-3">
        <label
          htmlFor="new-division-label"
          className="text-xs font-medium text-neutral-600 dark:text-neutral-400"
        >
          Name shown in the sidebar
        </label>
        <input
          id="new-division-label"
          type="text"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="Dallas"
          autoFocus
          maxLength={60}
          className="w-full rounded-none border border-neutral-300 bg-white px-2 py-1.5 text-sm text-neutral-900 focus:outline-none focus:ring-2 focus:ring-brand dark:border-neutral-600 dark:bg-dark-100 dark:text-white"
        />
        <p className="text-xs text-neutral-500 dark:text-neutral-400">
          {previewId ? (
            <>
              Jobs will live at{" "}
              <span className="font-mono text-neutral-700 dark:text-neutral-200">
                /{previewId}/jobs
              </span>
              . The id is permanent.
            </>
          ) : (
            "The name becomes the URL, so it needs letters or numbers."
          )}
        </p>
      </div>

      <div className="flex justify-end gap-2 border-t border-neutral-200 p-2 dark:border-neutral-700">
        <button
          type="button"
          onClick={onClose}
          className="px-3 py-1.5 text-sm text-neutral-600 transition-colors hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={saving || !previewId}
          className="bg-brand px-3 py-1.5 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {saving ? "Adding…" : "Add division"}
        </button>
      </div>
    </form>,
    document.body,
  );
}

export default NewDivisionPopover;
