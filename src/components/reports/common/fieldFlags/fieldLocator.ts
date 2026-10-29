// Finds report fields for field flags. Most of the hand-built report pages have
// no field names, so a field is pinned down by three things:
//   index    its position among the page's fields
//   context  its readable label: section title › row label › column title
//   key      a name/id attribute, on the few fields that have one
// Positions shift when the tech adds or removes table rows, so the label is
// checked too, and used on its own when the position no longer fits.
//
// Works on the live (non-print) report only. The print view renders separate
// plain-text tables, so its page structure doesn't match.

export type FlagTargetKind = 'field' | 'section';

export interface FieldLocator {
  kind: FlagTargetKind;
  index: number;
  key: string | null;
  context: string;
  section: string;
  row: string;
  column: string;
}

/** Marks our own flag UI so it is never treated as part of the report. */
export const FLAG_UI_ATTR = 'data-ff-ui';
/** Set on the element that holds the report (Layout's main, or the embedded wrapper). */
export const FLAG_ROOT_ATTR = 'data-ff-root';

const FIELD_SELECTOR = 'input, select, textarea';
const HEADING_SELECTOR = 'h1, h2, h3, h4';
const SECTION_SELECTOR = `${HEADING_SELECTOR}, [data-flag-target]`;
const SKIP_INPUT_TYPES = new Set(['hidden', 'button', 'submit', 'reset', 'file', 'image']);
const SKIP_TEXT_TAGS = new Set(['SELECT', 'OPTION', 'TEXTAREA', 'SCRIPT', 'STYLE', 'BUTTON', 'svg']);
const MAX_PART = 60;

export const getFlagRoot = (): HTMLElement =>
  (document.querySelector(`[${FLAG_ROOT_ATTR}]`) as HTMLElement | null) || document.body;

const inFlagUi = (el: Element) => !!el.closest(`[${FLAG_UI_ATTR}]`);

export const isVisible = (el: Element) => el.getClientRects().length > 0;

const isFlaggableField = (el: Element) => {
  if (inFlagUi(el)) return false;
  if (el instanceof HTMLInputElement && SKIP_INPUT_TYPES.has(el.type)) return false;
  return true;
};

export const listFields = (root: HTMLElement): HTMLElement[] =>
  Array.from(root.querySelectorAll<HTMLElement>(FIELD_SELECTOR)).filter(isFlaggableField);

export const listSections = (root: HTMLElement): HTMLElement[] =>
  Array.from(root.querySelectorAll<HTMLElement>(SECTION_SELECTOR)).filter(
    (el) => !inFlagUi(el) && sectionText(el) !== '',
  );

const clip = (text: string) => {
  const t = text.replace(/\s+/g, ' ').replace(/[\s:*]+$/, '').trim();
  return t.length > MAX_PART ? `${t.slice(0, MAX_PART - 1)}…` : t;
};

/** Visible text of an element, leaving out dropdown options and buttons. */
const ownText = (el: Element): string => {
  let out = '';
  el.childNodes.forEach((node) => {
    if (node.nodeType === Node.TEXT_NODE) out += node.textContent || '';
    else if (node instanceof Element && !SKIP_TEXT_TAGS.has(node.tagName) && !inFlagUi(node)) {
      out += ` ${ownText(node)} `;
    }
  });
  return out;
};

const sectionText = (el: Element) =>
  clip(el.getAttribute('data-flag-target') || ownText(el));

export const readFieldValue = (el: Element): string => {
  if (el instanceof HTMLInputElement && (el.type === 'checkbox' || el.type === 'radio')) {
    return el.checked ? 'checked' : '';
  }
  if (el instanceof HTMLSelectElement) {
    return el.selectedIndex >= 0 ? (el.options[el.selectedIndex]?.text ?? el.value) : '';
  }
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) return el.value;
  return '';
};

/** Per-pass cache so one refresh doesn't rebuild the same table grid many times. */
export interface LocatorCache {
  headings?: HTMLElement[];
  grids: Map<HTMLTableElement, HTMLTableCellElement[][]>;
}

export const newLocatorCache = (): LocatorCache => ({ grids: new Map() });

