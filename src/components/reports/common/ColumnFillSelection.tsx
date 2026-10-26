import React, { useEffect, useState } from "react";

// Shift-click column fill for every report table.
// Click a cell, Shift+click another cell in the same column, then type once:
// every cell in between gets the same value. Works on the DOM so no report
// needs changes. Values go in through the native value setter plus a bubbling
// event, which makes React run each report's own onChange as if typed.

const SELECTED_ATTR = "data-column-fill-selected";
const FIELD_SELECTOR = "input, select, textarea";
const SKIPPED_INPUT_TYPES = new Set([
  "checkbox",
  "radio",
  "file",
  "button",
  "submit",
  "reset",
  "hidden",
  "image",
]);

type FillField = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;

// A typeable field inside a table cell of the report.
const asFillField = (node: EventTarget | null): FillField | null => {
  if (!(node instanceof Element)) return null;
  const el = node.closest(FIELD_SELECTOR) as FillField | null;
  if (!el || !el.closest("#report-container td")) return null;
  if (el instanceof HTMLInputElement && SKIPPED_INPUT_TYPES.has(el.type)) return null;
  if (el.disabled || (el as HTMLInputElement).readOnly) return null;
  return el;
};

const sameKind = (a: FillField, b: FillField) =>
  a.tagName === b.tagName &&
  (!(a instanceof HTMLInputElement) || a.type === (b as HTMLInputElement).type);

// Visual column, counting colSpan so merged header-style cells don't shift it.
const columnOf = (cell: HTMLTableCellElement) => {
  let col = 0;
  for (const c of Array.from((cell.parentElement as HTMLTableRowElement).cells)) {
    if (c === cell) return col;
    col += c.colSpan || 1;
  }
  return -1;
};

const cellAtColumn = (row: HTMLTableRowElement, col: number) => {
  let pos = 0;
  for (const c of Array.from(row.cells)) {
    if (pos === col) return c;
    pos += c.colSpan || 1;
    if (pos > col) return null;
  }
  return null;
};

const fieldsIn = (cell: Element) =>
  Array.from(cell.querySelectorAll<FillField>(FIELD_SELECTOR));

// Fields in the same column (and same slot within the cell) from one row to another.
const columnRange = (from: FillField, to: FillField): FillField[] | null => {
  const fromCell = from.closest("td");
  const toCell = to.closest("td");
  const table = fromCell?.closest("table");
  if (!fromCell || !toCell || !table || toCell.closest("table") !== table) return null;

  const col = columnOf(fromCell);
  if (col < 0 || columnOf(toCell) !== col) return null;

  const slot = fieldsIn(fromCell).indexOf(from);
  if (slot < 0 || fieldsIn(toCell).indexOf(to) !== slot) return null;

  const fromRow = (fromCell.parentElement as HTMLTableRowElement).rowIndex;
  const toRow = (toCell.parentElement as HTMLTableRowElement).rowIndex;
  const fields: FillField[] = [];
  for (let i = Math.min(fromRow, toRow); i <= Math.max(fromRow, toRow); i++) {
    const cell = cellAtColumn(table.rows[i], col);
    const field = cell ? fieldsIn(cell)[slot] : undefined;
    if (field && asFillField(field) && sameKind(field, from)) fields.push(field);
  }
  return fields.length > 1 ? fields : null;
};

const setNativeValue = (el: FillField, value: string) => {
  if (el instanceof HTMLSelectElement) {
    // Never blank a dropdown that doesn't offer this choice.
    if (!Array.from(el.options).some((o) => o.value === value)) return;
  }
  const proto =
    el instanceof HTMLSelectElement
      ? HTMLSelectElement.prototype
      : el instanceof HTMLTextAreaElement
        ? HTMLTextAreaElement.prototype
        : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, "value")?.set?.call(el, value);
  el.dispatchEvent(
    new Event(el instanceof HTMLSelectElement ? "change" : "input", { bubbles: true }),
  );
};

export const ColumnFillSelection: React.FC = () => {
  const [count, setCount] = useState(0);

  useEffect(() => {
    let anchor: FillField | null = null;
    let selected: FillField[] = [];
    let filling = false;

    const setSelection = (fields: FillField[]) => {
      if (!fields.length && !selected.length) return;
      selected.forEach((f) => f.removeAttribute(SELECTED_ATTR));
      selected = fields;
      selected.forEach((f) => f.setAttribute(SELECTED_ATTR, ""));
      setCount(fields.length);
    };

    const onMouseDown = (e: MouseEvent) => {
      const field = asFillField(e.target);
      if (field && e.shiftKey && anchor && anchor !== field && anchor.isConnected) {
        const range = columnRange(anchor, field);
        if (range) {
          setSelection(range);
          return;
        }
      }
      setSelection([]);
      anchor = field;
    };

    // Select the clicked cell's text so typing replaces it instead of appending.
    const onClick = (e: MouseEvent) => {
      const field = asFillField(e.target);
      if (!e.shiftKey || !field || !selected.includes(field)) return;
      if (field instanceof HTMLSelectElement) return;
      try {
        field.select();
      } catch {
        // Some input types (e.g. date) can't select text; typing still fills.
      }
    };

    // Tabbing to a field outside the selection ends it.
    const onFocusIn = (e: FocusEvent) => {
      const field = asFillField(e.target);
      if (field && selected.includes(field)) return;
      setSelection([]);
      if (field) anchor = field;
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSelection([]);
    };

    // Runs on document after React has handled the original keystroke.
    const onValue = (e: Event) => {
      if (filling || selected.length < 2) return;
      const source = e.target as FillField;
      if (!selected.includes(source)) return;
      // Text fields fill on "input"; dropdowns on "change".
      if ((source instanceof HTMLSelectElement) !== (e.type === "change")) return;
      filling = true;
      try {
        for (const field of selected) {
          if (field !== source && field.isConnected) setNativeValue(field, source.value);
        }
      } catch (error) {
        console.error("Column fill failed:", error);
      } finally {
        filling = false;
      }
    };

    document.addEventListener("mousedown", onMouseDown, true);
    document.addEventListener("click", onClick, true);
    document.addEventListener("focusin", onFocusIn);
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("input", onValue);
    document.addEventListener("change", onValue);
    return () => {
      document.removeEventListener("mousedown", onMouseDown, true);
      document.removeEventListener("click", onClick, true);
      document.removeEventListener("focusin", onFocusIn);
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("input", onValue);
      document.removeEventListener("change", onValue);
      selected.forEach((f) => f.removeAttribute(SELECTED_ATTR));
    };
  }, []);

  if (count < 2) return null;
  return (
    <div
      role="status"
      className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 pointer-events-none bg-brand text-white text-sm px-3 py-2 rounded-none shadow-lg print:hidden"
    >
      {count} cells selected. Type to fill them all. Esc to clear.
    </div>
  );
};
