/**
 * Fill order: the form maker numbers every fillable field on the sheet, and
 * Enter (and, if chosen, the arrow keys) move through them in that order
 * (settings.keyboard.order, edited in FillOrderDialog).
 *
 * A field is named by a key: `section|f|fieldId` for a field, or
 * `section|c|columnId|row` for a table cell. The report marks the same places
 * with data-fref-* attributes, which is how the keys are read back off the page.
 */

import { ComponentType, FieldType } from '@/lib/types/customForms';
import type { FieldConfig, SectionConfig } from '@/lib/types/customForms';
import { contactResistanceRowLabels, resolveRowCount } from '@/lib/customForms/runtime/layout';
import { withInlineDeviation } from '@/lib/customForms/deviation';

export const fieldKey = (sectionId: string, fieldId: string) => `${sectionId}|f|${fieldId}`;
export const cellKey = (sectionId: string, columnId: string, row: number) => `${sectionId}|c|${columnId}|${row}`;

export function parseKey(key: string):
  | { kind: 'field'; sectionId: string; fieldId: string }
  | { kind: 'cell'; sectionId: string; columnId: string; row: number }
  | null {
  const parts = key.split('|');
  if (parts[1] === 'f' && parts.length === 3) return { kind: 'field', sectionId: parts[0], fieldId: parts[2] };
  if (parts[1] === 'c' && parts.length === 4) {
    const row = Number(parts[3]);
    return Number.isInteger(row) ? { kind: 'cell', sectionId: parts[0], columnId: parts[2], row } : null;
  }
  return null;
}

/** Types with no box to type in or pick from (ticks, radio buttons, signatures, photos). */
const NOT_TYPED = new Set<string>([
  FieldType.CHECKBOX,
  FieldType.RADIO,
  FieldType.CALCULATED,
  FieldType.SIGNATURE,
  FieldType.PHOTO,
]);

/** Something the technician types into or picks from. */
export function isFillable(field: FieldConfig | undefined): boolean {
  if (!field || NOT_TYPED.has(field.type)) return false;
  if (field.readOnly || field.resultRule) return false;
  return !field.cellBehavior || field.cellBehavior === 'user';
}

export interface FillOrderTable {
  columns: { id: string; label: string; fillable: boolean }[];
  rows: { index: number; label: string }[];
  /** False for a cell locked by a per-cell formula or fixed text. */
  cellFillable: (row: number, columnId: string) => boolean;
}

export interface FillOrderSection {
  section: SectionConfig;
  fields: { key: string; label: string }[];
  table: FillOrderTable | null;
}

/** What each section offers to number, as the dialog draws it. Sections with nothing are left out. */
export function fillOrderSections(sections: SectionConfig[]): FillOrderSection[] {
  const out: FillOrderSection[] = [];
  for (const authored of [...sections].sort((a, b) => a.order - b.order)) {
    if (authored.chart) continue;
    const section = withInlineDeviation(authored);
    const fields = (section.fields ?? [])
      .filter(isFillable)
      .map((f) => ({ key: fieldKey(section.id, f.id), label: f.label || f.id }));

    let table: FillOrderTable | null = null;
    const columns = section.columns ?? [];
    if (columns.length) {
      const conditional = section.conditionalRows ?? [];
      const crLabels =
        section.componentType === ComponentType.CONTACT_RESISTANCE && !conditional.length
          ? contactResistanceRowLabels(section)
          : [];
      const count = conditional.length || resolveRowCount(section);
      const rows = Array.from({ length: count }, (_, i) => ({
        index: i,
        label: conditional[i]?.label || crLabels[i] || `Row ${i + 1}`,
      }));
      const locked = (row: number, columnId: string) => {
        const k = `row${row}_${columnId}`;
        return !!section.cellFormulas?.[k]?.trim() || !!section.staticCells?.[k];
      };
      const tableColumns = columns.map((c) => ({ id: c.id, label: c.label || c.id, fillable: isFillable(c.field) }));
      if (tableColumns.some((c) => c.fillable)) {
        table = {
          columns: tableColumns,
          rows,
          cellFillable: (row, columnId) =>
            !!tableColumns.find((c) => c.id === columnId)?.fillable && !locked(row, columnId),
        };
      }
    }
    if (fields.length || table) out.push({ section: authored, fields, table });
  }
  return out;
}

