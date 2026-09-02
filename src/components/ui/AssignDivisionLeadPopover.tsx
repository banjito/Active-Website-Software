import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Search, UserX, X } from "lucide-react";
import { LoadingSpinner } from "./LoadingSpinner";
import { toast } from "./toast";
import {
  fetchEmployeeRoster,
  type RosterEmployee,
} from "@/lib/utils/employeeRoster";
import {
  leadTitleFor,
  saveDivisionLead,
  type DivisionLead,
} from "@/services/divisionLeadsService";

const WIDTH = 300;
const MAX_HEIGHT = 380;
const GAP = 8;

interface AssignDivisionLeadPopoverProps {
  /** Where the icon that opened this sits, in viewport coordinates. */
  anchor: DOMRect;
  divisionId: string;
  divisionLabel: string;
  current: DivisionLead | null;
  onClose: () => void;
  onSaved: () => void;
}

export function AssignDivisionLeadPopover({
  anchor,
  divisionId,
  divisionLabel,
  current,
  onClose,
  onSaved,
}: AssignDivisionLeadPopoverProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [roster, setRoster] = useState<RosterEmployee[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");

  const title = leadTitleFor(divisionId);

  // Fixed rather than absolute: the sidebar nav scrolls with overflow-y-auto, which would
  // clip a popover positioned inside it.
  const position = useMemo(() => {
    const spaceRight = window.innerWidth - anchor.right;
    const left =
      spaceRight >= WIDTH + GAP
        ? anchor.right + GAP
        : Math.max(GAP, anchor.left - WIDTH - GAP);
    const top = Math.min(
      Math.max(GAP, anchor.top),
      Math.max(GAP, window.innerHeight - MAX_HEIGHT - GAP),
    );
    return { left, top };
  }, [anchor]);

  useEffect(() => {
    fetchEmployeeRoster()
      .then(setRoster)
      .catch((err) => {
        console.error("Failed to load employee roster:", err);
        toast({ title: "Could not load people", variant: "destructive" });
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    const onPointerDown = (e: MouseEvent) => {
      if (!panelRef.current?.contains(e.target as Node)) onClose();
    };
    // The anchor moves with the sidebar, so a resize invalidates the position we measured.
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

  const visible = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return roster;
    return roster.filter((p) =>
      `${p.name} ${p.email} ${p.division}`.toLowerCase().includes(query),
    );
  }, [roster, search]);

  const assign = useCallback(
    async (lead: DivisionLead | null) => {
      setSaving(true);
      try {
        await saveDivisionLead(divisionId, lead);
        toast({
          title: lead
            ? `${lead.name} is now ${title} for ${divisionLabel}`
            : `${title} cleared for ${divisionLabel}`,
          variant: "success",
        });
        onSaved();
        onClose();
      } catch (err: any) {
        console.error("Failed to save division lead:", err);
        toast({
          title: `Could not set the ${title.toLowerCase()}`,
          // Only administrators can write app_settings; say that rather than showing a
          // raw policy error.
          description:
            err?.code === "42501"
              ? "Only an administrator can change this."
              : err?.message,
          variant: "destructive",
        });
      } finally {
        setSaving(false);
      }
    },
    [divisionId, divisionLabel, title, onClose, onSaved],
  );

  return createPortal(
    <div
      ref={panelRef}
      role="dialog"
      aria-label={`Assign ${title} for ${divisionLabel}`}
      style={{
        position: "fixed",
        left: position.left,
        top: position.top,
        width: WIDTH,
        maxHeight: MAX_HEIGHT,
      }}
      className="z-[60] flex flex-col rounded-none border border-neutral-300 bg-white shadow-lg dark:border-neutral-600 dark:bg-dark-150"
    >
      <div className="flex items-start gap-2 border-b border-neutral-200 px-3 py-2 dark:border-neutral-700">
        <div className="flex min-w-0 flex-col">
          <span className="text-sm font-semibold text-neutral-900 dark:text-white">
            Assign {title}
          </span>
          <span className="truncate text-xs text-neutral-500 dark:text-neutral-400">
            {divisionLabel}
            {current ? ` · currently ${current.name}` : ""}
          </span>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="ml-auto shrink-0 p-1 text-neutral-400 transition-colors hover:text-neutral-700 dark:hover:text-white"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="border-b border-neutral-200 p-2 dark:border-neutral-700">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search people…"
            autoFocus
            className="w-full rounded-none border border-neutral-300 bg-white py-1.5 pl-8 pr-2 text-sm text-neutral-900 focus:outline-none focus:ring-2 focus:ring-brand dark:border-neutral-600 dark:bg-dark-100 dark:text-white"
          />
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex justify-center py-6">
            <LoadingSpinner size="sm" />
          </div>
        ) : visible.length === 0 ? (
          <p className="px-3 py-6 text-center text-sm text-neutral-500 dark:text-neutral-400">
            Nobody matches that search.
          </p>
        ) : (
          visible.map((person) => {
            const isCurrent = current?.id === person.id;
            return (
              <button
                key={person.id}
                type="button"
                disabled={saving}
                onClick={() =>
                  assign({
                    id: person.id,
                    email: person.email,
                    name: person.name,
                  })
                }
                className={`flex w-full flex-col items-start gap-0.5 border-b border-neutral-100 px-3 py-2 text-left last:border-b-0 hover:bg-neutral-50 disabled:opacity-50 dark:border-neutral-700 dark:hover:bg-dark-100 ${
                  isCurrent ? "bg-neutral-50 dark:bg-dark-100" : ""
                }`}
              >
                <span className="text-sm font-medium text-neutral-900 dark:text-white">
                  {person.name}
                  {isCurrent && (
                    <span className="ml-2 text-xs font-normal text-brand">
                      current
                    </span>
                  )}
                </span>
                <span className="truncate text-xs text-neutral-500 dark:text-neutral-400">
                  {person.email}
                </span>
              </button>
            );
          })
        )}
      </div>

      {current && (
        <div className="border-t border-neutral-200 p-2 dark:border-neutral-700">
          <button
            type="button"
            disabled={saving}
            onClick={() => assign(null)}
            className="flex w-full items-center gap-2 px-2 py-1.5 text-sm text-red-600 transition-colors hover:bg-red-50 disabled:opacity-50 dark:text-red-400 dark:hover:bg-red-900/20"
          >
            <UserX className="h-4 w-4" />
            Clear {title.toLowerCase()}
          </button>
        </div>
      )}
    </div>,
    document.body,
  );
}

export default AssignDivisionLeadPopover;
