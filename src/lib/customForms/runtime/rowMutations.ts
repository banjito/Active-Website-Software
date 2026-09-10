/**
 * Runtime row mutations.
 *
 * Adding and removing rows while a form is open changed the template in state
 * and, separately, the instance data. Both the filler and the template preview
 * page carried their own copy of that logic and they had already diverged: the
 * preview page moved rows without moving the values in them. These are the one
 * implementation, written as pure functions so either shell can apply them.
 */

import type {
  ConditionalRowConfig,
  CustomFormTemplate,
  SectionConfig,
} from "@/lib/types/customForms";
import {
  contactResistanceRowLabels,
  cellKey,
  maxRows,
  minRows,
  resolveRowCount,
  rowStateKey,
} from "./layout";
import { defaultSettingValue } from "./visibility";

export type FormData = Record<string, any>;

export interface MutationResult {
  template: CustomFormTemplate;
  formData: FormData;
}

function mapSections(
  template: CustomFormTemplate,
  map: (section: SectionConfig) => SectionConfig,
): CustomFormTemplate {
  return {
    ...template,
    structure: {
      ...template.structure,
      sections: template.structure.sections.map(map),
    },
  };
}

/** Sections whose row count moves together with `sectionId`. */
function linkedSections(
  template: CustomFormTemplate,
  sectionId: string,
): SectionConfig[] {
  const section = template.structure.sections.find((s) => s.id === sectionId);
  if (!section) return [];
  const groupId = section.rowCountLinkGroupId;
  return template.structure.sections.filter(
    (s) =>
      s.id === sectionId ||
      (groupId != null && s.rowCountLinkGroupId === groupId),
  );
}

/**
 * Add or remove one row on a section and everything linked to it. Per-cell
 * formulas follow: a new row inherits the row above, a removed row drops its
 * own. Values on linked sections follow too, so a paired table does not end up
 * one row short.
 */
export function withRowCountDelta(
  template: CustomFormTemplate,
  formData: FormData,
  sectionId: string,
  delta: 1 | -1,
): MutationResult {
  const linked = linkedSections(template, sectionId);
  if (linked.length === 0) return { template, formData };
  const linkedIds = new Set(linked.map((s) => s.id));

  const nextTemplate = mapSections(template, (s) => {
    if (!linkedIds.has(s.id)) return s;
    const current = resolveRowCount(s);
    const next =
      delta > 0
        ? Math.min(maxRows(s), current + 1)
        : Math.max(minRows(s), current - 1);
    if (next === current) return s;
    if (!s.cellFormulas || !s.columns?.length) return { ...s, rows: next };

    const cellFormulas = { ...s.cellFormulas };
    if (delta > 0) {
      const newRowIndex = next - 1;
      s.columns.forEach((col) => {
        const inherited = cellFormulas[cellKey(newRowIndex - 1, col.id)];
        if (inherited !== undefined)
          cellFormulas[cellKey(newRowIndex, col.id)] = inherited;
      });
    } else {
      s.columns.forEach((col) => {
        delete cellFormulas[cellKey(current - 1, col.id)];
      });
    }
    return { ...s, rows: next, cellFormulas };
  });

  const nextData = { ...formData };
  for (const s of linked) {
    const current = resolveRowCount(s);
    if (delta > 0) {
      // The section the user clicked seeds its own new row; a linked section
      // copies the row above so the two tables stay in step.
      if (s.id === sectionId) continue;
      if (current >= maxRows(s)) continue;
      const previous = formData[rowStateKey(s.id, current - 1)];
      nextData[rowStateKey(s.id, current)] =
        previous && typeof previous === "object" ? { ...previous } : {};
    } else if (current > minRows(s)) {
      delete nextData[rowStateKey(s.id, current - 1)];
    }
  }

  return { template: nextTemplate, formData: nextData };
}

