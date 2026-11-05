/**
 * Authoring operations for the V2 table overlay.
 *
 * Pure functions, so the grid editor stays a thin shell over logic that can be
 * tested without a DOM. Every operation returns a new overlay; nothing mutates
 * the section it was given.
 *
 * The invariant these maintain is that the overlay must always describe a grid
 * the resolver accepts. Widening a span pushes neighbours out of the way rather
 * than leaving an overlap behind, because a merged cell that silently breaks
 * the column alignment is exactly the failure V1 could not detect.
 */

import type { SectionConfig, SectionTableOverlay } from "@/lib/types/customForms";
import { resolveGrid, implicitHeaderRow } from "./grid";
import type {
  BodyRowV2,
  CellV2,
  ColumnV2,
  FooterRowV2,
  HeaderCellV2,
  HeaderRowV2,
  RowPolicyV2,
  UnitSpecV2,
} from "./schema";

let counter = 0;

/** Stable-enough id for a node the author just created. */
export function newNodeId(prefix: string): string {
  const uuid = globalThis.crypto?.randomUUID?.();
  if (uuid) return `${prefix}-${uuid.slice(0, 8)}`;
  counter += 1;
  return `${prefix}-${Date.now().toString(36)}-${counter.toString(36)}`;
}

/** The columns a section's table has, as the adapter sees them. */
export function overlayColumns(section: SectionConfig): ColumnV2[] {
  return (section.columns ?? []).map((column) => ({
    id: column.id,
    fieldId: column.field?.id ?? column.id,
    label: column.label,
    width: column.width,
    units: section.v2?.columnUnits?.[column.id],
  }));
}

// ---------------------------------------------------------------------------
// Header rows
// ---------------------------------------------------------------------------

/** The header the editor starts from: whatever is declared, or the implicit one. */
export function currentHeader(section: SectionConfig): HeaderRowV2[] {
  const declared = section.v2?.header;
  if (declared && declared.length > 0) return declared;
  return [implicitHeaderRow(overlayColumns(section))];
}

export function addHeaderRow(section: SectionConfig): HeaderRowV2[] {
  const columns = overlayColumns(section);
  return [
    ...currentHeader(section),
    {
      id: newNodeId("hrow"),
      cells: columns.map((column) => ({
        id: newNodeId("hcell"),
        columnId: column.id,
        label: "",
      })),
    },
  ];
}

export function removeHeaderRow(
  section: SectionConfig,
  rowId: string,
): HeaderRowV2[] {
  const rows = currentHeader(section).filter((row) => row.id !== rowId);
  // A table always needs at least one header row.
  return rows.length > 0 ? rows : [implicitHeaderRow(overlayColumns(section))];
}

/**
 * Change a header cell's span, dropping the cells it now covers.
 *
 * Widening a merged cell has to remove whatever sat underneath it, or the row
 * ends up wider than the table and every column below shifts.
 */
export function setHeaderCellSpan(
  section: SectionConfig,
  rowId: string,
  cellId: string,
  span: { colSpan?: number; rowSpan?: number },
): HeaderRowV2[] {
  const columns = overlayColumns(section);
  const indexOf = new Map(columns.map((column, index) => [column.id, index]));

  return currentHeader(section).map((row) => {
    if (row.id !== rowId) return row;

    const target = row.cells.find((cell) => cell.id === cellId);
    if (!target) return row;

    const colSpan = Math.max(1, span.colSpan ?? target.colSpan ?? 1);
    const rowSpan = Math.max(1, span.rowSpan ?? target.rowSpan ?? 1);
    const start = indexOf.get(target.columnId) ?? 0;
    const end = Math.min(start + colSpan, columns.length);

    const cells = row.cells.filter((cell) => {
      if (cell.id === cellId) return true;
      const index = indexOf.get(cell.columnId);
      // Anything now sitting inside the widened cell goes.
      return index === undefined || index < start || index >= end;
    });

    return {
      ...row,
      cells: cells.map((cell) =>
        cell.id === cellId
          ? {
              ...cell,
              colSpan: end - start > 1 ? end - start : undefined,
              rowSpan: rowSpan > 1 ? rowSpan : undefined,
            }
          : cell,
      ),
    };
  });
}