/** Every key a section offers, across the rows (`across`) or down the columns. */
export function sectionKeys(item: FillOrderSection, pattern: 'across' | 'down'): string[] {
  const keys = item.fields.map((f) => f.key);
  const t = item.table;
  if (!t) return keys;
  const id = item.section.id;
  if (pattern === 'across') {
    for (const r of t.rows) for (const c of t.columns) if (t.cellFillable(r.index, c.id)) keys.push(cellKey(id, c.id, r.index));
  } else {
    for (const c of t.columns) for (const r of t.rows) if (t.cellFillable(r.index, c.id)) keys.push(cellKey(id, c.id, r.index));
  }
  return keys;
}

/** The whole sheet numbered one way. */
export function autoOrder(sections: SectionConfig[], pattern: 'across' | 'down'): string[] {
  return fillOrderSections(sections).flatMap((item) => sectionKeys(item, pattern));
}

/** A saved order with keys the form no longer has removed. */
export function cleanOrder(order: string[] | undefined, sections: SectionConfig[]): string[] {
  if (!order?.length) return [];
  const known = new Set(autoOrder(sections, 'across'));
  return [...new Set(order)].filter((k) => known.has(k));
}

// ---------------------------------------------------------------------------
// While filling in: where each field on the page sits in the order
// ---------------------------------------------------------------------------

/** Sort position, compared item by item. */
export type OrderRank = [number, number, number, number];

export function compareRank(a: OrderRank, b: OrderRank): number {
  for (let i = 0; i < 4; i++) if (a[i] !== b[i]) return a[i] - b[i];
  return 0;
}

/**
 * Ranks for the page's fields, in page order. `keys[i]` is the i-th control's
 * key, or null for a control the order can't name.
 *
 * - Numbered fields: their place in the order.
 * - Rows added while filling in (`addedRows`):
 *   'repeat' = right after the table's last numbered row, row by row, each
 *   in that row's order; 'end' = after everything, in page order.
 * - Anything else not numbered rides along right after the field before it
 *   on the page.
 */
export function rankControls(
  keys: (string | null)[],
  order: string[],
  addedRows: 'repeat' | 'end',
): OrderRank[] {
  const place = new Map(order.map((k, i) => [k, i]));

  // Per table: its last numbered row, that row's order by column, and its highest place.
  const lastRow = new Map<string, { row: number; byColumn: Map<string, number>; top: number }>();
  for (const [k, i] of place) {
    const p = parseKey(k);
    if (p?.kind !== 'cell') continue;
    const cur = lastRow.get(p.sectionId);
    if (!cur || p.row > cur.row) {
      lastRow.set(p.sectionId, { row: p.row, byColumn: new Map([[p.columnId, i]]), top: i });
    } else if (p.row === cur.row) {
      cur.byColumn.set(p.columnId, i);
      cur.top = Math.max(cur.top, i);
    }
  }

  let previous: OrderRank = [-1, 0, 0, 0];
  let follow = 0;
  return keys.map((key, pageIndex) => {
    let rank: OrderRank | null = null;
    if (key != null && place.has(key)) {
      rank = [place.get(key)!, 0, 0, 0];
    } else if (key != null) {
      const p = parseKey(key);
      const last = p?.kind === 'cell' ? lastRow.get(p.sectionId) : undefined;
      if (p?.kind === 'cell' && last && p.row > last.row) {
        rank =
          addedRows === 'end'
            ? [Number.MAX_SAFE_INTEGER, pageIndex, 0, 0]
            : [last.top, p.row - last.row, last.byColumn.get(p.columnId) ?? Number.MAX_SAFE_INTEGER, pageIndex];
      }
    }
    if (rank) {
      previous = rank;
      follow = 0;
      return rank;
    }
    follow += 1;
    return [previous[0], previous[1], previous[2], previous[3] + follow / 1000];
  });
}
