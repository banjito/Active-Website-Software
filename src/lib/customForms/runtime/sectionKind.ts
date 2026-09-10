/**
 * Section classification.
 *
 * The four renderers each carried their own if/else chain deciding whether a
 * section was a conditional table, a plain table, a grouped-field grid, and so
 * on. The chains had drifted: the builder canvas tested conditional tables
 * first, the filler tested contact resistance first, and the builder preview
 * left contact resistance out of the conditional check entirely. This module
 * is the one classifier; the runtime dispatches on its result.
 */

import type { SectionConfig } from "@/lib/types/customForms";

export type SectionKind =
  | "conditional-table"
  | "contact-resistance"
  | "table"
  | "grouped-fields"
  | "single-field"
  | "checklist"
  | "empty";

function hasColumns(section: SectionConfig): boolean {
  return !!section.columns && section.columns.length > 0;
}

/**
 * A conditional table needs all three parts: the dropdowns that drive
 * visibility, the row definitions they show and hide, and the columns.
 */
export function isConditionalTable(section: SectionConfig): boolean {
  return (
    !!section.settingFields &&
    section.settingFields.length > 0 &&
    !!section.conditionalRows &&
    section.conditionalRows.length > 0 &&
    hasColumns(section)
  );
}

export function isContactResistanceTable(section: SectionConfig): boolean {
  return section.componentType === "contact-resistance" && hasColumns(section);
}

export function classifySection(section: SectionConfig): SectionKind {
  if (isConditionalTable(section)) return "conditional-table";
  if (isContactResistanceTable(section)) return "contact-resistance";
  if (hasColumns(section)) return "table";
  if (section.fields && section.fields.length > 0) return "grouped-fields";
  if (section.field) return "single-field";
  if (section.checklistItems && section.checklistItems.length > 0)
    return "checklist";
  return "empty";
}

/** True for kinds whose body is a row-per-record table. */
export function isTableKind(kind: SectionKind): boolean {
  return (
    kind === "table" || kind === "contact-resistance" || kind === "conditional-table"
  );
}
