/**
 * Table row resolution.
 *
 * A V2 table body is a list of entries, not a row count. A `records` entry is
 * a generator that expands to as many rows as the instance holds; everything
 * else is one literal row. Resolving them produces the ordered list of runtime
 * rows the renderer draws.
 *
 * Two indices matter and they are not the same:
 *
 *  - `dataIndex` is the position a row's values live at, and it is what V1
 *    keyed `sectionId_row{N}` by. Only rows that hold data consume one, so a
 *    divider or a note never shifts a reading.
 *  - `rowInstanceId` is the row's identity, minted once and persisted. It is
 *    what add, remove, reorder and copy operate on.
 */

import type { BodyRowV2, CellV2, ColumnV2, TableV2 } from "./schema";
import { rowStateKey } from "../runtime/layout";
import type { RowInstanceV2 } from "../instanceState";

/** Row kinds that occupy a data slot. Decorative rows do not. */
const DATA_ROW_KINDS = new Set<BodyRowV2["kind"]>([
  "records",
  "fixed",
  "subtotal",
  "total",
]);

export function isDataRowKind(kind: BodyRowV2["kind"]): boolean {
  return DATA_ROW_KINDS.has(kind);
}

export interface RuntimeRowV2 {
  /** The formData key this row reads and writes. */
  stateKey: string;
  /** Stable identity, from the instance state. Empty for decorative rows. */
  rowInstanceId: string;
  /** Position in the section's value list, or -1 for a decorative row. */
  dataIndex: number;
  kind: BodyRowV2["kind"];
  source: BodyRowV2;
  label?: string;
  /**
   * The cells to render. A records row has none of its own; the renderer
   * builds them from the columns.
   */
  cells: CellV2[] | null;
  /** Which generator produced this row, for add and remove. */
  generatorId?: string;
  /** Position within that generator, which is what remove operates on. */
  indexInGenerator?: number;
  /** Which record this row belongs to, when a record spans several rows. */
  recordIndex?: number;
  /** Position inside that record: 0 is the first row of the pair. */
  subRowIndex?: number;
}

/**
 * Cells a records row draws, one per column, from the column templates.
 *
 * When a record spans several rows, the columns that identify the record are
 * drawn once on the first sub-row with a row span, and omitted from the rest.
 * That is how a circuit's From and To sit beside a pair of reading rows.
 */
export function recordCells(
  columns: ColumnV2[],
  generatorId: string,
  indexInGenerator: number,
  options: {
    rowsPerRecord?: number;
    spanningColumns?: readonly string[];
    subRowIndex?: number;
  } = {},
): CellV2[] {
  const rowsPerRecord = Math.max(1, options.rowsPerRecord ?? 1);
  const subRowIndex = options.subRowIndex ?? 0;
  const spanning = new Set(options.spanningColumns ?? []);

  return columns
    .filter((column) => {
      if (rowsPerRecord === 1 || !spanning.has(column.id)) return true;
      // A spanning column belongs to the first sub-row only.
      return subRowIndex === 0;
    })
    .map((column) => ({
      id: `${generatorId}-${indexInGenerator}-${subRowIndex}-${column.id}`,
      columnId: column.id,
      rowSpan:
        rowsPerRecord > 1 && spanning.has(column.id) ? rowsPerRecord : undefined,
      kind: column.defaultCell?.kind ?? "editable",
      control: column.defaultCell?.control,
      text: column.defaultCell?.text,
      formula: column.defaultCell?.formula,
      binding: column.defaultCell?.binding,
      align: column.defaultCell?.align ?? column.align,
      emphasis: column.defaultCell?.emphasis,
      resultStyle: column.defaultCell?.resultStyle,
      visibleWhen: column.defaultCell?.visibleWhen,
      printWhen: column.defaultCell?.printWhen,
      requiredWhen: column.defaultCell?.requiredWhen,
      readOnlyWhen: column.defaultCell?.readOnlyWhen,
    }));
}

export interface ResolveRowsOptions {
  /** Rows the instance holds for this section, in order. */
  instanceRows?: RowInstanceV2[];
  /**
   * How many rows each generator currently has. Absent means use the policy's
   * initial count, which is what a form opening for the first time does.
   */
  generatorCounts?: Record<string, number>;
}

/**
 * The ordered runtime rows for a table.
 *
 * `sectionId` keys the state, and stays the section rather than the table so
 * that instances written before V2 keep resolving to the same values.
 */
export function resolveTableRows(
  table: TableV2,
  sectionId: string,
  options: ResolveRowsOptions = {},
): RuntimeRowV2[] {
  const { instanceRows = [], generatorCounts } = options;
  const rows: RuntimeRowV2[] = [];
  let dataIndex = 0;

  const identityAt = (index: number): string =>
    instanceRows[index]?.rowInstanceId ?? "";

  for (const entry of table.body) {
    if (entry.kind === "records") {
      const declared = generatorCounts?.[entry.id];
      const count = clampCount(
        declared ?? entry.policy.initial,
        entry.policy.min,
        entry.policy.max,
      );
      const rowsPerRecord = Math.max(1, entry.policy.rowsPerRecord ?? 1);
      for (let i = 0; i < count; i += 1) {
        for (let sub = 0; sub < rowsPerRecord; sub += 1) {
          rows.push({
            // Each sub-row keeps its own data slot, so the flat state map and
            // every existing reader are unchanged by a record growing a row.
            stateKey: rowStateKey(sectionId, dataIndex),
            rowInstanceId: identityAt(dataIndex),
            dataIndex,
            kind: "records",
            source: entry,
            cells: null,
            generatorId: entry.id,
            indexInGenerator: i,
            recordIndex: i,
            subRowIndex: sub,
            label:
              rowsPerRecord > 1
                ? entry.policy.subRowLabels?.[sub]
                : entry.policy.generatedLabels?.[i],
          });
          dataIndex += 1;
        }
      }
      continue;
    }

    const consumesData = isDataRowKind(entry.kind);
    rows.push({
      stateKey: consumesData ? rowStateKey(sectionId, dataIndex) : "",
      rowInstanceId: consumesData ? identityAt(dataIndex) : "",
      dataIndex: consumesData ? dataIndex : -1,
      kind: entry.kind,
      source: entry,
      cells: "cells" in entry ? entry.cells : null,
      label: "label" in entry ? entry.label : undefined,
    });
    if (consumesData) dataIndex += 1;
  }

  return rows;
}

function clampCount(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, Math.floor(value)));
}

/** How many data slots a table currently uses. */
export function tableDataRowCount(
  table: TableV2,
  options: ResolveRowsOptions = {},
): number {
  return resolveTableRows(table, "x", options).filter((r) => r.dataIndex >= 0)
    .length;
}

/** The generators a table has, in order. */
export function tableGenerators(
  table: TableV2,
): Array<Extract<BodyRowV2, { kind: "records" }>> {
  return table.body.filter(
    (entry): entry is Extract<BodyRowV2, { kind: "records" }> =>
      entry.kind === "records",
  );
}

/**
 * Current row count per generator, from the instance's stored counts falling
 * back to each policy's initial value.
 */
export function generatorCountsFor(
  table: TableV2,
  stored: Record<string, number> | undefined,
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const generator of tableGenerators(table)) {
    counts[generator.id] = clampCount(
      stored?.[generator.id] ?? generator.policy.initial,
      generator.policy.min,
      generator.policy.max,
    );
  }
  return counts;
}
