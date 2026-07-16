/**
 * Grouped-field grid packing.
 *
 * Grouped-field components (Job Details, Nameplate Data, etc.) render their
 * fields into a fixed-column table. Each field may span multiple columns
 * (`colSpan`, for width) and/or multiple rows (`rowSpan`, for height). This
 * helper lays the fields out on that grid, left-to-right / top-to-bottom, and
 * returns a per-row list of "slots" ready to render as <td> cells.
 *
 * A slot is either:
 *  - a `cell` that starts in this row (render a <td colSpan rowSpan>), or
 *  - an `empty` filler for a column that no field covers (render an empty <td>).
 *
 * Columns covered by a `rowSpan` from a row above are simply omitted (the
 * browser's rowspan handles them), so they produce no slot.
 *
 * Kept framework-agnostic (no JSX) so the filler, previews, and builder canvas
 * can all share one correct implementation.
 */

export interface GridField {
  colSpan?: number;
  rowSpan?: number;
}

export interface GridCellSlot<F> {
  type: "cell";
  field: F;
  colSpan: number;
  rowSpan: number;
}

export interface GridEmptySlot {
  type: "empty";
}

export type GridSlot<F> = GridCellSlot<F> | GridEmptySlot;

/**
 * Pack `fields` into a `columns`-wide grid, honouring per-field colSpan/rowSpan.
 * Returns one entry per visual row; each entry is the ordered slots for that row.
 */
export function packGroupedFieldGrid<F extends GridField>(
  fields: F[],
  columns: number,
): GridSlot<F>[][] {
  const cols = Math.max(1, columns);
  // occupied[row][col] = true when a (possibly spanning) field covers that cell
  const occupied: boolean[][] = [];
  const ensureRow = (r: number) => {
    while (occupied.length <= r) occupied.push(new Array(cols).fill(false));
  };

  // starts[row][col] = the placed cell that begins there
  const starts: Map<string, GridCellSlot<F>> = new Map();
  const key = (r: number, c: number) => `${r}:${c}`;

  let r = 0;
  let c = 0;
  let maxRow = 0;

  const fits = (row: number, col: number, span: number): boolean => {
    ensureRow(row);
    for (let cc = col; cc < col + span; cc++) {
      if (occupied[row][cc]) return false;
    }
    return true;
  };

  for (const field of fields) {
    const colSpan = Math.min(cols, Math.max(1, Math.floor(field.colSpan ?? 1)));
    const rowSpan = Math.max(1, Math.floor(field.rowSpan ?? 1));

    // Advance to the next position that can fit this field's width.
    // Wrap to a new row when it would overflow or the run is occupied.
    // Guard the loop so a pathological config can never hang.
    let guard = 0;
    const guardMax = (fields.length + cols) * cols + 100;
    while (guard++ < guardMax) {
      if (c + colSpan > cols) {
        r += 1;
        c = 0;
        continue;
      }
      ensureRow(r);
      if (occupied[r][c]) {
        c += 1;
        if (c >= cols) {
          r += 1;
          c = 0;
        }
        continue;
      }
      if (!fits(r, c, colSpan)) {
        c += 1;
        if (c >= cols) {
          r += 1;
          c = 0;
        }
        continue;
      }
      break;
    }

    // Mark the footprint occupied.
    for (let rr = r; rr < r + rowSpan; rr++) {
      ensureRow(rr);
      for (let cc = c; cc < c + colSpan; cc++) occupied[rr][cc] = true;
    }
    starts.set(key(r, c), { type: "cell", field, colSpan, rowSpan });
    maxRow = Math.max(maxRow, r + rowSpan - 1);

    c += colSpan;
    if (c >= cols) {
      r += 1;
      c = 0;
    }
  }

  // Build the per-row slot lists.
  const result: GridSlot<F>[][] = [];
  for (let row = 0; row <= maxRow; row++) {
    ensureRow(row);
    const slots: GridSlot<F>[] = [];
    let col = 0;
    while (col < cols) {
      const start = starts.get(key(row, col));
      if (start) {
        slots.push(start);
        col += start.colSpan;
      } else if (occupied[row][col]) {
        // Covered by a rowSpan from above – no cell rendered here.
        col += 1;
      } else {
        slots.push({ type: "empty" });
        col += 1;
      }
    }
    result.push(slots);
  }
  return result;
}