/** Table cells laid out by real column, with row and column spans filled in. */
const tableGrid = (table: HTMLTableElement, cache: LocatorCache) => {
  const cached = cache.grids.get(table);
  if (cached) return cached;
  const grid: HTMLTableCellElement[][] = [];
  Array.from(table.rows).forEach((tr, r) => {
    grid[r] = grid[r] || [];
    let c = 0;
    Array.from(tr.cells).forEach((cell) => {
      while (grid[r][c]) c++;
      const colSpan = Math.max(1, cell.colSpan || 1);
      const rowSpan = Math.max(1, cell.rowSpan || 1);
      for (let i = 0; i < rowSpan; i++) {
        grid[r + i] = grid[r + i] || [];
        for (let j = 0; j < colSpan; j++) grid[r + i][c + j] = cell;
      }
      c += colSpan;
    });
  });
  cache.grids.set(table, grid);
  return grid;
};

const cellLabel = (cell: HTMLTableCellElement) => {
  const text = clip(ownText(cell));
  if (text) return text;
  const field = cell.querySelector(FIELD_SELECTOR);
  return field ? clip(readFieldValue(field)) : '';
};

const tableParts = (el: Element, cache: LocatorCache) => {
  const cell = el.closest('td, th') as HTMLTableCellElement | null;
  const table = cell?.closest('table') as HTMLTableElement | null;
  if (!cell || !table) return null;
  const rows = Array.from(table.rows);
  const r = rows.indexOf(cell.parentElement as HTMLTableRowElement);
  if (r === -1) return null;
  const grid = tableGrid(table, cache);
  const c = grid[r].indexOf(cell);

  // Header rows: everything in <thead>, else leading rows made only of <th>.
  const headerRows: number[] = [];
  rows.forEach((tr, i) => {
    if (tr.parentElement?.tagName === 'THEAD') headerRows.push(i);
  });
  if (headerRows.length === 0) {
    for (let i = 0; i < rows.length; i++) {
      const cells = Array.from(rows[i].cells);
      if (cells.length && cells.every((x) => x.tagName === 'TH')) headerRows.push(i);
      else break;
    }
  }

  const column: string[] = [];
  if (!headerRows.includes(r)) {
    headerRows.forEach((h) => {
      const head = grid[h]?.[c];
      if (!head || head === cell) return;
      const text = clip(ownText(head));
      if (text && column[column.length - 1] !== text) column.push(text);
    });
  }

  let row = '';
  const first = grid[r][0];
  if (first && first !== cell) row = cellLabel(first);
  if (!row && !headerRows.includes(r)) {
    const bodyRow = rows.slice(0, r + 1).filter((_, i) => !headerRows.includes(i)).length;
    row = `Row ${bodyRow}`;
  }
  return { row, column: column.join(' › ') };
};

/** Closest label for a field outside a table, or inside a table cell. */
const fieldLabel = (el: HTMLElement, root: HTMLElement) => {
  const aria = el.getAttribute('aria-label');
  if (aria) return clip(aria);
  if (el.id) {
    const forLabel = root.querySelector(`label[for="${CSS.escape(el.id)}"]`);
    if (forLabel) return clip(ownText(forLabel));
  }
  const wrapping = el.closest('label');
  if (wrapping) {
    const text = clip(ownText(wrapping));
    if (text) return text;
  }
  // <div><label>Serial #</label><input/></div>: last label before the field,
  // looking up to three levels out.
  let scope = el.parentElement;
  for (let depth = 0; scope && depth < 3; depth++, scope = scope.parentElement) {
    const labels = Array.from(scope.querySelectorAll('label')).filter(
      (l) => l.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING,
    );
    const label = labels[labels.length - 1];
    if (label) {
      const text = clip(ownText(label));
      if (text) return text;
    }
    if (scope === root) break;
  }
  const placeholder = el.getAttribute('placeholder');
  return placeholder ? clip(placeholder) : '';
};

/** Last visible heading before the element. */
const sectionFor = (el: Element, root: HTMLElement, cache: LocatorCache) => {
  if (!cache.headings) {
    cache.headings = Array.from(root.querySelectorAll<HTMLElement>(HEADING_SELECTOR)).filter(
      (h) => !inFlagUi(h) && isVisible(h),
    );
  }
  let found = '';
  for (const h of cache.headings) {
    if (h.contains(el)) continue;
    if (h.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING) {
      const text = sectionText(h);
      if (text) found = text;
    } else break;
  }
  return found;
};

