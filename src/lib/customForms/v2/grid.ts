/**
 * Table grid resolution.
 *
 * A cell with `colSpan` or `rowSpan` occupies more than one grid position, and
 * a row span reaches into rows that have not been read yet. Rendering that
 * correctly means resolving the whole region into an occupancy map first: HTML
 * expects each `<tr>` to contain only the cells that *start* in it, and a cell
 * covered by a span from above must be omitted, not rendered empty.
 *
 * Getting this wrong is silent. A table with overlapping spans renders with
 * columns sliding out of alignment and no error anywhere, which is exactly the
 * failure V1 could not detect. So the resolver reports overlaps and holes, and
 * the compiler refuses to publish a table that has them.
 */

import type {
  CellV2,
  ColumnV2,
  HeaderCellV2,
  HeaderRowV2,
} from "./schema";

export interface GridProblem {
  code:
    | "grid.unknownColumn"
    | "grid.overlap"
    | "grid.hole"
    | "grid.overflow"
    | "grid.badSpan";
  message: string;
  rowIndex: number;
  cellId?: string;
  columnId?: string;
}

/** One placed cell, with the grid position it actually occupies. */
export interface PlacedCell<T> {
  cell: T;
  rowIndex: number;
  /** 0-based column index the cell starts at. */
  columnIndex: number;
  colSpan: number;
  rowSpan: number;
}

export interface ResolvedGrid<T> {
  /** Cells that start in each row, left to right. Render these and no others. */
  rows: PlacedCell<T>[][];
  problems: GridProblem[];
  columnCount: number;
  rowCount: number;
}

interface SpannableCell {
  id: string;
  columnId: string;
  colSpan?: number;
  rowSpan?: number;
}

function clampSpan(value: number | undefined): number {
  if (value == null) return 1;
  if (!Number.isFinite(value)) return 1;
  return Math.max(1, Math.floor(value));
}

/**
 * Place a region's cells onto a grid.
 *
 * `visibleColumns` is the column list after conditional filtering, so a hidden
 * column shrinks the grid rather than leaving a gap. A span that reached across
 * a hidden column is narrowed to the columns that remain.
 */
