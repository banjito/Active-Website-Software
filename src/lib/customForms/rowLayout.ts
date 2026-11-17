/**
 * Rows added or removed on a report.
 *
 * Adding or removing a row while filling in changes the form's table in
 * memory (its row count, conditional rows, and the per-row formulas, fixed
 * text and defaults that move with the rows: see runtime/rowMutations.ts).
 * Only the values used to be saved, so a reopened report drew the form's
 * default rows again: added rows were hidden and removed rows came back empty.
 *
 * Now each table whose rows differ from the form version is saved with the
 * report (state.rowLayouts) and put back when it opens. Reports saved before
 * that get their row count back from the rows they saved (inferRowLayouts).
 */

import type { CustomFormStructure, SectionConfig } from '@/lib/types/customForms';
import type { StoredInstanceData } from '@/lib/customForms/instanceState';
import { classifySection } from '@/lib/customForms/runtime/sectionKind';
import { cellKey, resolveRowCount, rowStateKey } from '@/lib/customForms/runtime/layout';

/** The parts of a table that adding or removing rows changes. */
export const ROW_LAYOUT_KEYS = [
  'rows',
  'conditionalRows',
  'calculationRowIds',
  'cellFormulas',
  'staticCells',
  'cellDefaults',
] as const;

export type RowLayout = Partial<Pick<SectionConfig, (typeof ROW_LAYOUT_KEYS)[number]>>;

const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/** Tables whose rows differ from `base` (the form version), keyed by section id. */
export function captureRowLayouts(
  base: CustomFormStructure | null | undefined,
  current: CustomFormStructure,
): Record<string, RowLayout> | undefined {
  if (!base) return undefined;
  const baseById = new Map(base.sections.map((s) => [s.id, s]));
  const out: Record<string, RowLayout> = {};
  for (const section of current.sections) {
    const original = baseById.get(section.id);
    if (!original || !section.columns?.length) continue;
    if (ROW_LAYOUT_KEYS.every((k) => same(section[k], original[k]))) continue;
    const layout: RowLayout = {};
    for (const k of ROW_LAYOUT_KEYS) (layout as Record<string, unknown>)[k] = section[k];
    out[section.id] = layout;
  }
  return Object.keys(out).length ? out : undefined;
}

/** The structure with each saved table's rows put back. */
export function applyRowLayouts(
  structure: CustomFormStructure,
  layouts: Record<string, RowLayout> | undefined,
): CustomFormStructure {
  if (!layouts || !Object.keys(layouts).length) return structure;
  return {
    ...structure,
    sections: structure.sections.map((section) => {
      const layout = layouts[section.id];
      if (!layout || !section.columns?.length) return section;
      const next: SectionConfig = { ...section };
      for (const k of ROW_LAYOUT_KEYS) {
        if (k in layout) (next as unknown as Record<string, unknown>)[k] = layout[k];
      }
      return next;
    }),
  };
}

/**
 * For a report saved before row layouts were kept: its row count, read from
 * the rows it saved. Added rows copy the per-row formulas of the row above (as
 * adding a row does); a removed row's values were already moved up when it was
 * saved, so the table just ends sooner. Conditional tables keep the rows whose
 * ids were saved, in saved order.
 */
export function inferRowLayouts(
  structure: CustomFormStructure,
  stored: StoredInstanceData | null | undefined,
): Record<string, RowLayout> | undefined {
  if (!stored) return undefined;
  const out: Record<string, RowLayout> = {};
  for (const section of structure.sections) {
    if (!section.columns?.length) continue;
    const kind = classifySection(section);
    if (kind !== 'table' && kind !== 'contact-resistance' && kind !== 'conditional-table') continue;

    const savedRows = stored.state?.tableRows?.[section.id];
    if (kind === 'conditional-table') {
      const ids = savedRows?.map((r) => r.rowDefinitionId);
      if (!ids?.length || ids.some((id) => !id)) continue;
      const byId = new Map((section.conditionalRows ?? []).map((r) => [r.id, r]));
      const rows = ids.map(
        (id, i) => byId.get(id!) ?? { id: id!, label: `Row ${i + 1}`, visibleWhen: {} },
      );
      if (!same(rows, section.conditionalRows)) out[section.id] = { conditionalRows: rows };
      continue;
    }

    let count: number | undefined = savedRows?.length;
    if (count == null && stored.sections) {
      // Older flat saves: one key per row, so only a grown table shows here.
      let n = 0;
      while (Object.prototype.hasOwnProperty.call(stored.sections, rowStateKey(section.id, n))) n += 1;
      count = n || undefined;
    }
    const declared = resolveRowCount(section);
    if (!count || count === declared) continue;
    count = Math.max(section.minRows ?? 1, Math.min(section.maxRows ?? 100, count));
    if (count === declared) continue;

    let cellFormulas = section.cellFormulas;
    if (cellFormulas && section.columns.length) {
      const next = { ...cellFormulas };
      if (count > declared) {
        for (let row = declared; row < count; row++) {
          for (const col of section.columns) {
            const above = next[cellKey(row - 1, col.id)];
            if (above !== undefined) next[cellKey(row, col.id)] = above;
          }
        }
      } else {
        for (let row = count; row < declared; row++) {
          for (const col of section.columns) delete next[cellKey(row, col.id)];
        }
      }
      cellFormulas = next;
    }
    out[section.id] = { rows: count, ...(cellFormulas ? { cellFormulas } : {}) };
  }
  return Object.keys(out).length ? out : undefined;
}