const keyFor = (el: HTMLElement) => {
  const flagKey = el.getAttribute('data-flag-target');
  if (flagKey) return flagKey;
  const name = el.getAttribute('name');
  if (name) return name;
  // React's generated ids (":r3:") change between page loads.
  if (el.id && !el.id.includes(':')) return el.id;
  return null;
};

export const joinContext = (parts: (string | undefined)[]) =>
  parts.filter(Boolean).join(' › ');

const isSectionTarget = (el: Element) =>
  el.matches(SECTION_SELECTOR) && !el.matches(FIELD_SELECTOR);

/** Describes a target whose position on the page is already known. */
const describeAt = (
  el: HTMLElement,
  index: number,
  root: HTMLElement,
  cache: LocatorCache,
): FieldLocator => {
  if (isSectionTarget(el)) {
    const text = sectionText(el);
    return { kind: 'section', index, key: keyFor(el), context: text, section: text, row: '', column: '' };
  }
  const section = sectionFor(el, root, cache);
  const table = tableParts(el, cache);
  const row = table?.row || '';
  const column = table?.column || fieldLabel(el, root);
  return {
    kind: 'field',
    index,
    key: keyFor(el),
    context: joinContext([section, row, column]),
    section,
    row,
    column,
  };
};

/** Describes a field or section so it can be found again later. */
export const describeTarget = (
  el: HTMLElement,
  root: HTMLElement,
  cache: LocatorCache = newLocatorCache(),
): FieldLocator | null => {
  const list = isSectionTarget(el) ? listSections(root) : listFields(root);
  const index = list.indexOf(el);
  return index === -1 ? null : describeAt(el, index, root, cache);
};

/** Picks the match closest to where the target used to be, preferring visible ones. */
const closest = (candidates: { el: HTMLElement; i: number }[], index: number) => {
  if (candidates.length === 0) return null;
  const visible = candidates.filter((c) => isVisible(c.el));
  const pool = visible.length ? visible : candidates;
  return pool.reduce((best, c) => (Math.abs(c.i - index) < Math.abs(best.i - index) ? c : best)).el;
};

/** Finds a flagged target on the page, or null if it can't be found. */
export const resolveTarget = (
  loc: FieldLocator,
  root: HTMLElement,
  cache: LocatorCache = newLocatorCache(),
): HTMLElement | null => {
  const list = loc.kind === 'section' ? listSections(root) : listFields(root);

  if (loc.key) {
    const byKey = list.filter((el) => keyFor(el) === loc.key);
    if (byKey.length === 1) return byKey[0];
  }

  const atIndex = list[loc.index];
  if (atIndex && describeAt(atIndex, loc.index, root, cache).context === loc.context) {
    return atIndex;
  }

  const described = list.map((el, i) => ({ el, i, d: describeAt(el, i, root, cache) }));
  const match = closest(
    described.filter((x) => x.d.context === loc.context),
    loc.index,
  );
  if (match) return match;

  // The row label changed (e.g. the tech renamed the device in that row): the
  // same section and column near the old position is the best guess.
  if (loc.kind === 'field' && loc.column) {
    return closest(
      described.filter((x) => x.d.section === loc.section && x.d.column === loc.column),
      loc.index,
    );
  }
  return null;
};

/** The flaggable field or section under a point, used while flag mode is on. */
export const targetAtPoint = (
  x: number,
  y: number,
  start: Element | null,
  root: HTMLElement,
): HTMLElement | null => {
  if (!start || !root.contains(start) || inFlagUi(start)) return null;
  // Fields ignore the pointer in flag mode, so look for one whose box holds
  // the point, starting from the element under the pointer.
  let scope: Element | null = start;
  for (let depth = 0; scope && depth < 4; depth++, scope = scope.parentElement) {
    const hit = Array.from(scope.querySelectorAll<HTMLElement>(FIELD_SELECTOR)).find((el) => {
      if (!isFlaggableField(el)) return false;
      const r = el.getBoundingClientRect();
      return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
    });
    if (hit) return hit;
    if (scope === root) break;
  }
  const section = start.closest(SECTION_SELECTOR) as HTMLElement | null;
  if (section && root.contains(section) && !inFlagUi(section) && sectionText(section)) return section;
  return null;
};
