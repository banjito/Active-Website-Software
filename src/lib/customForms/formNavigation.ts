/**
 * Arrow-key and Enter navigation on a custom form, set per form
 * (settings.keyboard, edited in the builder's "Keyboard…" dialog).
 *
 * The app-wide handler (lib/keyboardNavigation.ts) guesses rows and columns
 * from screen position in 50px x 100px blocks, so two narrow columns in one
 * block count as one and an arrow skips a cell. Here a table is walked by its
 * real rows and columns (spans included); outside tables, Up/Down pick the
 * nearest field on the next line and Left/Right follow the page order.
 *
 * The form's handler runs first and stops the app-wide one.
 */

import type { KeyboardNavSettings } from '@/lib/types/customForms';
import { cellKey, compareRank, fieldKey, rankControls } from '@/lib/customForms/fillOrder';

export const DEFAULT_KEYBOARD_NAV: Required<KeyboardNavSettings> = {
  arrows: 'cells',
  leftRight: 'edge',
  enter: 'across',
  order: [],
  addedRows: 'repeat',
};

export function resolveKeyboardNav(settings: KeyboardNavSettings | undefined): Required<KeyboardNavSettings> {
  const nav = {
    ...DEFAULT_KEYBOARD_NAV,
    ...Object.fromEntries(Object.entries(settings ?? {}).filter(([, v]) => v)),
  } as Required<KeyboardNavSettings>;
  // "Follow the fill order" with no order set moves by the layout instead.
  if (!nav.order.length) {
    if (nav.enter === 'order') nav.enter = 'across';
    if (nav.arrows === 'order') nav.arrows = 'cells';
  }
  return nav;
}

type Control = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;
type Direction = 'left' | 'right' | 'up' | 'down';

const TEXT_TYPES = ['text', 'number', 'email', 'password', 'tel', 'url', 'search', 'date', 'time', 'datetime-local'];
const DATE_TYPES = ['date', 'time', 'datetime-local'];
/** Controls never stopped on: the paper-view toolbar. */
const EXCLUDE = '.cf-toolbar';

export function isNavControl(el: Element | null): el is Control {
  if (!el) return false;
  if (el instanceof HTMLSelectElement || el instanceof HTMLTextAreaElement) return true;
  return el instanceof HTMLInputElement && TEXT_TYPES.includes((el.type || 'text').toLowerCase());
}

/** A control the technician can type in or pick from, and can see. */
function usable(el: Element): el is Control {
  if (!isNavControl(el)) return false;
  if (el.disabled) return false;
  if (!(el instanceof HTMLSelectElement) && el.readOnly) return false;
  if (el.closest(EXCLUDE)) return false;
  return el.getClientRects().length > 0;
}

function controlsIn(scope: ParentNode): Control[] {
  return Array.from(scope.querySelectorAll('input, select, textarea')).filter(usable);
}

// ---------------------------------------------------------------------------
// Tables: a grid of cells, with row and column spans laid out
// ---------------------------------------------------------------------------

interface TableGrid {
  cells: (HTMLTableCellElement | undefined)[][];
  find(cell: HTMLTableCellElement): { row: number; col: number } | null;
  width: number;
}

function tableGrid(table: HTMLTableElement): TableGrid {
  // Body and footer rows only: the heading's unit pickers are not data cells.
  const rows: HTMLTableRowElement[] = [];
  for (const body of Array.from(table.tBodies)) rows.push(...Array.from(body.rows));
  if (table.tFoot) rows.push(...Array.from(table.tFoot.rows));

  const cells: (HTMLTableCellElement | undefined)[][] = rows.map(() => []);
  rows.forEach((tr, r) => {
    let c = 0;
    for (const cell of Array.from(tr.cells)) {
      while (cells[r][c]) c++;
      const rowSpan = Math.max(1, cell.rowSpan || 1);
      const colSpan = Math.max(1, cell.colSpan || 1);
      for (let dr = 0; dr < rowSpan && r + dr < rows.length; dr++) {
        for (let dc = 0; dc < colSpan; dc++) cells[r + dr][c + dc] = cell;
      }
      c += colSpan;
    }
  });
  const width = Math.max(0, ...cells.map((row) => row.length));
  return {
    cells,
    width,
    find(cell) {
      for (let r = 0; r < cells.length; r++) {
        const c = cells[r].indexOf(cell);
        if (c >= 0) return { row: r, col: c };
      }
      return null;
    },
  };
}

/** The table cell a control sits in, when that table is inside the form. */
function cellOf(el: Element, root: HTMLElement): { cell: HTMLTableCellElement; table: HTMLTableElement } | null {
  const cell = el.closest('td, th') as HTMLTableCellElement | null;
  const table = cell?.closest('table') as HTMLTableElement | null;
  if (!cell || !table || !root.contains(table)) return null;
  if (cell.closest('thead')) return null;
  return { cell, table };
}

/** The first (or last) usable control in a cell. */
function inCell(cell: HTMLTableCellElement | undefined, last = false): Control | null {
  if (!cell) return null;
  const list = controlsIn(cell);
  return (last ? list[list.length - 1] : list[0]) ?? null;
}