export function setHeaderCellLabel(
  section: SectionConfig,
  rowId: string,
  cellId: string,
  label: string,
): HeaderRowV2[] {
  return currentHeader(section).map((row) =>
    row.id === rowId
      ? {
          ...row,
          cells: row.cells.map((cell) =>
            cell.id === cellId ? { ...cell, label } : cell,
          ),
        }
      : row,
  );
}

/** Put back a cell the author removed by widening a neighbour. */
export function fillHeaderGaps(
  section: SectionConfig,
  header: HeaderRowV2[],
): HeaderRowV2[] {
  const columns = overlayColumns(section);
  const occupied = occupancyOf(header, columns);

  return header.map((row, rowIndex) => {
    const missing: HeaderCellV2[] = [];
    columns.forEach((column, columnIndex) => {
      if (occupied[rowIndex]?.[columnIndex]) return;
      missing.push({
        id: newNodeId("hcell"),
        columnId: column.id,
        label: "",
      });
    });
    return missing.length ? { ...row, cells: [...row.cells, ...missing] } : row;
  });
}

/** Which grid positions each header row covers, spans included. */
function occupancyOf(
  header: HeaderRowV2[],
  columns: ColumnV2[],
): boolean[][] {
  const grid = resolveGrid(header, columns, { allowHoles: true });
  const occupied: boolean[][] = header.map(() =>
    new Array(columns.length).fill(false),
  );
  grid.rows.forEach((cells) => {
    for (const placed of cells) {
      for (let r = placed.rowIndex; r < placed.rowIndex + placed.rowSpan; r += 1) {
        for (
          let c = placed.columnIndex;
          c < placed.columnIndex + placed.colSpan;
          c += 1
        ) {
          if (occupied[r]) occupied[r][c] = true;
        }
      }
    }
  });
  return occupied;
}

// ---------------------------------------------------------------------------
// Body rows
// ---------------------------------------------------------------------------

const DEFAULT_POLICY: RowPolicyV2 = {
  initial: 1,
  min: 1,
  max: 100,
  allowAdd: true,
  allowRemove: true,
  allowReorder: false,
  allowCopy: false,
};

/** A new body row of the requested kind, filled in enough to render. */
export function newBodyRow(
  section: SectionConfig,
  kind: BodyRowV2["kind"],
): BodyRowV2 {
  const columns = overlayColumns(section);
  const id = newNodeId("row");

  switch (kind) {
    case "records":
      return { id, kind: "records", policy: { ...DEFAULT_POLICY } };
    case "divider":
      return { id, kind: "divider" };
    case "note":
    case "criteria":
    case "label":
      return { id, kind, text: "" };
    case "subtotal":
    case "total":
      return {
        id,
        kind,
        label: kind === "total" ? "Total" : "Subtotal",
        cells: columns.map((column, index) => ({
          id: newNodeId("cell"),
          columnId: column.id,
          kind: index === 0 ? "static" : "calculated",
          text: index === 0 ? (kind === "total" ? "Total" : "Subtotal") : undefined,
          emphasis: "bold",
        })),
      };
    default:
      return {
        id,
        kind: "fixed",
        cells: columns.map((column) => ({
          id: newNodeId("cell"),
          columnId: column.id,
          kind: "editable",
        })),
      };
  }
}

/** The body the editor starts from: whatever is declared, or one records row. */
export function currentBody(section: SectionConfig): BodyRowV2[] {
  const declared = section.v2?.body;
  if (declared && declared.length > 0) return declared;
  return [
    {
      id: `${section.id}-records`,
      kind: "records",
      policy: {
        ...DEFAULT_POLICY,
        initial: section.rows ?? 1,
        min: section.minRows ?? 1,
        max: section.maxRows ?? 100,
        allowAdd: !!section.allowAddRows,
        allowRemove: !!section.allowRemoveRows,
      },
    },
  ];
}

