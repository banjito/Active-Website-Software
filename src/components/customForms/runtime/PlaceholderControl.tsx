/**
 * The placeholder control renderer.
 *
 * Used by the builder canvas and the builder preview tab, where no instance
 * data exists yet. It draws the shape of a control rather than a live one, and
 * shows what the builder configured for the cell: fixed static text, a
 * per-cell formula, or an auto-filled value.
 */

import React from "react";
import { cellKey, type ControlSlot } from "@/lib/customForms/runtime";

export interface PlaceholderOptions {
  /** Builder canvas uses shorter boxes than the preview tab. */
  density?: "compact" | "normal";
}

function boxHeight(slot: ControlSlot, compact: boolean): string {
  if (slot.field.type === "textarea") {
    if (slot.placement === "single") return compact ? "h-16" : "h-20";
    return "h-16";
  }
  return compact ? "h-6" : "h-8";
}

export function createPlaceholderControlRenderer(
  { density = "normal" }: PlaceholderOptions = {},
): (slot: ControlSlot) => React.ReactNode {
  const compact = density === "compact";

  return function renderControl(slot: ControlSlot) {
    const { field, cell, section } = slot;

    if (field.cellBehavior === "static") {
      const text =
        (cell
          ? section.staticCells?.[cellKey(cell.rowIndex, cell.colId)]
          : undefined) ||
        field.staticValue ||
        "";
      return (
        <div className="h-6 flex items-center">
          <span className="text-[11px] text-neutral-700 dark:text-neutral-300 truncate">
            {text || <span className="italic text-neutral-400">static</span>}
          </span>
        </div>
      );
    }

    const formula = cell
      ? section.cellFormulas?.[cellKey(cell.rowIndex, cell.colId)]
      : undefined;
    if (formula) {
      return (
        <div className="h-6 bg-amber-50 dark:bg-amber-900/20 rounded px-1 flex items-center">
          <span className="text-[10px] font-mono text-amber-700 dark:text-amber-300 truncate">
            {formula}
          </span>
        </div>
      );
    }

    const auto =
      field.readOnly ||
      field.cellBehavior === "populate" ||
      field.cellBehavior === "calculate";

    return (
      <div
        className={`${boxHeight(slot, compact)} ${
          auto
            ? "bg-neutral-200 dark:bg-dark-200"
            : "bg-neutral-100 dark:bg-dark-100"
        } rounded`}
      />
    );
  };
}