/** A new conditional row, visible under the setting value currently selected. */
export function withConditionalRowAdded(
  template: CustomFormTemplate,
  formData: FormData,
  sectionId: string,
): MutationResult {
  const nextTemplate = mapSections(template, (s) => {
    if (s.id !== sectionId || !s.conditionalRows) return s;
    const row: ConditionalRowConfig = {
      id: `row${s.conditionalRows.length}`,
      label: `Row ${s.conditionalRows.length + 1}`,
      visibleWhen: {},
    };
    const setting = s.settingFields?.[0];
    if (setting) {
      const current =
        formData[sectionId]?.[setting.id] ?? defaultSettingValue(setting);
      row.visibleWhen = { [setting.id]: current };
    }
    return { ...s, conditionalRows: [...s.conditionalRows, row] };
  });
  return { template: nextTemplate, formData };
}

export function withConditionalRowRemoved(
  template: CustomFormTemplate,
  formData: FormData,
  sectionId: string,
  rowId: string,
): MutationResult {
  const nextTemplate = mapSections(template, (s) =>
    s.id === sectionId && s.conditionalRows
      ? {
          ...s,
          conditionalRows: s.conditionalRows.filter((r) => r.id !== rowId),
        }
      : s,
  );
  return { template: nextTemplate, formData };
}

/** Starting values for one contact-resistance row. */
export function contactResistanceRowData(
  section: SectionConfig,
  rowIndex: number,
): Record<string, any> {
  const labels = contactResistanceRowLabels(section);
  const row: Record<string, any> = {};
  (section.columns ?? []).forEach((col) => {
    const fieldId = col.field?.id ?? col.id;
    if (fieldId === "busSection") {
      row[fieldId] = labels[rowIndex] ?? `Section ${rowIndex + 1}`;
    } else if (fieldId === "unit") {
      row[fieldId] = col.field?.defaultValue ?? "μΩ";
    } else {
      row[fieldId] = "";
    }
  });
  row.phaseCriteria = "<50%";
  row.phaseResult = "N/A";
  return row;
}

/** Seed a new instance's contact-resistance sections with their default rows. */
export function seedContactResistanceRows(
  template: CustomFormTemplate,
  formData: FormData,
): FormData {
  const sections = template.structure.sections.filter(
    (s) => s.componentType === "contact-resistance" && s.columns?.length,
  );
  if (sections.length === 0) return formData;

  const next = { ...formData };
  for (const section of sections) {
    if (next[rowStateKey(section.id, 0)] != null) continue;
    const rowCount = resolveRowCount(section);
    for (let i = 0; i < rowCount; i++) {
      next[rowStateKey(section.id, i)] = contactResistanceRowData(section, i);
    }
    next[section.id] = {
      ...(next[section.id] || {}),
      neutralCriteria: "N/A",
      neutralResult: "N/A",
      groundCriteria: "N/A",
      groundResult: "N/A",
    };
  }
  return next;
}

export function withContactResistanceRowAdded(
  template: CustomFormTemplate,
  formData: FormData,
  sectionId: string,
): MutationResult {
  const section = template.structure.sections.find((s) => s.id === sectionId);
  if (!section?.columns?.length) return { template, formData };
  const newIndex = resolveRowCount(section);
  const grown = withRowCountDelta(template, formData, sectionId, 1);
  return {
    template: grown.template,
    formData: {
      ...grown.formData,
      [rowStateKey(sectionId, newIndex)]: contactResistanceRowData(
        section,
        newIndex,
      ),
    },
  };
}

export function withContactResistanceRowRemoved(
  template: CustomFormTemplate,
  formData: FormData,
  sectionId: string,
  rowIndex: number,
): MutationResult {
  const section = template.structure.sections.find((s) => s.id === sectionId);
  if (!section) return { template, formData };
  const rowCount = resolveRowCount(section);
  if (rowCount <= minRows(section)) return { template, formData };

  const shrunk = withRowCountDelta(template, formData, sectionId, -1);
  const nextData = { ...shrunk.formData };
  // Pull every row below the removed one up so values stay with their label.
  for (let i = rowIndex; i < rowCount - 1; i++) {
    nextData[rowStateKey(sectionId, i)] =
      formData[rowStateKey(sectionId, i + 1)] ?? {};
  }
  delete nextData[rowStateKey(sectionId, rowCount - 1)];
  return { template: shrunk.template, formData: nextData };
}
