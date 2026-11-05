/**
 * Table layout inside one component.
 *
 * A component's tables are "pieces" arranged in rows: a piece is either some
 * of the main table's columns, or one of the contact-resistance Value
 * Deviation tables. Pieces in the same row sit side by side (wrapping when
 * there isn't room); rows stack. This lets a component be rearranged, a table
 * split into two by columns, and pieces combined back, without touching how
 * answers are stored: every piece renders the same section, so values, row
 * counts and formulas stay keyed exactly as before.
 *
 * A section without `tableLayout` keeps the original fixed arrangement.
 */

import type { SectionConfig } from '@/lib/types/customForms';
import { removeColumn } from '@/lib/customForms/v2/authoring';

export type TablePieceKind =
  | 'columns'
  /** Separate Value Deviation tables in saved layouts; dropped when resolved. */
  | 'deviation-phase'
  | 'deviation-lines'
  | 'deviation-combined';

export interface TablePiece {
  id: string;
  kind: TablePieceKind;
  /** For 'columns': the main-table columns this piece shows, in table order. */
  columnIds?: string[];
  /** For 'columns': columns also shown here though they belong to another piece (e.g. a row label). */
  repeatColumnIds?: string[];
  /** Share of the row's width relative to its neighbours (default 1). */
  grow?: number;
}

export interface TableLayout {
  rows: TablePiece[][];
}

export const PIECE_LABELS: Record<TablePieceKind, string> = {
  columns: 'Table',
  'deviation-phase': 'Value Deviation (per row)',
  'deviation-lines': 'Value Deviation (lines)',
  'deviation-combined': 'Value Deviation',
};

/**
 * Flex sizing for a piece: widths in proportion to `grow` (2× is twice as wide
 * as 1× beside it), wrapping to its own row below ~12rem.
 */
export function pieceFlex(piece: TablePiece): { flex: string; minWidth: string } {
  return { flex: `${piece.grow ?? 1} 1 0%`, minWidth: '12rem' };
}

/** A columns piece's columns (own + repeated) in table order. */
export function pieceColumnIds(section: SectionConfig, piece: TablePiece): string[] {
  const keep = new Set([...(piece.columnIds ?? []), ...(piece.repeatColumnIds ?? [])]);
  return (section.columns ?? []).map((c) => c.id).filter((id) => keep.has(id));
}

