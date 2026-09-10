/**
 * V2 table grid editor.
 *
 * The focused editor the parity plan asks for. `SectionEditor` edits what V1
 * can express: a flat column list and a row count. This edits what it cannot:
 * multi-row headers with merged cells, body rows of mixed kinds, footers, and
 * unit selectors.
 *
 * It shows the actual table and you click cells in it. Merging is a button on
 * the selected cell, not a number typed into a span field, because a merge is
 * a spatial idea and typing "3" into a box next to a list of labels does not
 * tell you what the table will look like.
 *
 * It writes a `SectionTableOverlay` onto the section rather than replacing the
 * V1 shape, so a section converts back by clearing one key, and every existing
 * reader keeps working while a template is part-converted. Structural edits go
 * through the pure helpers in `v2/authoring.ts`; the grid resolver validates
 * the result on every change, so an overlapping merge is reported here rather
 * than discovered at publication.
 */

import React from "react";
import {
  Plus,
  Trash2,
  ChevronUp,
  ChevronDown,
  AlertTriangle,
  RotateCcw,
  ArrowRight,
  ArrowDown,
  Split,
} from "lucide-react";
import type {
  SectionConfig,
  SectionTableOverlay,
} from "@/lib/types/customForms";
import type {
  BodyRowV2,
  CellKindV2,
  FooterRowV2,
  HeaderRowV2,
} from "@/lib/customForms/v2/schema";
import { resolveGrid } from "@/lib/customForms/v2/grid";
import {
  addHeaderRow,
  beginOverlay,
  canMergeBodyRight,
  canMergeHeaderDown,
  canMergeHeaderRight,
  currentBody,
  currentHeader,
  fillHeaderGaps,
  hasOverlay,
  moveBodyRow,
  newBodyRow,
  newFooterRow,
  overlayColumns,
  removeColumn,
  removeHeaderRow,
  setBodyCellSpan,
  setColumnUnits,
  setHeaderCellLabel,
  setHeaderCellSpan,
  splitBodyCell,
  splitHeaderCell,
  updateBodyCell,
} from "@/lib/customForms/v2/authoring";
import { FormulaInput } from "./FormulaInput";

const ROW_KINDS: Array<{ value: BodyRowV2["kind"]; label: string }> = [
  { value: "records", label: "Repeated records" },
  { value: "fixed", label: "Fixed row" },
  { value: "divider", label: "Divider" },
  { value: "label", label: "Label row" },
  { value: "note", label: "Note" },
  { value: "criteria", label: "Criteria" },
  { value: "subtotal", label: "Subtotal" },
  { value: "total", label: "Total" },
];

const CELL_KINDS: Array<{ value: CellKindV2; label: string }> = [
  { value: "editable", label: "Entry" },
  { value: "calculated", label: "Calculated" },
  { value: "populated", label: "Copied" },
  { value: "display", label: "Display only" },
  { value: "static", label: "Fixed text" },
  { value: "empty", label: "Empty" },
];

const UNIT_PRESETS: Record<string, string[]> = {
  None: [],
  "Resistance (Ω)": ["μΩ", "mΩ", "Ω", "kΩ", "MΩ", "GΩ"],
  "Voltage (V)": ["mV", "V", "kV"],
  "Current (A)": ["μA", "mA", "A", "kA"],
  "Capacitance (F)": ["pF", "nF", "μF", "F"],
  "Time (s)": ["ms", "s", "min", "hr", "cycles"],
};

const inputClass =
  "w-full px-2 py-1 text-xs border border-neutral-300 dark:border-neutral-600 rounded bg-white dark:bg-dark-100 text-neutral-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-brand";
const btn =
  "inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded border disabled:opacity-40 disabled:cursor-not-allowed";
const brandBtn = `${btn} text-brand border-brand hover:bg-orange-50 dark:hover:bg-orange-900/20`;
const plainBtn = `${btn} text-neutral-700 dark:text-neutral-300 border-neutral-300 dark:border-neutral-600 hover:border-neutral-400`;

/** Which cell the toolbar acts on. */
type Selection =
  | { region: "header"; rowId: string; cellId: string }
  | { region: "body"; rowId: string; cellId: string }
  | null;