export function moveBodyRow(
  body: BodyRowV2[],
  rowId: string,
  direction: -1 | 1,
): BodyRowV2[] {
  const index = body.findIndex((row) => row.id === rowId);
  const target = index + direction;
  if (index < 0 || target < 0 || target >= body.length) return body;
  const next = [...body];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

/** Change a body cell's span, dropping the cells it now covers. */
export function setBodyCellSpan(
  section: SectionConfig,
  body: BodyRowV2[],
  rowId: string,
  cellId: string,
  colSpan: number,
): BodyRowV2[] {
  const columns = overlayColumns(section);
  const indexOf = new Map(columns.map((column, index) => [column.id, index]));

  return body.map((row) => {
    if (row.id !== rowId || !("cells" in row) || !Array.isArray(row.cells)) {
      return row;
    }
    const target = row.cells.find((cell) => cell.id === cellId);
    if (!target) return row;

    const span = Math.max(1, colSpan);
    const start = indexOf.get(target.columnId) ?? 0;
    const end = Math.min(start + span, columns.length);

    const cells = row.cells
      .filter((cell) => {
        if (cell.id === cellId) return true;
        const index = indexOf.get(cell.columnId);
        return index === undefined || index < start || index >= end;
      })
      .map((cell) =>
        cell.id === cellId
          ? { ...cell, colSpan: end - start > 1 ? end - start : undefined }
          : cell,
      );

    return { ...row, cells } as BodyRowV2;
  });
}

export function updateBodyCell(
  body: BodyRowV2[],
  rowId: string,
  cellId: string,
  patch: Partial<CellV2>,
): BodyRowV2[] {
  return body.map((row) => {
    if (row.id !== rowId || !("cells" in row) || !Array.isArray(row.cells)) {
      return row;
    }
    return {
      ...row,
      cells: row.cells.map((cell) =>
        cell.id === cellId ? { ...cell, ...patch } : cell,
      ),
    } as BodyRowV2;
  });
}

// ---------------------------------------------------------------------------
// Footer
// ---------------------------------------------------------------------------

export function newFooterRow(section: SectionConfig): FooterRowV2 {
  return {
    id: newNodeId("frow"),
    cells: overlayColumns(section).map((column, index) => ({
      id: newNodeId("fcell"),
      columnId: column.id,
      kind: index === 0 ? "static" : "calculated",
      emphasis: "bold",
    })),
  };
}

// ---------------------------------------------------------------------------
// Overlay lifecycle
// ---------------------------------------------------------------------------

/** True when a section carries V2 structure of its own. */
export function hasOverlay(section: SectionConfig): boolean {
  const v2 = section.v2;
  if (!v2) return false;
  return Boolean(
    v2.header?.length ||
      v2.body?.length ||
      v2.footer?.length ||
      v2.units ||
      (v2.columnUnits && Object.keys(v2.columnUnits).length) ||
      v2.print,
  );
}

/**
 * Start authoring: capture what the adapter currently generates, so the editor
 * opens showing the table as it already looks rather than an empty grid.
 */
export function beginOverlay(section: SectionConfig): SectionTableOverlay {
  return {
    header: currentHeader(section),
    body: currentBody(section),
    footer: [],
    ...(section.v2 ?? {}),
  };
}

/** Stop authoring: the section goes back to what V1 alone describes. */
export function clearOverlay(): undefined {
  return undefined;
}

/** Column-level unit selectors, keyed by column id. */
export function setColumnUnits(
  overlay: SectionTableOverlay | undefined,
  columnId: string,
  units: UnitSpecV2 | undefined,
): SectionTableOverlay {
  const columnUnits = { ...(overlay?.columnUnits ?? {}) };
  if (units) columnUnits[columnId] = units;
  else delete columnUnits[columnId];
  return { ...(overlay ?? {}), columnUnits };
}

// ---------------------------------------------------------------------------
// Direct manipulation: merge and split
// ---------------------------------------------------------------------------

/**
 * Split a merged header cell back to one column and one row, then put back the
 * cells it had been covering. Merging is destructive by necessity; splitting
 * has to be able to undo it or the author is stuck.
 */
export function splitHeaderCell(
  section: SectionConfig,
  header: HeaderRowV2[],
  rowId: string,
  cellId: string,
): HeaderRowV2[] {
  const reset = header.map((row) =>
    row.id === rowId
      ? {
          ...row,
          cells: row.cells.map((cell) =>
            cell.id === cellId
              ? { ...cell, colSpan: undefined, rowSpan: undefined }
              : cell,
          ),
        }
      : row,
  );
  return fillHeaderGaps(section, reset);
}

/** The columns a header row does not cover, left to right. */
export function uncoveredHeaderColumns(
  section: SectionConfig,
  header: HeaderRowV2[],
  rowIndex: number,
): string[] {
  const columns = overlayColumns(section);
  const occupied = occupancyOf(header, columns);
  return columns
    .filter((_, columnIndex) => !occupied[rowIndex]?.[columnIndex])
    .map((column) => column.id);
}

/**
 * Whether a header cell can grow by one more column: there has to be a column
 * to the right, and it must not already belong to a cell above.
 */
export function canMergeHeaderRight(
  section: SectionConfig,
  header: HeaderRowV2[],
  rowId: string,
  cellId: string,
): boolean {
  const columns = overlayColumns(section);
  const row = header.find((entry) => entry.id === rowId);
  const cell = row?.cells.find((entry) => entry.id === cellId);
  if (!row || !cell) return false;
  const start = columns.findIndex((column) => column.id === cell.columnId);
  if (start < 0) return false;
  return start + (cell.colSpan ?? 1) < columns.length;
}

export function canMergeHeaderDown(
  header: HeaderRowV2[],
  rowId: string,
  cellId: string,
): boolean {
  const rowIndex = header.findIndex((entry) => entry.id === rowId);
  const cell = header[rowIndex]?.cells.find((entry) => entry.id === cellId);
  if (!cell) return false;
  return rowIndex + (cell.rowSpan ?? 1) < header.length;
}

/** Split a merged body cell and restore the cells it covered. */
export function splitBodyCell(
  section: SectionConfig,
  body: BodyRowV2[],
  rowId: string,
  cellId: string,
): BodyRowV2[] {
  const reset = body.map((row) => {
    if (row.id !== rowId || !("cells" in row) || !Array.isArray(row.cells)) {
      return row;
    }
    return {
      ...row,
      cells: row.cells.map((cell) =>
        cell.id === cellId ? { ...cell, colSpan: undefined } : cell,
      ),
    } as BodyRowV2;
  });
  return fillBodyGaps(section, reset);
}

/** Put back body cells a merge removed, so every column is covered again. */
export function fillBodyGaps(
  section: SectionConfig,
  body: BodyRowV2[],
): BodyRowV2[] {
  const columns = overlayColumns(section);
  const indexOf = new Map(columns.map((column, index) => [column.id, index]));

  return body.map((row) => {
    if (!("cells" in row) || !Array.isArray(row.cells)) return row;

    const covered = new Set<number>();
    for (const cell of row.cells) {
      const start = indexOf.get(cell.columnId);
      if (start === undefined) continue;
      for (let i = start; i < start + (cell.colSpan ?? 1); i += 1) {
        covered.add(i);
      }
    }

    const missing: CellV2[] = [];
    columns.forEach((column, index) => {
      if (covered.has(index)) return;
      missing.push({
        id: newNodeId("cell"),
        columnId: column.id,
        kind: "editable",
      });
    });

    if (missing.length === 0) return row;

    // Keep cells in column order so the rendered row reads left to right.
    const cells = [...row.cells, ...missing].sort(
      (a, b) => (indexOf.get(a.columnId) ?? 0) - (indexOf.get(b.columnId) ?? 0),
    );
    return { ...row, cells } as BodyRowV2;
  });
}

export function canMergeBodyRight(
  section: SectionConfig,
  body: BodyRowV2[],
  rowId: string,
  cellId: string,
): boolean {
  const columns = overlayColumns(section);
  const row = body.find((entry) => entry.id === rowId);
  if (!row || !("cells" in row) || !Array.isArray(row.cells)) return false;
  const cell = row.cells.find((entry) => entry.id === cellId);
  if (!cell) return false;
  const start = columns.findIndex((column) => column.id === cell.columnId);
  if (start < 0) return false;
  return start + (cell.colSpan ?? 1) < columns.length;
}

// ---------------------------------------------------------------------------
// Removing a column
// ---------------------------------------------------------------------------

/**
 * Remove a column and everything that referred to it.
 *
 * A column is not just an entry in `columns`: header cells anchor to it, merged
 * cells span across it, per-cell formulas and static text are keyed by it, and
 * a records row may name it as spanning. Deleting only the column entry leaves
 * every one of those dangling, so this returns the whole consistent update.
 *
 * A merged cell anchored to the removed column keeps its heading and shifts to
 * the next column rather than disappearing, because losing a group heading is a
 * bigger surprise than losing one of the columns under it.
 */
export function removeColumn(
  section: SectionConfig,
  columnId: string,
): Partial<SectionConfig> {
  const columns = section.columns ?? [];
  const removedIndex = columns.findIndex((column) => column.id === columnId);
  if (removedIndex < 0) return {};

  const remaining = columns.filter((column) => column.id !== columnId);
  const nextColumnId = columns[removedIndex + 1]?.id;
  const indexOf = new Map(columns.map((column, index) => [column.id, index]));

  function reflow<T extends { id: string; columnId: string; colSpan?: number }>(
    cells: T[],
  ): T[] {
    const out: T[] = [];
    for (const cell of cells) {
      const start = indexOf.get(cell.columnId);
      if (start === undefined) continue;
      const span = cell.colSpan ?? 1;

      if (start === removedIndex) {
        // Anchored to the column going away.
        if (span <= 1) continue;
        if (!nextColumnId) continue;
        out.push({ ...cell, columnId: nextColumnId, colSpan: span - 1 > 1 ? span - 1 : undefined });
        continue;
      }
      if (start < removedIndex && start + span > removedIndex) {
        // Spans across it, so it gets one narrower.
        out.push({ ...cell, colSpan: span - 1 > 1 ? span - 1 : undefined });
        continue;
      }
      out.push(cell);
    }
    return out;
  }

  const overlay = section.v2;
  const nextOverlay: SectionTableOverlay | undefined = overlay
    ? {
        ...overlay,
        header: overlay.header?.map((row) => ({
          ...row,
          cells: reflow(row.cells),
        })),
        body: overlay.body?.map((row) => {
          if (row.kind === "records") {
            const spanningColumns = row.policy.spanningColumns?.filter(
              (id) => id !== columnId,
            );
            return { ...row, policy: { ...row.policy, spanningColumns } };
          }
          if (!("cells" in row) || !Array.isArray(row.cells)) return row;
          return { ...row, cells: reflow(row.cells) } as BodyRowV2;
        }),
        footer: overlay.footer?.map((row) => ({
          ...row,
          cells: reflow(row.cells),
        })),
        columnUnits: overlay.columnUnits
          ? Object.fromEntries(
              Object.entries(overlay.columnUnits).filter(([id]) => id !== columnId),
            )
          : undefined,
      }
    : undefined;

  const dropKeys = (map: Record<string, string> | undefined) =>
    map
      ? Object.fromEntries(
          Object.entries(map).filter(([key]) => !key.endsWith(`_${columnId}`)),
        )
      : undefined;

  const updates: Partial<SectionConfig> = {
    columns: remaining,
    cellFormulas: dropKeys(section.cellFormulas),
    staticCells: dropKeys(section.staticCells),
  };

  if (nextOverlay) {
    // Put back any column left uncovered by the reflow.
    const reduced: SectionConfig = { ...section, columns: remaining, v2: nextOverlay };
    updates.v2 = {
      ...nextOverlay,
      header: nextOverlay.header
        ? fillHeaderGaps(reduced, nextOverlay.header)
        : undefined,
      body: nextOverlay.body ? fillBodyGaps(reduced, nextOverlay.body) : undefined,
    };
  }

  return updates;
}