export function newPieceId(): string {
  return `piece-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

/** The arrangement a component had before layouts existed. */
export function defaultTableLayout(section: SectionConfig): TableLayout {
  const rows: TablePiece[][] = [];
  if (section.columns?.length) {
    rows.push([{ id: 'main', kind: 'columns', columnIds: section.columns.map((c) => c.id) }]);
  }
  return { rows };
}

/**
 * A section's layout made consistent with its current columns: unknown
 * columns dropped, new columns added to the first table piece, empty rows
 * dropped. Works on any stored layout, however stale. Deviation pieces are
 * dropped too, unless an older report still shows them (`keepOldDeviation`).
 */
export function resolveTableLayout(section: SectionConfig, keepOldDeviation = false): TableLayout {
  const stored = section.tableLayout;
  if (!stored?.rows?.length) return defaultTableLayout(section);

  const columnIds = (section.columns ?? []).map((c) => c.id);
  const known = new Set(columnIds);
  const order = new Map(columnIds.map((id, i) => [id, i]));
  const byOrder = (a: string, b: string) => (order.get(a) ?? 0) - (order.get(b) ?? 0);

  const assigned = new Set<string>();
  let rows = stored.rows.map((row) =>
    row
      .filter((p) => p.kind === 'columns' || keepOldDeviation)
      .map((p) => {
        if (p.kind !== 'columns') return p;
        const own = (p.columnIds ?? []).filter((id) => known.has(id) && !assigned.has(id));
        own.forEach((id) => assigned.add(id));
        return {
          ...p,
          columnIds: own.sort(byOrder),
          repeatColumnIds: (p.repeatColumnIds ?? []).filter((id) => known.has(id) && !own.includes(id)),
        };
      })
      .filter((p) => p.kind !== 'columns' || (p.columnIds?.length ?? 0) > 0)
  );

  // Columns added since the layout was saved go to the first table piece.
  const unassigned = columnIds.filter((id) => !assigned.has(id));
  if (unassigned.length) {
    const first = rows.flat().find((p) => p.kind === 'columns');
    if (first) {
      first.columnIds = [...(first.columnIds ?? []), ...unassigned].sort(byOrder);
    } else {
      rows.unshift([{ id: newPieceId(), kind: 'columns', columnIds: unassigned }]);
    }
  }

  // Deviation turned on after the layout was saved.
  if (keepOldDeviation && !rows.flat().some((p) => p.kind !== 'columns')) {
    rows.push([
      { id: 'deviation-phase', kind: 'deviation-phase' },
      { id: 'deviation-lines', kind: 'deviation-lines' },
    ]);
  }

  rows = rows.filter((row) => row.length > 0);
  return { rows };
}

/** The section as one 'columns' piece shows it: only that piece's columns. */
export function pieceSection(section: SectionConfig, piece: TablePiece): SectionConfig {
  const keep = new Set([...(piece.columnIds ?? []), ...(piece.repeatColumnIds ?? [])]);
  let s = section;
  for (const column of section.columns ?? []) {
    // removeColumn also reflows merged headers and drops per-cell data keys
    // for this render only; the stored section is untouched.
    if (!keep.has(column.id)) s = { ...s, ...removeColumn(s, column.id) };
  }
  return s;
}

// ---------------------------------------------------------------------------
// Editing operations. Each takes a resolved layout and returns a new one.
// ---------------------------------------------------------------------------

function locate(layout: TableLayout, pieceId: string): [number, number] | null {
  for (let r = 0; r < layout.rows.length; r++) {
    const c = layout.rows[r].findIndex((p) => p.id === pieceId);
    if (c >= 0) return [r, c];
  }
  return null;
}

const clean = (rows: TablePiece[][]): TableLayout => ({ rows: rows.filter((r) => r.length) });

/**
 * Move a piece. `toRow` may equal rows.length (a new row at the bottom) or be
 * -1 (a new row at the top); `newRow` inserts a new row at `toRow` instead of
 * joining it.
 */
export function movePiece(
  layout: TableLayout,
  pieceId: string,
  toRow: number,
  toIndex: number,
  newRow = false
): TableLayout {
  const at = locate(layout, pieceId);
  if (!at) return layout;
  const rows = layout.rows.map((r) => [...r]);
  const [piece] = rows[at[0]].splice(at[1], 1);
  // Removing the piece may have emptied its row; keep indexes stable until the end.
  if (newRow || toRow < 0 || toRow >= rows.length) {
    const insertAt = Math.max(0, Math.min(rows.length, toRow < 0 ? 0 : toRow));
    rows.splice(insertAt, 0, [piece]);
  } else {
    const target = rows[toRow];
    // Moving right within its own row: the removal shifted everything after it.
    const index = toRow === at[0] && at[1] < toIndex ? toIndex - 1 : toIndex;
    target.splice(Math.max(0, Math.min(target.length, index)), 0, piece);
  }
  return clean(rows);
}

/** Split a table piece after the given column; the rest becomes a new piece in a row below. */
export function splitPiece(layout: TableLayout, pieceId: string, afterColumnId: string): TableLayout {
  const at = locate(layout, pieceId);
  if (!at) return layout;
  const piece = layout.rows[at[0]][at[1]];
  const ids = piece.columnIds ?? [];
  const cut = ids.indexOf(afterColumnId) + 1;
  if (cut <= 0 || cut >= ids.length) return layout;
  const rows = layout.rows.map((r) => [...r]);
  rows[at[0]][at[1]] = { ...piece, columnIds: ids.slice(0, cut) };
  rows.splice(at[0] + 1, 0, [
    {
      id: newPieceId(),
      kind: 'columns',
      columnIds: ids.slice(cut),
      // Carry the first column along (usually a row label) so the second half still reads.
      repeatColumnIds: ids[0] ? [ids[0]] : [],
    },
  ]);
  return clean(rows);
}

/** Can these two pieces be combined into one table? */
export function canCombine(a: TablePiece, b: TablePiece): boolean {
  return a.id !== b.id && a.kind === 'columns' && b.kind === 'columns';
}

/** Combine piece `b` into piece `a` (which keeps its place). */
export function combinePieces(
  layout: TableLayout,
  aId: string,
  bId: string,
  columnOrder: string[]
): TableLayout {
  const a = layout.rows.flat().find((p) => p.id === aId);
  const b = layout.rows.flat().find((p) => p.id === bId);
  if (!a || !b || !canCombine(a, b)) return layout;
  const order = new Map(columnOrder.map((id, i) => [id, i]));
  const merged: TablePiece = {
    ...a,
    columnIds: [...(a.columnIds ?? []), ...(b.columnIds ?? [])].sort(
      (x, y) => (order.get(x) ?? 0) - (order.get(y) ?? 0)
    ),
    repeatColumnIds: (a.repeatColumnIds ?? []).filter((id) => !(b.columnIds ?? []).includes(id)),
  };
  return clean(
    layout.rows.map((row) =>
      row.filter((p) => p.id !== bId).map((p) => (p.id === aId ? merged : p))
    )
  );
}

export function updatePiece(
  layout: TableLayout,
  pieceId: string,
  patch: Partial<TablePiece>
): TableLayout {
  return {
    rows: layout.rows.map((row) => row.map((p) => (p.id === pieceId ? { ...p, ...patch } : p))),
  };
}

/** True when the layout is just the default arrangement (nothing to store). */
export function isDefaultLayout(section: SectionConfig, layout: TableLayout): boolean {
  return JSON.stringify(layout) === JSON.stringify(defaultTableLayout(section));
}