export interface TableGridEditorProps {
  section: SectionConfig;
  onUpdate: (updates: Partial<SectionConfig>) => void;
  /** Every section, so a formula can reference the rest of the template. */
  allSections?: readonly SectionConfig[];
}

export const TableGridEditor: React.FC<TableGridEditorProps> = ({
  section,
  onUpdate,
  allSections,
}) => {
  const [selected, setSelected] = React.useState<Selection>(null);
  const columns = overlayColumns(section);
  const enabled = hasOverlay(section);

  const patch = (updates: Partial<SectionTableOverlay>) =>
    onUpdate({ v2: { ...(section.v2 ?? {}), ...updates } });

  const header = currentHeader(section);
  const body = currentBody(section);
  const footer = section.v2?.footer ?? [];

  // Validate on every render: a merge that breaks the grid is reported where
  // the author made it, not at publication.
  const problems = React.useMemo(() => {
    const found = [
      ...resolveGrid(header, columns, { regionLabel: "header" }).problems,
    ];
    const literal = body.filter(
      (row): row is Extract<BodyRowV2, { cells: any }> =>
        "cells" in row && Array.isArray((row as any).cells),
    );
    if (literal.length) {
      found.push(
        ...resolveGrid(
          literal.map((row) => ({ id: row.id, cells: row.cells })),
          columns,
          { regionLabel: "body" },
        ).problems,
      );
    }
    if (footer.length) {
      found.push(
        ...resolveGrid(footer, columns, { regionLabel: "footer" }).problems,
      );
    }
    return found;
  }, [header, body, footer, columns]);

  if (columns.length === 0) {
    return (
      <p className="text-xs text-neutral-500 dark:text-neutral-400">
        Add columns to this section before editing its grid.
      </p>
    );
  }

  if (!enabled) {
    return (
      <div className="space-y-2">
        <p className="text-xs text-neutral-600 dark:text-neutral-400">
          This table uses the simple layout: one header row and one repeated row
          type. Turn on grid editing to add merged header cells, mixed row
          types, a footer, or unit selectors.
        </p>
        <button
          type="button"
          onClick={() => onUpdate({ v2: beginOverlay(section) })}
          className={brandBtn}
        >
          <Plus className="w-3 h-3" /> Edit grid
        </button>
      </div>
    );
  }

  const headerGrid = resolveGrid(header, columns, {
    regionLabel: "header",
    allowHoles: true,
  });

  const selectedHeaderCell =
    selected?.region === "header"
      ? header
          .find((row) => row.id === selected.rowId)
          ?.cells.find((cell) => cell.id === selected.cellId)
      : undefined;

  const selectedBodyRow =
    selected?.region === "body"
      ? body.find((row) => row.id === selected.rowId)
      : undefined;
  const selectedBodyCell =
    selectedBodyRow && "cells" in selectedBodyRow
      ? (selectedBodyRow.cells as any[]).find(
          (cell) => cell.id === selected!.cellId,
        )
      : undefined;

  return (
    <div className="space-y-4">
      {problems.length > 0 && (
        <div className="px-2 py-1.5 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded text-[11px] text-red-900 dark:text-red-200">
          <div className="flex items-center gap-1.5 font-medium">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
            {problems.length} grid problem{problems.length === 1 ? "" : "s"}
          </div>
          <ul className="mt-1 space-y-0.5">
            {problems.slice(0, 4).map((problem, index) => (
              <li key={`${problem.code}-${index}`}>{problem.message}</li>
            ))}
          </ul>
          <button
            type="button"
            onClick={() => patch({ header: fillHeaderGaps(section, header) })}
            className="mt-1.5 underline"
          >
            Fill uncovered header columns
          </button>
        </div>
      )}

      {/* ----------------------------------------------------------------
          The table, as it will look. Click a cell to act on it.
         ---------------------------------------------------------------- */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <h4 className="text-xs font-semibold text-neutral-900 dark:text-white">
            Grid
          </h4>
          <span className="text-[10px] text-neutral-500 dark:text-neutral-400">
            Click a cell to select it
          </span>
        </div>

        <div className="overflow-x-auto border border-neutral-200 dark:border-neutral-700 rounded">
          <table className="w-full border-collapse text-[11px]">
            <thead>
              {headerGrid.rows.map((cells, rowIndex) => (
                <tr key={header[rowIndex]?.id ?? rowIndex}>
                  {cells.map(({ cell, colSpan, rowSpan }) => {
                    const isSelected =
                      selected?.region === "header" &&
                      selected.cellId === cell.id;
                    return (
                      <th
                        key={cell.id}
                        colSpan={colSpan > 1 ? colSpan : undefined}
                        rowSpan={rowSpan > 1 ? rowSpan : undefined}
                        onClick={() =>
                          setSelected({
                            region: "header",
                            rowId: header[rowIndex].id,
                            cellId: cell.id,
                          })
                        }
                        className={`border px-2 py-1.5 text-left font-medium cursor-pointer align-top ${
                          isSelected
                            ? "border-brand bg-orange-50 dark:bg-orange-900/30 ring-1 ring-brand"
                            : "border-neutral-300 dark:border-neutral-600 bg-neutral-50 dark:bg-dark-200 hover:bg-neutral-100 dark:hover:bg-dark-100"
                        }`}
                      >
                        {cell.label || (
                          <span className="italic text-neutral-400">
                            untitled
                          </span>
                        )}
                        {(colSpan > 1 || rowSpan > 1) && (
                          <span className="ml-1 text-[9px] text-neutral-400">
                            {colSpan > 1 ? `${colSpan}c` : ""}
                            {rowSpan > 1 ? `${rowSpan}r` : ""}
                          </span>
                        )}
                      </th>
                    );
                  })}
                </tr>
              ))}
            </thead>

            <tbody>
              {body.map((row) => (
                <GridBodyRow
                  key={row.id}
                  row={row}
                  columns={columns}
                  columnCount={columns.length}
                  selectedCellId={
                    selected?.region === "body" && selected.rowId === row.id
                      ? selected.cellId
                      : null
                  }
                  onSelectCell={(cellId) =>
                    setSelected({ region: "body", rowId: row.id, cellId })
                  }
                />
              ))}
            </tbody>

            {footer.length > 0 && (
              <tfoot>
                {footer.map((row: FooterRowV2) => (
                  <tr key={row.id}>
                    <td
                      colSpan={columns.length}
                      className="border border-neutral-300 dark:border-neutral-600 px-2 py-1 bg-neutral-50 dark:bg-dark-200 text-neutral-500 dark:text-neutral-400"
                    >
                      Footer row ({row.cells.length} cells)
                    </td>
                  </tr>
                ))}
              </tfoot>
            )}
          </table>
        </div>
      </div>

      {/* ----------------------------------------------------------------
          Toolbar for whatever is selected.
         ---------------------------------------------------------------- */}
      {selectedHeaderCell && selected?.region === "header" && (
        <div className="border border-brand/40 bg-orange-50/50 dark:bg-orange-900/10 rounded p-2 space-y-2">
          <div className="text-[11px] font-medium text-neutral-700 dark:text-neutral-300">
            Header cell
          </div>
          <input
            value={selectedHeaderCell.label}
            onChange={(e) =>
              patch({
                header: setHeaderCellLabel(
                  section,
                  selected.rowId,
                  selected.cellId,
                  e.target.value,
                ),
              })
            }
            placeholder="Header text"
            className={inputClass}
          />
          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              disabled={
                !canMergeHeaderRight(
                  section,
                  header,
                  selected.rowId,
                  selected.cellId,
                )
              }
              onClick={() =>
                patch({
                  header: setHeaderCellSpan(
                    section,
                    selected.rowId,
                    selected.cellId,
                    { colSpan: (selectedHeaderCell.colSpan ?? 1) + 1 },
                  ),
                })
              }
              className={plainBtn}
            >
              <ArrowRight className="w-3 h-3" /> Merge right
            </button>
            <button
              type="button"
              disabled={
                !canMergeHeaderDown(header, selected.rowId, selected.cellId)
              }
              onClick={() =>
                patch({
                  header: setHeaderCellSpan(
                    section,
                    selected.rowId,
                    selected.cellId,
                    { rowSpan: (selectedHeaderCell.rowSpan ?? 1) + 1 },
                  ),
                })
              }
              className={plainBtn}
            >
              <ArrowDown className="w-3 h-3" /> Merge down
            </button>
            <button
              type="button"
              disabled={
                (selectedHeaderCell.colSpan ?? 1) === 1 &&
                (selectedHeaderCell.rowSpan ?? 1) === 1
              }
              onClick={() =>
                patch({
                  header: splitHeaderCell(
                    section,
                    header,
                    selected.rowId,
                    selected.cellId,
                  ),
                })
              }
              className={plainBtn}
            >
              <Split className="w-3 h-3" /> Split
            </button>
            <button
              type="button"
              disabled={columns.length <= 1}
              onClick={() => {
                const column = columns.find(
                  (entry) => entry.id === selectedHeaderCell.columnId,
                );
                if (
                  !confirm(
                    `Delete the "${column?.label || selectedHeaderCell.columnId}" column? Any values, formulas and merges that used it go too.`,
                  )
                ) {
                  return;
                }
                setSelected(null);
                onUpdate(removeColumn(section, selectedHeaderCell.columnId));
              }}
              className={`${btn} text-red-600 border-red-300 hover:bg-red-50 dark:hover:bg-red-900/20`}
            >
              <Trash2 className="w-3 h-3" /> Delete column
            </button>
          </div>
          <p className="text-[10px] text-neutral-500 dark:text-neutral-400">
            Deleting removes the column this cell starts in
            {(selectedHeaderCell.colSpan ?? 1) > 1
              ? `, the first of the ${selectedHeaderCell.colSpan} it spans.`
              : "."}
          </p>
        </div>
      )}

      {selectedBodyCell && selected?.region === "body" && (
        <div className="border border-brand/40 bg-orange-50/50 dark:bg-orange-900/10 rounded p-2 space-y-2">
          <div className="text-[11px] font-medium text-neutral-700 dark:text-neutral-300">
            Cell in{" "}
            {ROW_KINDS.find((k) => k.value === selectedBodyRow?.kind)?.label}
          </div>
          <select
            value={selectedBodyCell.kind}
            onChange={(e) =>
              patch({
                body: updateBodyCell(body, selected.rowId, selected.cellId, {
                  kind: e.target.value as CellKindV2,
                }),
              })
            }
            className={inputClass}
          >
            {CELL_KINDS.map((entry) => (
              <option key={entry.value} value={entry.value}>
                {entry.label}
              </option>
            ))}
          </select>
          {selectedBodyCell.kind === "static" && (
            <input
              value={selectedBodyCell.text ?? ""}
              onChange={(e) =>
                patch({
                  body: updateBodyCell(body, selected.rowId, selected.cellId, {
                    text: e.target.value,
                  }),
                })
              }
              placeholder="Fixed text"
              className={inputClass}
            />
          )}
          {selectedBodyCell.kind === "calculated" && (
            <FormulaInput
              value={selectedBodyCell.formula ?? ""}
              onChange={(formula) =>
                patch({
                  body: updateBodyCell(body, selected.rowId, selected.cellId, {
                    formula,
                  }),
                })
              }
              sections={allSections ?? [section]}
            />
          )}
          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              disabled={
                !canMergeBodyRight(
                  section,
                  body,
                  selected.rowId,
                  selected.cellId,
                )
              }
              onClick={() =>
                patch({
                  body: setBodyCellSpan(
                    section,
                    body,
                    selected.rowId,
                    selected.cellId,
                    (selectedBodyCell.colSpan ?? 1) + 1,
                  ),
                })
              }
              className={plainBtn}
            >
              <ArrowRight className="w-3 h-3" /> Merge right
            </button>
            <button
              type="button"
              disabled={(selectedBodyCell.colSpan ?? 1) === 1}
              onClick={() =>
                patch({
                  body: splitBodyCell(
                    section,
                    body,
                    selected.rowId,
                    selected.cellId,
                  ),
                })
              }
              className={plainBtn}
            >
              <Split className="w-3 h-3" /> Split
            </button>
            <button
              type="button"
              disabled={columns.length <= 1}
              onClick={() => {
                const column = columns.find(
                  (entry) => entry.id === selectedBodyCell.columnId,
                );
                if (
                  !confirm(
                    `Delete the "${column?.label || selectedBodyCell.columnId}" column? Any values, formulas and merges that used it go too.`,
                  )
                ) {
                  return;
                }
                setSelected(null);
                onUpdate(removeColumn(section, selectedBodyCell.columnId));
              }}
              className={`${btn} text-red-600 border-red-300 hover:bg-red-50 dark:hover:bg-red-900/20`}
            >
              <Trash2 className="w-3 h-3" /> Delete column
            </button>
          </div>
        </div>
      )}

      {/* ----------------------------------------------------------------
          Rows
         ---------------------------------------------------------------- */}
      <div className="flex flex-wrap items-center gap-1.5">
        <button
          type="button"
          onClick={() => patch({ header: addHeaderRow(section) })}
          className={brandBtn}
        >
          <Plus className="w-3 h-3" /> Header row
        </button>
        {header.length > 1 && (
          <button
            type="button"
            onClick={() =>
              patch({
                header: removeHeaderRow(section, header[header.length - 1].id),
              })
            }
            className={plainBtn}
          >
            <Trash2 className="w-3 h-3" /> Last header row
          </button>
        )}
        <select
          value=""
          onChange={(e) => {
            if (!e.target.value) return;
            patch({
              body: [
                ...body,
                newBodyRow(section, e.target.value as BodyRowV2["kind"]),
              ],
            });
            e.target.value = "";
          }}
          className="px-2 py-1 text-xs border border-brand text-brand rounded bg-transparent"
        >
          <option value="">+ Body row…</option>
          {ROW_KINDS.map((kind) => (
            <option key={kind.value} value={kind.value}>
              {kind.label}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => patch({ footer: [...footer, newFooterRow(section)] })}
          className={brandBtn}
        >
          <Plus className="w-3 h-3" /> Footer row
        </button>
        {footer.length > 0 && (
          <button
            type="button"
            onClick={() => patch({ footer: footer.slice(0, -1) })}
            className={plainBtn}
          >
            <Trash2 className="w-3 h-3" /> Last footer row
          </button>
        )}
      </div>

      {/* Per-row settings, only where a row has any. */}
      <div className="space-y-1.5">
        {body.map((row, index) => (
          <BodyRowSettings
            key={row.id}
            row={row}
            index={index}
            total={body.length}
            columns={columns}
            onMove={(direction) =>
              patch({ body: moveBodyRow(body, row.id, direction) })
            }
            onRemove={() => {
              setSelected(null);
              patch({ body: body.filter((entry) => entry.id !== row.id) });
            }}
            onPatchRow={(updates) =>
              patch({
                body: body.map((entry) =>
                  entry.id === row.id
                    ? ({ ...entry, ...updates } as BodyRowV2)
                    : entry,
                ),
              })
            }
          />
        ))}
      </div>

      {/* ----------------------------------------------------------------
          Units
         ---------------------------------------------------------------- */}
      <details className="text-[11px]">
        <summary className="cursor-pointer font-semibold text-neutral-900 dark:text-white">
          Unit selectors
        </summary>
        <div className="mt-2 space-y-1.5">
          <label className="flex items-center gap-2">
            <span className="w-24 shrink-0 text-neutral-600 dark:text-neutral-400">
              Whole table
            </span>
            <UnitPicker
              value={section.v2?.units?.options ?? []}
              onChange={(options) =>
                patch({
                  units: options.length
                    ? { options, default: options[0], scope: "table" }
                    : undefined,
                })
              }
            />
          </label>
          {columns.map((column) => (
            <label key={column.id} className="flex items-center gap-2">
              <span
                className="w-24 shrink-0 truncate text-neutral-600 dark:text-neutral-400"
                title={column.label ?? column.id}
              >
                {column.label ?? column.id}
              </span>
              <UnitPicker
                value={section.v2?.columnUnits?.[column.id]?.options ?? []}
                onChange={(options) =>
                  onUpdate({
                    v2: setColumnUnits(
                      section.v2,
                      column.id,
                      options.length
                        ? { options, default: options[0], scope: "column" }
                        : undefined,
                    ),
                  })
                }
              />
            </label>
          ))}
        </div>
      </details>

      <div className="pt-2 border-t border-neutral-200 dark:border-neutral-700">
        <button
          type="button"
          onClick={() => {
            if (
              confirm(
                "Discard this table's grid layout and go back to the simple one-header-row table? Merged cells, extra row types and footers will be lost.",
              )
            ) {
              setSelected(null);
              onUpdate({ v2: undefined });
            }
          }}
          className={`${btn} text-neutral-600 dark:text-neutral-400 border-neutral-300 dark:border-neutral-600 hover:border-red-400 hover:text-red-600`}
        >
          <RotateCcw className="w-3 h-3" /> Back to the simple table
        </button>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------

/** One body row drawn as it will appear, with clickable cells. */
const GridBodyRow: React.FC<{
  row: BodyRowV2;
  columns: ReturnType<typeof overlayColumns>;
  columnCount: number;
  selectedCellId: string | null;
  onSelectCell: (cellId: string) => void;
}> = ({ row, columns, columnCount, selectedCellId, onSelectCell }) => {
  const border = "border border-neutral-300 dark:border-neutral-600";

  if (row.kind === "divider") {
    return (
      <tr>
        <td colSpan={columnCount} className={`${border} p-0`}>
          <div className="h-px bg-neutral-400 dark:bg-neutral-500" />
        </td>
      </tr>
    );
  }

  if (row.kind === "note" || row.kind === "criteria" || row.kind === "label") {
    const tone =
      row.kind === "criteria"
        ? "bg-amber-50 dark:bg-amber-900/20 text-amber-900 dark:text-amber-200"
        : row.kind === "label"
          ? "bg-neutral-100 dark:bg-dark-200 font-semibold"
          : "italic text-neutral-600 dark:text-neutral-400";
    return (
      <tr>
        <td colSpan={columnCount} className={`${border} px-2 py-1 ${tone}`}>
          {row.text || (
            <span className="italic text-neutral-400">
              (empty {row.kind} text)
            </span>
          )}
        </td>
      </tr>
    );
  }

  if (row.kind === "records") {
    return (
      <tr>
        {columns.map((column) => (
          <td
            key={column.id}
            className={`${border} px-2 py-1 bg-white dark:bg-dark-100`}
          >
            <div className="h-4 rounded bg-neutral-100 dark:bg-dark-200" />
          </td>
        ))}
      </tr>
    );
  }

  const cells = "cells" in row ? row.cells : [];
  const emphasis =
    row.kind === "subtotal" || row.kind === "total"
      ? "font-semibold bg-neutral-50 dark:bg-dark-200"
      : "";

  return (
    <tr className={emphasis}>
      {cells.map((cell) => {
        const isSelected = cell.id === selectedCellId;
        return (
          <td
            key={cell.id}
            colSpan={cell.colSpan && cell.colSpan > 1 ? cell.colSpan : undefined}
            onClick={() => onSelectCell(cell.id)}
            className={`px-2 py-1 cursor-pointer ${
              isSelected
                ? "border border-brand bg-orange-50 dark:bg-orange-900/30 ring-1 ring-brand"
                : `${border} hover:bg-neutral-50 dark:hover:bg-dark-200`
            }`}
          >
            <span className="text-neutral-600 dark:text-neutral-400">
              {cell.kind === "static"
                ? cell.text || "fixed"
                : cell.kind === "calculated"
                  ? (cell.formula ?? "= …")
                  : CELL_KINDS.find((k) => k.value === cell.kind)?.label}
            </span>
          </td>
        );
      })}
    </tr>
  );
};

const BodyRowSettings: React.FC<{
  row: BodyRowV2;
  index: number;
  total: number;
  columns: ReturnType<typeof overlayColumns>;
  onMove: (direction: -1 | 1) => void;
  onRemove: () => void;
  onPatchRow: (updates: Record<string, unknown>) => void;
}> = ({ row, index, total, columns, onMove, onRemove, onPatchRow }) => (
  <div className="flex flex-wrap items-center gap-2 border border-neutral-200 dark:border-neutral-700 rounded px-2 py-1 text-[11px]">
    <span className="font-medium text-neutral-700 dark:text-neutral-300">
      {index + 1}. {ROW_KINDS.find((k) => k.value === row.kind)?.label}
    </span>

    {row.kind === "records" && (
      <>
        <label className="flex items-center gap-1">
          <span
            className="text-neutral-500 dark:text-neutral-400"
            title="Some reports record two rows per circuit: the reading and its corrected value."
          >
            rows per record
          </span>
          <input
            type="number"
            min={1}
            max={4}
            value={row.policy.rowsPerRecord ?? 1}
            onChange={(e) =>
              onPatchRow({
                policy: {
                  ...row.policy,
                  rowsPerRecord: Math.max(
                    1,
                    Math.min(4, Number(e.target.value) || 1),
                  ),
                },
              })
            }
            className="w-12 px-1 py-0.5 border border-neutral-300 dark:border-neutral-600 rounded bg-white dark:bg-dark-100 text-neutral-900 dark:text-white"
          />
        </label>
        {(row.policy.rowsPerRecord ?? 1) > 1 && columns.length > 0 && (
          <details className="w-full">
            <summary className="cursor-pointer text-neutral-600 dark:text-neutral-400">
              Columns that span the whole record
            </summary>
            <div className="mt-1 flex flex-wrap gap-2">
              {columns.map((column) => {
                const spanning = row.policy.spanningColumns ?? [];
                const checked = spanning.includes(column.id);
                return (
                  <label key={column.id} className="flex items-center gap-1">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(e) =>
                        onPatchRow({
                          policy: {
                            ...row.policy,
                            spanningColumns: e.target.checked
                              ? [...spanning, column.id]
                              : spanning.filter((id) => id !== column.id),
                          },
                        })
                      }
                      className="w-3 h-3 text-brand rounded"
                    />
                    <span className="text-neutral-600 dark:text-neutral-400">
                      {column.label || column.id}
                    </span>
                  </label>
                );
              })}
            </div>
          </details>
        )}
        {(["initial", "min", "max"] as const).map((key) => (
          <label key={key} className="flex items-center gap-1">
            <span className="text-neutral-500 dark:text-neutral-400">{key}</span>
            <input
              type="number"
              min={0}
              value={row.policy[key]}
              onChange={(e) =>
                onPatchRow({
                  policy: {
                    ...row.policy,
                    [key]: Math.max(0, Number(e.target.value) || 0),
                  },
                })
              }
              className="w-12 px-1 py-0.5 border border-neutral-300 dark:border-neutral-600 rounded bg-white dark:bg-dark-100 text-neutral-900 dark:text-white"
            />
          </label>
        ))}
        {(["allowAdd", "allowRemove"] as const).map((key) => (
          <label key={key} className="flex items-center gap-1">
            <input
              type="checkbox"
              checked={row.policy[key]}
              onChange={(e) =>
                onPatchRow({
                  policy: { ...row.policy, [key]: e.target.checked },
                })
              }
              className="w-3 h-3 text-brand rounded"
            />
            <span className="text-neutral-600 dark:text-neutral-400">
              {key === "allowAdd" ? "can add" : "can remove"}
            </span>
          </label>
        ))}
      </>
    )}

    {(row.kind === "note" ||
      row.kind === "criteria" ||
      row.kind === "label") && (
      <input
        value={row.text}
        onChange={(e) => onPatchRow({ text: e.target.value })}
        placeholder="Text shown across the table"
        className={`${inputClass} flex-1 min-w-[10rem]`}
      />
    )}

    <div className="ml-auto flex items-center gap-1">
      <button
        type="button"
        disabled={index === 0}
        onClick={() => onMove(-1)}
        className="text-neutral-400 hover:text-neutral-700 disabled:opacity-30"
        title="Move up"
      >
        <ChevronUp className="w-3.5 h-3.5" />
      </button>
      <button
        type="button"
        disabled={index === total - 1}
        onClick={() => onMove(1)}
        className="text-neutral-400 hover:text-neutral-700 disabled:opacity-30"
        title="Move down"
      >
        <ChevronDown className="w-3.5 h-3.5" />
      </button>
      <button
        type="button"
        onClick={onRemove}
        className="text-red-600 hover:text-red-700"
        title="Remove row"
      >
        <Trash2 className="w-3.5 h-3.5" />
      </button>
    </div>
  </div>
);

const UnitPicker: React.FC<{
  value: string[];
  onChange: (options: string[]) => void;
}> = ({ value, onChange }) => {
  const current =
    Object.entries(UNIT_PRESETS).find(
      ([, options]) => options.join(",") === value.join(","),
    )?.[0] ?? "None";
  return (
    <select
      value={current}
      onChange={(e) => onChange(UNIT_PRESETS[e.target.value] ?? [])}
      className={inputClass}
    >
      {Object.keys(UNIT_PRESETS).map((name) => (
        <option key={name} value={name}>
          {name}
        </option>
      ))}
    </select>
  );
};
