/**
 * Layout and state-key helpers shared by every custom-form renderer.
 */

import type { CSSProperties } from "react";
import type { SectionConfig, TablePrintLayout } from "@/lib/types/customForms";

/** Default first-column labels for a contact-resistance table. */
export const DEFAULT_CONTACT_RESISTANCE_ROW_LABELS = [
  "Section 1",
  "Section 2",
  "Section 3",
  "Section 4",
  "Section 5",
];

export function contactResistanceRowLabels(section: SectionConfig): string[] {
  return section.defaultRowLabels ?? DEFAULT_CONTACT_RESISTANCE_ROW_LABELS;
}

/**
 * How many grid columns a grouped-field section packs into. Job info is always
 * five wide regardless of the stored layout, which is how every renderer has
 * always treated it.
 */
export function groupedFieldColumnCount(section: SectionConfig): number {
  if (section.componentType === "job-info") return 5;
  switch (section.layout) {
    case "five-column":
      return 5;
    case "four-column":
      return 4;
    case "three-column":
      return 3;
    case "two-column":
      return 2;
    default:
      return 1;
  }
}

/** Row count a table section renders, before any per-mode display cap. */
export function resolveRowCount(section: SectionConfig): number {
  if (section.componentType === "contact-resistance") return section.rows ?? 5;
  return section.rows ?? 1;
}

export function minRows(section: SectionConfig): number {
  return section.minRows ?? 1;
}

export function maxRows(section: SectionConfig): number {
  return section.maxRows ?? 100;
}

export function canAddRow(section: SectionConfig, rowCount: number): boolean {
  return !!section.allowAddRows && rowCount < maxRows(section);
}

export function canRemoveRow(section: SectionConfig, rowCount: number): boolean {
  return !!section.allowRemoveRows && rowCount > minRows(section);
}

/** The formData key a table row writes to. */
export function rowStateKey(sectionId: string, rowIndex: number): string {
  return `${sectionId}_row${rowIndex}`;
}

/** The cellFormulas / staticCells key for one cell. */
export function cellKey(rowIndex: number, colId: string): string {
  return `row${rowIndex}_${colId}`;
}

export interface TablePrintStyles {
  wrapperStyle: CSSProperties | undefined;
  rowStyle: CSSProperties | undefined;
}

/** Inline styles for a section's configured print margins and row height. */
export function tablePrintStyles(layout?: TablePrintLayout): TablePrintStyles {
  if (!layout) return { wrapperStyle: undefined, rowStyle: undefined };
  const wrapperStyle: CSSProperties = {};
  if (layout.marginTop) wrapperStyle.marginTop = layout.marginTop;
  if (layout.marginRight) wrapperStyle.marginRight = layout.marginRight;
  if (layout.marginBottom) wrapperStyle.marginBottom = layout.marginBottom;
  if (layout.marginLeft) wrapperStyle.marginLeft = layout.marginLeft;
  return {
    wrapperStyle: Object.keys(wrapperStyle).length ? wrapperStyle : undefined,
    rowStyle: layout.rowHeight ? { minHeight: layout.rowHeight } : undefined,
  };
}

/** Sections in render order. */
export function sortedSections(sections: SectionConfig[]): SectionConfig[] {
  return [...sections].sort((a, b) => a.order - b.order);
}

/** Width a fixed-pixel column is measured against: the form's content width. */
const NOMINAL_TABLE_PX = 960;

function widthAsPercent(width: string | undefined): number | null {
  const match = width?.trim().match(/^(\d*\.?\d+)\s*(%|px|rem|em)?$/i);
  if (!match) return null;
  const value = parseFloat(match[1]);
  if (!(value > 0)) return null;
  switch ((match[2] ?? "px").toLowerCase()) {
    case "%":
      return value;
    case "rem":
    case "em":
      return ((value * 16) / NOMINAL_TABLE_PX) * 100;
    default:
      return (value / NOMINAL_TABLE_PX) * 100;
  }
}

/**
 * Column widths that always fit the table.
 *
 * Widths are authored per column, so nothing stops them adding up to more than
 * the page (the builder once gave every new column 25%), and a fixed-layout
 * table then either runs off the page or crushes the columns with no width to
 * one letter per line. The authored widths are kept as proportions, columns
 * without one get a fair share, nothing drops below half a fair share, and the
 * result is scaled to exactly 100%.
 */
export function fitColumnWidths(widths: readonly (string | undefined)[]): (string | undefined)[] {
  const count = widths.length;
  if (!count) return [];
  const parsed = widths.map(widthAsPercent);
  if (parsed.every((value) => value == null)) return widths.map(() => undefined);

  const fair = 100 / count;
  const known = parsed.filter((value): value is number => value != null);
  const unset = count - known.length;
  const knownTotal = known.reduce((sum, value) => sum + value, 0);
  const unsetShare = unset ? Math.max((100 - knownTotal) / unset, fair * 0.75) : 0;

  const floored = parsed.map((value) => Math.max(value ?? unsetShare, fair * 0.5));
  const total = floored.reduce((sum, value) => sum + value, 0);
  return floored.map((value) => `${Math.round((value / total) * 100000) / 1000}%`);
}
