/**
 * Formula reference on hover.
 *
 * Rest the pointer on a table cell, column header or field for half a second and a
 * small pop-up shows the reference to use in formulas ({IR.C2.R3}, {JD.tcf}).
 * It goes away as soon as the pointer leaves that cell. Alt+click a cell to
 * copy its reference.
 *
 * Cells only carry plain markers (section id, column id, row index, field id;
 * see `refAttrs`); the text is worked out here from the full section, so a
 * split table (where a piece shows only some columns) still numbers its
 * columns across the whole table.
 */

import React, { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "react-hot-toast";
import type { SectionConfig } from "@/lib/types/customForms";
import { getSectionReferenceCode } from "@/lib/customForms/formCellResolution";

const DELAY_MS = 500;

/** Markers for a cell, column header or field. */
export function refAttrs(
  sectionId: string,
  target: { columnId: string; rowIndex?: number } | { fieldId: string },
): Record<string, string> {
  if ("fieldId" in target) {
    return { "data-fref-section": sectionId, "data-fref-field": target.fieldId };
  }
  const attrs: Record<string, string> = {
    "data-fref-section": sectionId,
    "data-fref-col": target.columnId,
  };
  if (target.rowIndex != null && target.rowIndex >= 0) {
    attrs["data-fref-row"] = String(target.rowIndex);
  }
  return attrs;
}

interface ResolvedRef {
  text: string;
  detail: string;
}

function resolveRef(el: HTMLElement, sections: readonly SectionConfig[]): ResolvedRef | null {
  const section = sections.find((s) => s.id === el.dataset.frefSection);
  if (!section) return null;
  const code = getSectionReferenceCode(section);
  const fieldId = el.dataset.frefField;
  if (fieldId) {
    const field =
      section.fields?.find((f) => f.id === fieldId) ??
      (section.field?.id === fieldId ? section.field : undefined);
    return { text: `{${code}.${fieldId}}`, detail: field?.label || fieldId };
  }
  const columnId = el.dataset.frefCol;
  const columns = section.columns ?? [];
  const index = columns.findIndex((c) => c.id === columnId);
  if (index < 0) return null;
  const label = columns[index].label || `Column ${index + 1}`;
  const row = el.dataset.frefRow;
  if (row == null) {
    return { text: `{${code}.C${index + 1}}`, detail: `${label}, same row` };
  }
  const r = Number(row) + 1;
  return { text: `{${code}.C${index + 1}.R${r}}`, detail: `${label}, row ${r}` };
}

export const FormulaRefHover: React.FC<{
  /** Every section the wrapped area shows (references are worked out from these). */
  sections: readonly SectionConfig[];
  children: React.ReactNode;
  className?: string;
}> = ({ sections, children, className }) => {
  const [tip, setTip] = useState<(ResolvedRef & { x: number; y: number }) | null>(null);
  const current = useRef<HTMLElement | null>(null);
  const timer = useRef<number | null>(null);
  const sectionsRef = useRef(sections);
  sectionsRef.current = sections;

  const clear = useCallback(() => {
    if (timer.current != null) window.clearTimeout(timer.current);
    timer.current = null;
  }, []);

  const hide = useCallback(() => {
    clear();
    current.current = null;
    setTip(null);
  }, [clear]);

  useEffect(() => clear, [clear]);

  const onMouseMove = (e: React.MouseEvent) => {
    const el = (e.target as HTMLElement).closest<HTMLElement>("[data-fref-section]");
    if (el !== current.current) {
      // Moved onto another cell (or off all of them): start over.
      setTip(null);
      current.current = el;
    } else if (tip) {
      return; // Still on the shown cell; keep it.
    }
    clear();
    if (!el) return;
    const { clientX, clientY } = e;
    // Restarted on every move, so it only fires once the pointer is still.
    timer.current = window.setTimeout(() => {
      const ref = resolveRef(el, sectionsRef.current);
      if (ref) setTip({ ...ref, x: clientX, y: clientY });
    }, DELAY_MS);
  };

  const onClickCapture = (e: React.MouseEvent) => {
    if (!e.altKey) return;
    const el = (e.target as HTMLElement).closest<HTMLElement>("[data-fref-section]");
    const ref = el && resolveRef(el, sectionsRef.current);
    if (!ref) return;
    e.preventDefault();
    e.stopPropagation();
    navigator.clipboard?.writeText(ref.text).then(
      () => toast.success(`Copied ${ref.text}`),
      () => toast.error("Couldn't copy"),
    );
  };

  return (
    <div
      className={className}
      onMouseMove={onMouseMove}
      onMouseLeave={hide}
      onClickCapture={onClickCapture}
    >
      {children}
      {tip && (
        <div
          role="tooltip"
          className="pointer-events-none fixed z-[200] border border-amber-400 bg-white dark:bg-dark-150 px-2 py-1 shadow-md rounded-none print:hidden"
          style={{
            left: Math.min(tip.x + 12, window.innerWidth - 240),
            top: tip.y + 16,
          }}
        >
          <div className="font-mono text-xs font-semibold text-amber-700 dark:text-amber-300">
            {tip.text}
          </div>
          <div className="text-[10px] text-neutral-500 dark:text-neutral-400">
            {tip.detail} · Alt+click to copy
          </div>
        </div>
      )}
    </div>
  );
};

export default FormulaRefHover;
