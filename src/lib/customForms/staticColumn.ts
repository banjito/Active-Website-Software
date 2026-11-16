/**
 * Leaving "Static text" behind.
 *
 * A static column's per-row text lives in section.staticCells, and any entry
 * there locks its cell whatever the column later becomes (see overriddenCells
 * in v2/fromV1.ts). So when a column stops being static its text is either
 * turned into per-row default values (cellDefaults) or removed, never left
 * behind to lock cells nobody can see.
 */

import type { FieldConfig, SectionConfig } from '@/lib/types/customForms';
import { cellKey, resolveRowCount } from '@/lib/customForms/runtime/layout';

const CELL_KEY = /^row(\d+)_(.+)$/;

/** The row a staticCells key belongs to, when it is for `columnId`. */
function rowOf(key: string, columnId: string): number | null {
  const m = key.match(CELL_KEY);
  return m && m[2] === columnId ? Number(m[1]) : null;
}

function rowCountOf(section: SectionConfig): number {
  return section.conditionalRows?.length ? section.conditionalRows.length : resolveRowCount(section);
}

/**
 * The text each row of a column shows: its own per-row text, else the
 * column's text. Rows with neither are left out. Keyed by row index.
 */
export function columnStaticText(
  section: SectionConfig,
  columnId: string,
  field: Pick<FieldConfig, 'staticValue'>,
): Record<number, string> {
  const out: Record<number, string> = {};
  for (const [key, text] of Object.entries(section.staticCells ?? {})) {
    const row = rowOf(key, columnId);
    if (row != null && text != null && text !== '') out[row] = text;
  }
  const fallback = field.staticValue ?? '';
  if (fallback !== '') {
    for (let r = 0; r < rowCountOf(section); r++) if (!(r in out)) out[r] = fallback;
  }
  return out;
}

/** True when a column still has per-row static text saved. */
export function hasLeftoverStaticCells(section: SectionConfig, columnId: string): boolean {
  return Object.keys(section.staticCells ?? {}).some((key) => rowOf(key, columnId) != null);
}

/**
 * The section changes for a column that stops being static: its per-row text
 * removed and, when `keepAsDefaults`, copied into each cell's default value.
 * A default already set is not overwritten.
 */
export function leaveStaticColumn(
  section: SectionConfig,
  columnId: string,
  field: Pick<FieldConfig, 'staticValue'>,
  keepAsDefaults: boolean,
): Pick<SectionConfig, 'staticCells' | 'cellDefaults'> {
  const text = columnStaticText(section, columnId, field);
  const staticCells = Object.fromEntries(
    Object.entries(section.staticCells ?? {}).filter(([key]) => rowOf(key, columnId) == null),
  );
  const cellDefaults = { ...(section.cellDefaults ?? {}) };
  if (keepAsDefaults) {
    for (const [row, value] of Object.entries(text)) {
      const key = cellKey(Number(row), columnId);
      if (cellDefaults[key] == null || cellDefaults[key] === '') cellDefaults[key] = value;
    }
  }
  return {
    staticCells: Object.keys(staticCells).length ? staticCells : undefined,
    cellDefaults: Object.keys(cellDefaults).length ? cellDefaults : undefined,
  };
}

/**
 * Ask what to do with a static column's text when it becomes `next`.
 * Returns the section changes, or null when there is no text to deal with.
 * Only a User entry column can take default values; other kinds just clear.
 */
export async function resolveLeavingStatic(
  section: SectionConfig,
  columnId: string,
  field: Pick<FieldConfig, 'staticValue' | 'cellBehavior'> & { label?: string },
  next: string,
  ask: (rows: number) => Promise<boolean>,
): Promise<Pick<SectionConfig, 'staticCells' | 'cellDefaults'> | null> {
  if (next === 'static') return null;
  const text = columnStaticText(section, columnId, field);
  const count = Object.keys(text).length;
  if (!count && !hasLeftoverStaticCells(section, columnId)) return null;
  const keep = next === 'user' && count > 0 ? await ask(count) : false;
  return leaveStaticColumn(section, columnId, field, keep);
}