/**
 * The next control inside the table, or null at its edge.
 * `wrap`: Left/Right continue onto the next/previous row; Down/Up continue
 * onto the next/previous column (used by Enter = down).
 */
function moveInTable(
  current: Control,
  cell: HTMLTableCellElement,
  table: HTMLTableElement,
  dir: Direction,
  wrapColumns: boolean,
): Control | null {
  // Several controls in one cell: step through them first.
  const own = controlsIn(cell);
  const i = own.indexOf(current);
  if (dir === 'right' && i >= 0 && i < own.length - 1) return own[i + 1];
  if (dir === 'left' && i > 0) return own[i - 1];

  const grid = tableGrid(table);
  const at = grid.find(cell);
  if (!at) return null;
  const { cells } = grid;

  if (dir === 'right' || dir === 'left') {
    const step = dir === 'right' ? 1 : -1;
    let r = at.row;
    let c = at.col + step;
    let wrapped = false;
    while (r >= 0 && r < cells.length) {
      for (; c >= 0 && c < grid.width; c += step) {
        const next = cells[r][c];
        // On a new row, a cell reaching down from the row above was already passed.
        const fromAbove = wrapped && r > 0 && cells[r - 1][c] === next;
        if (next && next !== cell && !fromAbove) {
          const found = inCell(next, dir === 'left');
          if (found) return found;
        }
      }
      // Off the end of the row: on to the next (or previous) row.
      r += step;
      c = step === 1 ? 0 : grid.width - 1;
      wrapped = true;
    }
    return null;
  }

  const step = dir === 'down' ? 1 : -1;
  let c = at.col;
  let r = at.row + step;
  while (c >= 0 && c < grid.width) {
    for (; r >= 0 && r < cells.length; r += step) {
      const next = cells[r]?.[c];
      if (next && next !== cell) {
        const found = inCell(next);
        if (found) return found;
      }
    }
    if (!wrapColumns) return null;
    // Bottom of the column: top of the next one (Enter = down).
    c += step;
    r = step === 1 ? 0 : cells.length - 1;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Outside tables, and leaving a table
// ---------------------------------------------------------------------------

/** Page order: the control after (or before) `from`, skipping `skip`. */
function inPageOrder(all: Control[], from: Element, forward: boolean, skip?: Element): Control | null {
  const position = (el: Element) => from.compareDocumentPosition(el);
  const list = forward ? all : [...all].reverse();
  for (const el of list) {
    if (el === from || (skip && skip.contains(el))) continue;
    const pos = position(el);
    const after = !!(pos & Node.DOCUMENT_POSITION_FOLLOWING);
    if (after === forward) return el;
  }
  return null;
}

/** The nearest control on the next line up or down, closest across. */
function onNextLine(all: Control[], from: Element, down: boolean, skip?: Element): Control | null {
  const box = from.getBoundingClientRect();
  const centre = box.left + box.width / 2;
  const candidates = all
    .filter((el) => el !== from && !(skip && skip.contains(el)))
    .map((el) => ({ el, box: el.getBoundingClientRect() }))
    .filter(({ box: b }) => (down ? b.top >= box.bottom - 2 : b.bottom <= box.top + 2));
  if (!candidates.length) return null;
  // The nearest line: everything within a few pixels of the closest edge.
  const edge = down
    ? Math.min(...candidates.map((c) => c.box.top))
    : Math.max(...candidates.map((c) => c.box.bottom));
  const line = candidates.filter(({ box: b }) => (down ? b.top - edge < 8 : edge - b.bottom < 8));
  line.sort(
    (a, b) =>
      Math.abs(a.box.left + a.box.width / 2 - centre) - Math.abs(b.box.left + b.box.width / 2 - centre),
  );
  return line[0].el;
}

/** Where a key takes the focus, or null to stay put. */
export function nextControl(
  root: HTMLElement,
  current: Control,
  dir: Direction,
  opts: { wrapColumns?: boolean } = {},
): Control | null {
  const all = controlsIn(root);
  const place = cellOf(current, root);
  if (place) {
    const inside = moveInTable(current, place.cell, place.table, dir, !!opts.wrapColumns);
    if (inside) return inside;
    // Past the table's edge: carry on outside it.
    if (dir === 'right') return inPageOrder(all, current, true, place.table);
    if (dir === 'left') return inPageOrder(all, current, false, place.table);
    return onNextLine(all, current, dir === 'down', place.table) ??
      inPageOrder(all, current, dir === 'down', place.table);
  }
  if (dir === 'right' || dir === 'left') return inPageOrder(all, current, dir === 'right');
  return onNextLine(all, current, dir === 'down') ?? inPageOrder(all, current, dir === 'down');
}

// ---------------------------------------------------------------------------
// Fill order
// ---------------------------------------------------------------------------

/** The fill-order key of a control, read off the report's data-fref-* marks. */
function controlKey(el: Element): string | null {
  const mark = el.closest('[data-fref-section]');
  if (!mark) return null;
  const section = mark.getAttribute('data-fref-section')!;
  const field = mark.getAttribute('data-fref-field');
  if (field) return fieldKey(section, field);
  const col = mark.getAttribute('data-fref-col');
  const row = mark.getAttribute('data-fref-row');
  return col && row != null ? cellKey(section, col, Number(row)) : null;
}

/** The control before or after `current` in the form's fill order. */
export function nextInOrder(
  root: HTMLElement,
  current: Control,
  forward: boolean,
  order: string[],
  addedRows: 'repeat' | 'end',
): Control | null {
  const all = controlsIn(root);
  const ranks = rankControls(all.map(controlKey), order, addedRows);
  const sorted = all
    .map((el, i) => ({ el, rank: ranks[i], i }))
    .sort((a, b) => compareRank(a.rank, b.rank) || a.i - b.i);
  const at = sorted.findIndex((item) => item.el === current);
  if (at < 0) return null;
  return sorted[at + (forward ? 1 : -1)]?.el ?? null;
}

// ---------------------------------------------------------------------------
// Keys
// ---------------------------------------------------------------------------

/** Left/Right with the cursor inside the text move the cursor, not the focus. */
function cursorMoves(el: Control, key: string, leftRight: 'edge' | 'always'): boolean {
  if (el instanceof HTMLSelectElement) return false;
  const type = el instanceof HTMLInputElement ? el.type.toLowerCase() : 'textarea';
  if (DATE_TYPES.includes(type)) {
    // Left/Right step through the date's day / month / year.
    return (key === 'ArrowLeft' || key === 'ArrowRight') && leftRight === 'edge';
  }
  const value = el.value ?? '';
  let start = 0;
  let end = 0;
  try {
    start = el.selectionStart ?? 0;
    end = el.selectionEnd ?? 0;
  } catch {
    return false;
  }
  // The whole value selected (as when arriving by arrow) counts as "at the edge".
  const allSelected = start === 0 && end === value.length && value.length > 0;

  if (el instanceof HTMLTextAreaElement && (key === 'ArrowUp' || key === 'ArrowDown') && !allSelected) {
    const line = value.slice(0, start).split('\n').length - 1;
    const lines = value.split('\n').length;
    return key === 'ArrowUp' ? line > 0 : line < lines - 1;
  }
  if (key === 'ArrowUp' || key === 'ArrowDown') return false;
  if (leftRight === 'always' || allSelected) return false;
  if (start !== end) return true;
  return key === 'ArrowLeft' ? start > 0 : start < value.length;
}

/** A suggestions list (datalist) is probably open: Up/Down belong to it. */
function suggestionsOpen(el: Control): boolean {
  if (!(el instanceof HTMLInputElement) || !el.list) return false;
  const typed = el.value.trim().toLowerCase();
  if (!typed) return false;
  return Array.from(el.list.querySelectorAll('option')).some((o) => {
    const v = o.value.toLowerCase();
    return v !== typed && v.includes(typed);
  });
}

function focusControl(el: Control) {
  el.focus();
  if (!(el instanceof HTMLSelectElement)) {
    try {
      el.select();
    } catch {
      // Date inputs cannot be selected.
    }
  }
}

const ARROWS: Record<string, Direction> = {
  ArrowLeft: 'left',
  ArrowRight: 'right',
  ArrowUp: 'up',
  ArrowDown: 'down',
};

/**
 * Handle one keydown inside the form. Returns true when the key was the
 * form's to handle, so the caller stops it reaching the app-wide handler.
 */
export function handleFormKey(
  event: KeyboardEvent,
  root: HTMLElement,
  settings: KeyboardNavSettings | undefined,
): boolean {
  const target = event.target as Element | null;
  if (!isNavControl(target) || !root.contains(target)) return false;
  if (event.altKey || event.ctrlKey || event.metaKey) return false;
  const nav = resolveKeyboardNav(settings);

  if (event.key === 'Enter') {
    // A text area takes Enter as a new line.
    if (target instanceof HTMLTextAreaElement) return true;
    event.preventDefault();
    if (nav.enter === 'off') return true;
    if (nav.enter === 'order') {
      const next = nextInOrder(root, target, !event.shiftKey, nav.order, nav.addedRows);
      if (next) focusControl(next);
      return true;
    }
    const dir: Direction =
      nav.enter === 'down' ? (event.shiftKey ? 'up' : 'down') : event.shiftKey ? 'left' : 'right';
    const next = nextControl(root, target, dir, { wrapColumns: nav.enter === 'down' });
    if (next) focusControl(next);
    return true;
  }

  const dir = ARROWS[event.key];
  if (!dir) return false;
  if (event.shiftKey) return true; // Shift+arrow selects text.
  if (nav.arrows === 'off') return true;
  if ((dir === 'up' || dir === 'down') && suggestionsOpen(target)) return true;
  if (cursorMoves(target, event.key, nav.leftRight)) return true;

  event.preventDefault();
  const next =
    nav.arrows === 'order'
      ? nextInOrder(root, target, dir === 'down' || dir === 'right', nav.order, nav.addedRows)
      : nextControl(root, target, dir);
  if (next) focusControl(next);
  return true;
}