export function resolveGrid<T extends SpannableCell>(
  rows: Array<{ id: string; cells: T[] }>,
  visibleColumns: ColumnV2[],
  options: { allowHoles?: boolean; regionLabel?: string } = {},
): ResolvedGrid<T> {
  const { allowHoles = false, regionLabel = "table" } = options;
  const columnCount = visibleColumns.length;
  const indexByColumnId = new Map(
    visibleColumns.map((column, index) => [column.id, index]),
  );

  const problems: GridProblem[] = [];
  // occupancy[rowIndex][columnIndex] = the cell id sitting there, or undefined.
  const occupancy: Array<Array<string | undefined>> = [];
  const placed: PlacedCell<T>[][] = [];

  const ensureRow = (rowIndex: number) => {
    while (occupancy.length <= rowIndex) {
      occupancy.push(new Array(columnCount).fill(undefined));
    }
  };

  rows.forEach((row, rowIndex) => {
    ensureRow(rowIndex);
    const placedInRow: PlacedCell<T>[] = [];

    for (const cell of row.cells) {
      const startIndex = indexByColumnId.get(cell.columnId);
      if (startIndex === undefined) {
        // The anchor column is hidden or does not exist. Dropping the cell is
        // right for a hidden column and is reported for a missing one.
        if (!visibleColumnsContainId(visibleColumns, cell.columnId)) {
          problems.push({
            code: "grid.unknownColumn",
            message: `Cell "${cell.id}" in ${regionLabel} row ${rowIndex + 1} anchors to column "${cell.columnId}", which is not in the table.`,
            rowIndex,
            cellId: cell.id,
            columnId: cell.columnId,
          });
        }
        continue;
      }

      const requestedColSpan = clampSpan(cell.colSpan);
      const rowSpan = clampSpan(cell.rowSpan);

      if (
        (cell.colSpan != null && cell.colSpan < 1) ||
        (cell.rowSpan != null && cell.rowSpan < 1)
      ) {
        problems.push({
          code: "grid.badSpan",
          message: `Cell "${cell.id}" in ${regionLabel} row ${rowIndex + 1} has a span below 1.`,
          rowIndex,
          cellId: cell.id,
        });
      }

      let colSpan = requestedColSpan;
      if (startIndex + colSpan > columnCount) {
        problems.push({
          code: "grid.overflow",
          message: `Cell "${cell.id}" in ${regionLabel} row ${rowIndex + 1} spans ${colSpan} columns from "${cell.columnId}", past the last column.`,
          rowIndex,
          cellId: cell.id,
          columnId: cell.columnId,
        });
        colSpan = columnCount - startIndex;
      }

      // Reserve the rectangle, reporting anything already sitting there.
      let overlapped = false;
      for (let r = rowIndex; r < rowIndex + rowSpan; r += 1) {
        ensureRow(r);
        for (let c = startIndex; c < startIndex + colSpan; c += 1) {
          const occupant = occupancy[r][c];
          if (occupant !== undefined && !overlapped) {
            overlapped = true;
            problems.push({
              code: "grid.overlap",
              message: `Cell "${cell.id}" in ${regionLabel} row ${rowIndex + 1} overlaps "${occupant}" at column ${c + 1}.`,
              rowIndex,
              cellId: cell.id,
              columnId: visibleColumns[c]?.id,
            });
          }
          occupancy[r][c] = cell.id;
        }
      }

      placedInRow.push({
        cell,
        rowIndex,
        columnIndex: startIndex,
        colSpan,
        rowSpan,
      });
    }

    placed.push(placedInRow);
  });

  if (!allowHoles) {
    occupancy.forEach((row, rowIndex) => {
      const holes: number[] = [];
      row.forEach((occupant, columnIndex) => {
        if (occupant === undefined) holes.push(columnIndex + 1);
      });
      if (holes.length > 0 && holes.length < columnCount) {
        problems.push({
          code: "grid.hole",
          message: `${regionLabel} row ${rowIndex + 1} leaves column${holes.length === 1 ? "" : "s"} ${holes.join(", ")} uncovered.`,
          rowIndex,
        });
      }
    });
  }

  return {
    rows: placed,
    problems,
    columnCount,
    rowCount: occupancy.length,
  };
}

function visibleColumnsContainId(columns: ColumnV2[], id: string): boolean {
  return columns.some((column) => column.id === id);
}

/**
 * Header grids are the common case for spans, so they get a dedicated entry
 * point.
 *
 * Holes are NOT allowed. A two-row header whose first column carries one tall
 * label covers the row below it through that cell's `rowSpan`, so it is not a
 * hole; a genuinely uncovered column means the table has a gap and every
 * column to its right will sit under the wrong heading.
 */
export function resolveHeaderGrid(
  header: HeaderRowV2[],
  visibleColumns: ColumnV2[],
): ResolvedGrid<HeaderCellV2> {
  return resolveGrid(header, visibleColumns, {
    allowHoles: false,
    regionLabel: "header",
  });
}

export function resolveBodyGrid(
  rows: Array<{ id: string; cells: CellV2[] }>,
  visibleColumns: ColumnV2[],
): ResolvedGrid<CellV2> {
  return resolveGrid(rows, visibleColumns, {
    allowHoles: false,
    regionLabel: "body",
  });
}

/**
 * A single header row covering every column, for a table whose columns carry
 * their own labels and which therefore declares no explicit header.
 */
export function implicitHeaderRow(columns: ColumnV2[]): HeaderRowV2 {
  return {
    id: "header-implicit",
    cells: columns.map((column) => ({
      id: `header-${column.id}`,
      columnId: column.id,
      label: column.label ?? "",
      align: column.align,
    })),
  };
}
