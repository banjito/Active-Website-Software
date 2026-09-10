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
