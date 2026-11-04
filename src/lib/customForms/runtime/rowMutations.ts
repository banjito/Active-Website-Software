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
import {
  INLINE_DEVIATION_KEY,
  resolveDeviation,
  usesLegacyDeviation,
} from "@/lib/customForms/deviation";

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
    // Rows can be removed from anywhere, so the count alone may be taken.
    const taken = new Set(s.conditionalRows.map((r) => r.id));
    let number = s.conditionalRows.length;
    while (taken.has(`row${number}`)) number += 1;
    const row: ConditionalRowConfig = {
      id: `row${number}`,
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

/** A per-cell map with one row taken out and the rows below moved up. */
function withoutRowKey(
  map: Record<string, string> | undefined,
  rowIndex: number,
): Record<string, string> | undefined {
  if (!map) return map;
  const next: Record<string, string> = {};
  for (const [key, value] of Object.entries(map)) {
    const match = key.match(/^row(\d+)_(.*)$/);
    const row = match ? Number(match[1]) : -1;
    if (row === rowIndex) continue;
    next[row > rowIndex ? cellKey(row - 1, match![2]) : key] = value;
  }
  return next;
}

/**
 * Remove one chosen row from a section and everything linked to it. The rows
 * below move up with all that belongs to them: their values, and their per-cell
 * text, formulas and defaults, so nothing ends up on the wrong row.
 */
export function withRowRemoved(
  template: CustomFormTemplate,
  formData: FormData,
  sectionId: string,
  rowIndex: number,
): MutationResult {
  const linked = linkedSections(template, sectionId);
  if (linked.length === 0) return { template, formData };
  const rowCountOf = (s: SectionConfig) =>
    s.conditionalRows?.length || resolveRowCount(s);
  const canShrink = (s: SectionConfig) =>
    !!s.conditionalRows?.length || rowCountOf(s) > minRows(s);
  const shrinking = new Set(linked.filter(canShrink).map((s) => s.id));
  if (!shrinking.has(sectionId)) return { template, formData };

  const nextTemplate = mapSections(template, (s) => {
    if (!shrinking.has(s.id)) return s;
    return {
      ...s,
      ...(s.conditionalRows?.length
        ? { conditionalRows: s.conditionalRows.filter((_, i) => i !== rowIndex) }
        : { rows: rowCountOf(s) - 1 }),
      ...(s.calculationRowIds && {
        calculationRowIds: s.calculationRowIds.filter((_, i) => i !== rowIndex),
      }),
      cellFormulas: withoutRowKey(s.cellFormulas, rowIndex),
      staticCells: withoutRowKey(s.staticCells, rowIndex),
      cellDefaults: withoutRowKey(s.cellDefaults, rowIndex),
    };
  });

  const nextData = { ...formData };
  for (const s of linked) {
    if (!shrinking.has(s.id)) continue;
    const rowCount = rowCountOf(s);
    for (let i = rowIndex; i < rowCount - 1; i++) {
      const below = formData[rowStateKey(s.id, i + 1)];
      if (below === undefined) delete nextData[rowStateKey(s.id, i)];
      else nextData[rowStateKey(s.id, i)] = below;
    }
    delete nextData[rowStateKey(s.id, rowCount - 1)];
  }
  return { template: nextTemplate, formData: nextData };
}

/**
 * Starting values for one contact-resistance row. Only a new report's rows get
 * the in-line deviation mark; `legacy` is a row added to an older report.
 */
export function contactResistanceRowData(
  section: SectionConfig,
  rowIndex: number,
  legacy = false,
): Record<string, any> {
  const labels = contactResistanceRowLabels(section);
  const row: Record<string, any> = {};
  (section.columns ?? []).forEach((col) => {
    const fieldId = col.field?.id ?? col.id;
    const preset = section.cellDefaults?.[cellKey(rowIndex, col.id)];
    if (fieldId === "busSection") {
      row[fieldId] = labels[rowIndex] ?? `Section ${rowIndex + 1}`;
    } else if (fieldId === "unit") {
      row[fieldId] = preset ?? col.field?.defaultValue ?? "μΩ";
    } else {
      row[fieldId] = preset ?? "";
    }
  });
  if (legacy) {
    row.phaseCriteria = "<50%";
    row.phaseResult = "N/A";
    return row;
  }
  const deviation = resolveDeviation(section);
  row.phaseCriteria = deviation.phaseCriteriaDefault;
  row.phaseResult = deviation.phaseResultDefault;
  row[INLINE_DEVIATION_KEY] = true;
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
  }
  return next;
}

/**
 * Fill a new instance's table cells with their per-row defaults. Stored as real
 * values so formulas, pass/fail and print all see them. Anything already in
 * formData is kept, including a cell the technician cleared.
 */
export function seedCellDefaults(
  template: CustomFormTemplate,
  formData: FormData,
): FormData {
  let next = formData;
  for (const section of template.structure.sections) {
    if (!section.cellDefaults) continue;
    const rowCount = section.conditionalRows?.length || resolveRowCount(section);
    for (let i = 0; i < rowCount; i++) {
      for (const col of section.columns ?? []) {
        if ((col.field?.cellBehavior ?? "user") !== "user") continue;
        const value = section.cellDefaults[cellKey(i, col.id)];
        const fieldId = col.field?.id ?? col.id;
        const stateKey = rowStateKey(section.id, i);
        if (!value || next[stateKey]?.[fieldId] !== undefined) continue;
        if (next === formData) next = { ...formData };
        next[stateKey] = { ...next[stateKey], [fieldId]: value };
      }
    }
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
        usesLegacyDeviation(section, formData),
      ),
    },
  };
}
