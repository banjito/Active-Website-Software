/**
 * V2 section renderer.
 *
 * This draws a `SectionBlockV2`: multi-row headers with merged cells,
 * heterogeneous body rows, footers, conditional columns and cells, and
 * unit selectors. It replaces the V1 dispatch, which V1 sections now reach
 * through the adapter, so there is still exactly one renderer.
 *
 * Structure is owned here. Leaf controls are not: the shell's chrome draws
 * those, so the same document renders as inputs in the filler, grey blocks on
 * the builder canvas, and plain values in print.
 */

import React from "react";
import { FieldType, type FieldConfig, type SectionConfig } from "@/lib/types/customForms";
import type {
  CellV2,
  ColumnV2,
  ControlV2,
  FieldV2,
  HeaderRowV2,
  SectionBlockV2,
  TableV2,
  UnitSpecV2,
} from "@/lib/customForms/v2/schema";
import { implicitHeaderRow, resolveGrid, type PlacedCell } from "@/lib/customForms/v2/grid";
import { evaluateCondition, resolveNodeState, type ConditionScope } from "@/lib/customForms/v2/conditions";
import {
  recordCells,
  resolveTableRows,
  type RuntimeRowV2,
} from "@/lib/customForms/v2/rows";
import { rowStateKey } from "@/lib/customForms/runtime/layout";
import type {
  ControlSlot,
  SectionChrome,
  SectionRowInfo,
} from "@/lib/customForms/runtime";
import { packGroupedFieldGrid } from "@/lib/customForms/groupedFieldGrid";

const BORDER = "border-neutral-300 dark:border-neutral-600";

interface Density {
  table: string;
  th: string;
  td: string;
  label: string;
}

const DENSITIES: Record<"compact" | "normal", Density> = {
  compact: {
    table: "text-xs",
    th: "px-2 py-1 text-left font-medium text-neutral-900 dark:text-white",
    td: "px-2 py-1",
    label: "font-medium text-neutral-700 dark:text-neutral-300",
  },
  normal: {
    table: "",
    th: "px-3 py-2 text-left text-sm font-medium text-neutral-900 dark:text-white",
    td: "px-2 py-1",
    label:
      "text-xs font-medium text-neutral-500 dark:text-white uppercase mb-1",
  },
};

const ALIGN_CLASS: Record<string, string> = {
  left: "text-left",
  center: "text-center",
  right: "text-right",
};

const EMPHASIS_CLASS: Record<string, string> = {
  none: "",
  bold: "font-semibold",
  muted: "text-neutral-500 dark:text-neutral-400",
  heading: "font-semibold uppercase tracking-wide text-xs",
};

// ---------------------------------------------------------------------------
// Bridging V2 controls to the chrome's V1-shaped slot
// ---------------------------------------------------------------------------

/**
 * A best-effort V1 field for a V2 control, so a chrome that predates V2 still
 * renders something usable. `controlV2` on the slot carries the real thing.
 */
function fieldShimFor(
  id: string,
  label: string,
  control: ControlV2 | undefined,
  extra: Partial<FieldConfig> = {},
): FieldConfig {
  const base: FieldConfig = { id, label, type: FieldType.TEXT, ...extra };
  if (!control) return base;
  switch (control.type) {
    case "multiline":
      return { ...base, type: FieldType.TEXTAREA };
    case "number":
      return { ...base, type: FieldType.NUMBER };
    case "date":
      return { ...base, type: FieldType.DATE };
    case "time":
    case "datetime":
      return { ...base, type: FieldType.TEXT };
    case "select":
    case "radio-group":
      return {
        ...base,
        type: FieldType.SELECT,
        options: control.options.map((o) => ({
          label: o.label,
          value: o.value,
        })),
      };
    case "checkbox":
      return { ...base, type: FieldType.CHECKBOX };
    case "derived":
      return { ...base, type: FieldType.CALCULATED, readOnly: true };
    case "temperature-humidity":
      return {
        ...base,
        type: FieldType.TEMPERATURE_HUMIDITY,
        defaultTemperature: control.defaultFahrenheit,
        defaultHumidity: control.defaultHumidity,
      };
    default:
      return base;
  }
}

function cellSlot(
  v1Section: SectionConfig,
  cell: CellV2,
  column: ColumnV2 | undefined,
  columnIndex: number,
  row: RuntimeRowV2,
  readOnly: boolean,
): ControlSlot {
  return {
    section: v1Section,
    // The data key, not the column id. See ColumnV2.fieldId.
    field: fieldShimFor(
      column?.fieldId ?? column?.id ?? cell.columnId,
      column?.label ?? "",
      cell.control,
      {
        readOnly: readOnly || undefined,
        cellBehavior:
          cell.kind === "static"
            ? "static"
            : cell.kind === "populated"
              ? "populate"
              : cell.kind === "calculated"
                ? "calculate"
                : undefined,
        staticValue: cell.text,
        calculation: cell.formula
          ? { formula: cell.formula, dependsOn: [] }
          : undefined,
      },
    ),
    stateKey: row.stateKey,
    placement: "table-cell",
    cell:
      row.dataIndex >= 0
        ? {
            rowIndex: row.dataIndex,
            colId: cell.columnId,
            colIndex: columnIndex,
            column: {
              id: cell.columnId,
              label: column?.label ?? "",
              width: column?.width,
              field: fieldShimFor(
                column?.fieldId ?? cell.columnId,
                column?.label ?? "",
                cell.control,
              ),
            },
          }
        : undefined,
    readOnly,
    controlV2: cell.control,
    cellV2: cell,
    rowInstanceId: row.rowInstanceId || undefined,
  };
}

// ---------------------------------------------------------------------------
// Units
// ---------------------------------------------------------------------------

const UnitSelector: React.FC<{
  units: UnitSpecV2;
  value: string;
  onChange?: (next: string) => void;
  label?: string;
}> = ({ units, value, onChange, label }) => (
  <label className="inline-flex items-center gap-1.5 text-xs text-neutral-700 dark:text-neutral-300">
    {label && <span className="font-medium">{label}</span>}
    <select
      value={value}
      disabled={!onChange}
      onChange={(e) => onChange?.(e.target.value)}
      className={`border ${BORDER} rounded bg-white dark:bg-dark-150 text-neutral-900 dark:text-white px-2 py-1 text-xs focus:ring-1 focus:ring-brand`}
    >
      {units.options.map((option) => (
        <option key={option} value={option}>
          {option}
        </option>
      ))}
    </select>
  </label>
);

// ---------------------------------------------------------------------------
// Table
// ---------------------------------------------------------------------------

interface TableProps {
  v1Section: SectionConfig;
  section: SectionBlockV2;
  table: TableV2;
  chrome: SectionChrome;
  scope: ConditionScope;
  density: Density;
  rowStyle: React.CSSProperties | undefined;
}

const TableRenderer: React.FC<TableProps> = ({
  v1Section,
  section,
  table,
  chrome,
  scope,
  density,
  rowStyle,
}) => {
  const readOnlyMode = chrome.mode !== "fill";

  // Conditional columns shrink the grid rather than leaving a gap.
  const visibleColumns = table.columns.filter((column) =>
    evaluateCondition(column.visibleWhen, scope),
  );
  const columnIndexById = new Map(
    visibleColumns.map((column, index) => [column.id, index]),
  );

  const headerRows =
    table.header.length > 0 ? table.header : [implicitHeaderRow(table.columns)];
  const visibleHeaderRows = headerRows.filter((row) =>
    evaluateCondition(row.visibleWhen, scope),
  );
  let headerGrid = resolveGrid(
    visibleHeaderRows.map((row) => ({
      id: row.id,
      cells: row.cells.filter((cell) =>
        evaluateCondition(cell.visibleWhen, scope),
      ),
    })),
    visibleColumns,
    { regionLabel: "header" },
  );

  // A declared header whose cells all anchor to columns that no longer exist
  // resolves to nothing, and the table would render with no header at all. Fall
  // back to the column labels: a template with a stale header is a problem to
  // fix in the builder, not a reason to show an unreadable table.
  const headerIsEmpty = headerGrid.rows.every((cells) => cells.length === 0);
  if (headerIsEmpty && visibleColumns.length > 0) {
    headerGrid = resolveGrid(
      [implicitHeaderRow(visibleColumns)],
      visibleColumns,
      { regionLabel: "header" },
    );
  }

  const runtimeRows = resolveTableRows(table, section.id, {
    instanceRows: chrome.instanceRowsFor?.(section.id),
    generatorCounts: chrome.generatorCountsFor?.(section.id),
  }).filter((row) => evaluateCondition(row.source.visibleWhen, scope));

  const dataRowCount = runtimeRows.filter((r) => r.dataIndex >= 0).length;
  const shown =
    chrome.maxBodyRows != null
      ? runtimeRows.slice(0, chrome.maxBodyRows)
      : runtimeRows;
  const info: SectionRowInfo = {
    rowCount: dataRowCount,
    shownRowCount: shown.filter((r) => r.dataIndex >= 0).length,
  };

  const gutter = chrome.rowGutter;
  const totalColumns = visibleColumns.length + (gutter ? 1 : 0);

  const tableUnits = table.units;
  const unitValue = (spec: UnitSpecV2, key: string): string =>
    (scope.values[section.id]?.[key] as string) ??
    spec.default ??
    spec.options[0] ??
    "";

  return (
    <>
      {tableUnits?.scope === "table" && (
        <div className="flex items-center gap-2 mb-2 print:hidden">
          <UnitSelector
            units={tableUnits}
            label="Units"
            value={unitValue(tableUnits, `__units_${table.id}`)}
            onChange={
              readOnlyMode || !chrome.setSettingValue
                ? undefined
                : (next) =>
                    chrome.setSettingValue?.(
                      v1Section,
                      `__units_${table.id}`,
                      next,
                    )
            }
          />
        </div>
      )}

      {(table.aboveFields ?? []).length > 0 && (
        <div className="flex flex-wrap items-end gap-4 gap-y-2 mb-3 pb-2 border-b border-neutral-200 dark:border-neutral-600">
          {table.aboveFields!.map((field) => {
            const state = resolveNodeState(field, scope);
            if (!state.visible) return null;
            return (
              <div key={field.id} className="flex flex-col gap-1 min-w-[120px]">
                <label className="text-xs font-medium text-neutral-700 dark:text-neutral-300">
                  {field.label}
                  {state.required && <span className="text-red-500 ml-1">*</span>}
                </label>
                {chrome.renderControl({
                  section: v1Section,
                  field: fieldShimFor(field.id, field.label, field.control, {
                    readOnly: state.readOnly || undefined,
                  }),
                  stateKey: section.id,
                  placement: "above-table",
                  readOnly: state.readOnly,
                  controlV2: field.control,
                })}
              </div>
            );
          })}
        </div>
      )}

      {chrome.renderSectionHeader?.(v1Section, info)}

      <div className="overflow-x-auto">
        <table
          className={`w-full table-fixed border-collapse border ${BORDER} ${density.table}`}
        >
          <colgroup>
            {gutter && <col style={{ width: "2rem" }} />}
            {visibleColumns.map((column) => (
              <col
                key={column.id}
                style={column.width ? { width: column.width } : undefined}
              />
            ))}
          </colgroup>

          {/* Multi-row header. `resolveGrid` has already worked out which cells
              start in each row, so a cell covered by a span from above is
              simply absent rather than rendered empty.
              Use native table display instead of a print utility class: legacy
              report CSS hides [class*="header"] on screen and in print. */}
          <thead style={table.print?.repeatHeader ? { display: "table-header-group" } : undefined}>
            {headerGrid.rows.map((cells, rowIndex) => (
              <tr key={visibleHeaderRows[rowIndex]?.id ?? rowIndex}>
                {gutter && rowIndex === 0 && (
                  <th
                    rowSpan={headerGrid.rows.length}
                    className={`border ${BORDER} px-1 py-1 bg-neutral-50 dark:bg-dark-200 text-center font-medium w-8 text-[10px] text-neutral-400`}
                  >
                    {gutter.header}
                  </th>
                )}
                {cells.map(({ cell, colSpan, rowSpan, columnIndex }) => (
                  <th
                    key={cell.id}
                    colSpan={colSpan > 1 ? colSpan : undefined}
                    rowSpan={rowSpan > 1 ? rowSpan : undefined}
                    className={`border ${BORDER} bg-neutral-50 dark:bg-dark-200 align-top ${density.th} ${ALIGN_CLASS[cell.align ?? "left"]}`}
                    style={
                      colSpan === 1 && visibleColumns[columnIndex]?.width
                        ? { width: visibleColumns[columnIndex].width }
                        : undefined
                    }
                  >
                    <div>{cell.label}</div>
                    {chrome.renderColumnHeaderExtra?.(
                      v1Section,
                      {
                        id: visibleColumns[columnIndex]?.id ?? cell.columnId,
                        label: cell.label,
                        width: visibleColumns[columnIndex]?.width,
                        field: fieldShimFor(cell.columnId, cell.label, undefined),
                      },
                      columnIndex,
                    )}
                    {visibleColumns[columnIndex]?.units?.scope === "column" && (
                      <div className="mt-1 print:hidden">
                        <UnitSelector
                          units={visibleColumns[columnIndex].units!}
                          value={unitValue(
                            visibleColumns[columnIndex].units!,
                            `__units_${visibleColumns[columnIndex].id}`,
                          )}
                          onChange={
                            readOnlyMode || !chrome.setSettingValue
                              ? undefined
                              : (next) =>
                                  chrome.setSettingValue?.(
                                    v1Section,
                                    `__units_${visibleColumns[columnIndex].id}`,
                                    next,
                                  )
                          }
                        />
                      </div>
                    )}
                  </th>
                ))}
              </tr>
            ))}
          </thead>

          <tbody>
            {shown.map((row) => (
              <BodyRow
                key={`${row.source.id}-${row.dataIndex}-${row.indexInGenerator ?? 0}`}
                v1Section={v1Section}
                section={section}
                table={table}
                row={row}
                chrome={chrome}
                scope={scope}
                density={density}
                rowStyle={rowStyle}
                visibleColumns={visibleColumns}
                columnIndexById={columnIndexById}
                totalColumns={totalColumns}
              />
            ))}
            {info.shownRowCount < info.rowCount &&
              chrome.renderRowOverflow?.(v1Section, info, totalColumns)}
          </tbody>

          {table.footer.length > 0 && (
            <tfoot>
              {table.footer
                .filter((footerRow) =>
                  evaluateCondition(footerRow.visibleWhen, scope),
                )
                .map((footerRow) => {
                  const grid = resolveGrid(
                    [
                      {
                        id: footerRow.id,
                        cells: footerRow.cells.filter((cell) =>
                          evaluateCondition(cell.visibleWhen, scope),
                        ),
                      },
                    ],
                    visibleColumns,
                    { regionLabel: "footer" },
                  );
                  return (
                    <tr key={footerRow.id} style={rowStyle}>
                      {gutter && <td className={`border ${BORDER}`} />}
                      {grid.rows[0]?.map((placed) => (
                        <FooterCell
                          key={placed.cell.id}
                          placed={placed}
                          v1Section={v1Section}
                          section={section}
                          chrome={chrome}
                          scope={scope}
                          density={density}
                          visibleColumns={visibleColumns}
                        />
                      ))}
                    </tr>
                  );
                })}
            </tfoot>
          )}
        </table>
      </div>

      {chrome.renderSectionFooter?.(v1Section, info)}
    </>
  );
};

// ---------------------------------------------------------------------------
// Body rows
// ---------------------------------------------------------------------------

const BodyRow: React.FC<{
  v1Section: SectionConfig;
  section: SectionBlockV2;
  table: TableV2;
  row: RuntimeRowV2;
  chrome: SectionChrome;
  scope: ConditionScope;
  density: Density;
  rowStyle: React.CSSProperties | undefined;
  visibleColumns: ColumnV2[];
  columnIndexById: Map<string, number>;
  totalColumns: number;
}> = ({
  v1Section,
  section,
  table,
  row,
  chrome,
  scope,
  density,
  rowStyle,
  visibleColumns,
  columnIndexById,
  totalColumns,
}) => {
  const gutter = chrome.rowGutter;
  const splitClass =
    table.print?.rowSplit === "allow" ? "" : "print:break-inside-avoid";

  // Decorative rows span the whole table and hold no data.
  if (row.kind === "divider") {
    return (
      <tr className={splitClass}>
        <td colSpan={totalColumns} className="p-0">
          <div className="h-px bg-neutral-300 dark:bg-neutral-600" />
        </td>
      </tr>
    );
  }

  if (row.kind === "note" || row.kind === "criteria" || row.kind === "label") {
    const source = row.source as Extract<typeof row.source, { text: string }>;
    const tone =
      row.kind === "criteria"
        ? "bg-amber-50 dark:bg-amber-900/20 text-amber-900 dark:text-amber-200"
        : row.kind === "label"
          ? "bg-neutral-50 dark:bg-dark-200 font-semibold"
          : "text-neutral-600 dark:text-neutral-400 italic";
    return (
      <tr className={splitClass}>
        <td
          colSpan={totalColumns}
          className={`border ${BORDER} ${density.td} text-sm ${tone} ${ALIGN_CLASS[source.align ?? "left"]}`}
        >
          {source.text}
        </td>
      </tr>
    );
  }

  // Data rows: records generate their cells from the columns, everything else
  // carries its own, which is how a subtotal row merges across columns.
  const policy =
    row.source.kind === "records" ? row.source.policy : undefined;
  const cells =
    row.cells ??
    recordCells(
      visibleColumns,
      row.generatorId ?? row.source.id,
      row.indexInGenerator ?? 0,
      {
        rowsPerRecord: policy?.rowsPerRecord,
        spanningColumns: policy?.spanningColumns,
        subRowIndex: row.subRowIndex,
      },
    );

  const rowScope: ConditionScope = {
    ...scope,
    currentRow:
      row.dataIndex >= 0
        ? { tableId: table.id, stateKey: row.stateKey, index: row.dataIndex }
        : undefined,
  };

  const visibleCells = cells.filter((cell) => {
    if (!columnIndexById.has(cell.columnId)) return false;
    return evaluateCondition(cell.visibleWhen, rowScope);
  });

  const grid = resolveGrid(
    [{ id: row.source.id, cells: visibleCells }],
    visibleColumns,
    { regionLabel: "body", allowHoles: true },
  );

  const emphasis =
    row.kind === "subtotal" || row.kind === "total"
      ? "font-semibold bg-neutral-50 dark:bg-dark-200"
      : "";

  return (
    <tr style={rowStyle} className={`${splitClass} ${emphasis}`}>
      {gutter && (
        <td
          className={`border ${BORDER} px-1 py-1 text-center text-[10px] text-neutral-400 bg-neutral-50 dark:bg-dark-200`}
        >
          {row.dataIndex >= 0 ? gutter.cell(row.dataIndex) : ""}
        </td>
      )}
      {grid.rows[0]?.map((placed) => (
        <BodyCell
          key={placed.cell.id}
          placed={placed}
          v1Section={v1Section}
          row={row}
          chrome={chrome}
          scope={rowScope}
          density={density}
          visibleColumns={visibleColumns}
        />
      ))}
    </tr>
  );
};

const BodyCell: React.FC<{
  placed: PlacedCell<CellV2>;
  v1Section: SectionConfig;
  row: RuntimeRowV2;
  chrome: SectionChrome;
  scope: ConditionScope;
  density: Density;
  visibleColumns: ColumnV2[];
}> = ({ placed, v1Section, row, chrome, scope, density, visibleColumns }) => {
  const { cell, colSpan, rowSpan, columnIndex } = placed;
  const column = visibleColumns[columnIndex];
  const state = resolveNodeState(cell, scope);
  const readOnly =
    state.readOnly ||
    chrome.mode === "readonly" ||
    chrome.mode === "print" ||
    cell.kind === "display" ||
    cell.kind === "static";

  const slot = cellSlot(v1Section, cell, column, columnIndex, row, readOnly);
  const adornment = chrome.renderCellAdornment?.(slot);

  const content =
    cell.kind === "empty" ? null : (
      <>
        {chrome.renderControl(slot)}
        {adornment}
      </>
    );

  return (
    <td
      colSpan={colSpan > 1 ? colSpan : undefined}
      rowSpan={rowSpan > 1 ? rowSpan : undefined}
      className={[
        `border ${BORDER}`,
        density.td,
        ALIGN_CLASS[cell.align ?? column?.align ?? "left"],
        EMPHASIS_CLASS[cell.emphasis ?? "none"],
        state.printable ? "" : "print:hidden",
      ]
        .filter(Boolean)
        .join(" ")}
      style={
        colSpan === 1 && column?.width ? { width: column.width } : undefined
      }
    >
      {adornment ? (
        <div className="flex items-center gap-1">{content}</div>
      ) : (
        content
      )}
    </td>
  );
};

const FooterCell: React.FC<{
  placed: PlacedCell<CellV2>;
  v1Section: SectionConfig;
  section: SectionBlockV2;
  chrome: SectionChrome;
  scope: ConditionScope;
  density: Density;
  visibleColumns: ColumnV2[];
}> = ({ placed, v1Section, section, chrome, scope, density, visibleColumns }) => {
  const { cell, colSpan, rowSpan, columnIndex } = placed;
  const column = visibleColumns[columnIndex];
  const pseudoRow: RuntimeRowV2 = {
    stateKey: section.id,
    rowInstanceId: "",
    dataIndex: -1,
    kind: "fixed",
    source: { id: cell.id, kind: "fixed", cells: [] } as any,
    cells: null,
  };
  return (
    <td
      colSpan={colSpan > 1 ? colSpan : undefined}
      rowSpan={rowSpan > 1 ? rowSpan : undefined}
      className={`border ${BORDER} ${density.td} bg-neutral-50 dark:bg-dark-200 font-semibold ${ALIGN_CLASS[cell.align ?? "left"]}`}
    >
      {cell.kind === "static" || cell.kind === "display" ? (
        cell.text
      ) : (
        chrome.renderControl(
          cellSlot(v1Section, cell, column, columnIndex, pseudoRow, true),
        )
      )}
    </td>
  );
};

// ---------------------------------------------------------------------------
// Settings bar
// ---------------------------------------------------------------------------

const SettingsBar: React.FC<{
  v1Section: SectionConfig;
  section: SectionBlockV2;
  chrome: SectionChrome;
  scope: ConditionScope;
}> = ({ v1Section, section, chrome, scope }) => {
  const settings = section.settings ?? [];
  if (settings.length === 0) return null;
  const compact = chrome.density === "compact";
  return (
    <div
      className={`flex flex-wrap items-center pb-2 mb-3 border-b border-neutral-200 dark:border-neutral-600 print:hidden ${
        compact ? "gap-3 text-xs" : "gap-4"
      }`}
    >
      {settings.map((setting) => {
        const current =
          (scope.values[section.id]?.[setting.id] as string) ??
          setting.defaultValue ??
          setting.options[0]?.value ??
          "";
        return (
          <div key={setting.id} className="flex items-center gap-2">
            <label
              className={`font-medium text-neutral-700 dark:text-neutral-300 whitespace-nowrap ${
                compact ? "text-xs" : "text-sm"
              }`}
            >
              {setting.label}
            </label>
            <select
              value={current}
              disabled={!chrome.setSettingValue}
              onChange={(e) =>
                chrome.setSettingValue?.(v1Section, setting.id, e.target.value)
              }
              className={`border ${BORDER} rounded bg-white dark:bg-dark-150 text-neutral-900 dark:text-white focus:ring-1 focus:ring-brand focus:border-brand ${
                compact ? "px-2 py-1 text-xs" : "px-3 py-1.5 text-sm"
              }`}
            >
              {setting.options.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        );
      })}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Fields, checklists and signatures
// ---------------------------------------------------------------------------

const FieldLabel: React.FC<{
  v1Section: SectionConfig;
  field: FieldV2;
  chrome: SectionChrome;
  density: Density;
  required: boolean;
}> = ({ v1Section, field, chrome, density, required }) => (
  <div className={density.label}>
    {field.label}
    {field.unit && (
      <span className="text-neutral-400 ml-1 normal-case">({field.unit})</span>
    )}
    {required && <span className="text-red-500 ml-1">*</span>}
    {chrome.renderFieldLabelExtra?.(
      v1Section,
      fieldShimFor(field.id, field.label, field.control, {
        readOnly: field.readOnly,
      }),
    )}
  </div>
);

// ---------------------------------------------------------------------------

export interface SectionBodyV2Props {
  /** The V1 shape the chrome callbacks are typed against. */
  v1Section: SectionConfig;
  section: SectionBlockV2;
  chrome: SectionChrome;
  scope: ConditionScope;
  wrapperStyle?: React.CSSProperties;
  rowStyle?: React.CSSProperties;
}

export const SectionBodyV2: React.FC<SectionBodyV2Props> = ({
  v1Section,
  section,
  chrome,
  scope,
  wrapperStyle,
  rowStyle,
}) => {
  const density = DENSITIES[chrome.density ?? "normal"];
  const content = section.content;

  const settingsBar = (
    <SettingsBar
      v1Section={v1Section}
      section={section}
      chrome={chrome}
      scope={scope}
    />
  );

  switch (content.kind) {
    case "table":
      return (
        <div style={wrapperStyle} className="w-full min-w-0">
          {settingsBar}
          <TableRenderer
            v1Section={v1Section}
            section={section}
            table={content.table}
            chrome={chrome}
            scope={scope}
            density={density}
            rowStyle={rowStyle}
          />
        </div>
      );

    case "fields": {
      const visible = content.fields.filter(
        (field) => resolveNodeState(field, scope).visible,
      );
      const gridRows = packGroupedFieldGrid(
        visible.map((f) => ({ ...f, id: f.id })),
        content.columns,
      );
      const colWidth = `${100 / content.columns}%`;
      const info: SectionRowInfo = {
        rowCount: gridRows.length,
        shownRowCount: gridRows.length,
      };
      return (
        <div className="overflow-x-auto" style={wrapperStyle}>
          {settingsBar}
          <table
            className={`min-w-full border-collapse border ${BORDER} job-details-table ${density.table}`}
            style={{ tableLayout: "fixed", width: "100%" }}
          >
            <colgroup>
              {Array.from({ length: content.columns }).map((_, i) => (
                <col key={i} style={{ width: colWidth }} />
              ))}
            </colgroup>
            <tbody>
              {gridRows.map((gridRow, rowIdx) => (
                <tr key={rowIdx} style={rowStyle}>
                  {gridRow.map((slot, slotIdx) => {
                    if (slot.type === "empty") {
                      return (
                        <td
                          key={`empty-${slotIdx}`}
                          className={`border ${BORDER} px-3 py-2`}
                        />
                      );
                    }
                    const field = slot.field as unknown as FieldV2;
                    const state = resolveNodeState(field, scope);
                    return (
                      <td
                        key={field.id}
                        colSpan={slot.colSpan > 1 ? slot.colSpan : undefined}
                        rowSpan={slot.rowSpan > 1 ? slot.rowSpan : undefined}
                        className={[
                          `border ${BORDER} px-3 py-2 align-top`,
                          state.printable ? "" : "print:hidden",
                        ]
                          .filter(Boolean)
                          .join(" ")}
                      >
                        <FieldLabel
                          v1Section={v1Section}
                          field={field}
                          chrome={chrome}
                          density={density}
                          required={state.required}
                        />
                        {chrome.renderControl({
                          section: v1Section,
                          field: fieldShimFor(
                            field.id,
                            field.label,
                            field.control,
                            {
                              readOnly: state.readOnly || undefined,
                              required: state.required,
                              defaultValue: field.defaultValue,
                              unit: field.unit,
                            },
                          ),
                          stateKey: section.id,
                          placement: "grouped",
                          readOnly: state.readOnly,
                          controlV2: field.control,
                        })}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
          {chrome.renderSectionFooter?.(v1Section, info)}
        </div>
      );
    }

    case "field": {
      const field = content.field;
      const state = resolveNodeState(field, scope);
      if (!state.visible) return null;
      return (
        <div className="overflow-x-auto" style={wrapperStyle}>
          {settingsBar}
          <table
            className={`min-w-full border-collapse border ${BORDER} ${density.table}`}
          >
            <tbody>
              <tr style={rowStyle}>
                <td className={`border ${BORDER} px-3 py-2`}>
                  <FieldLabel
                    v1Section={v1Section}
                    field={field}
                    chrome={chrome}
                    density={density}
                    required={state.required}
                  />
                  {chrome.renderControl({
                    section: v1Section,
                    field: fieldShimFor(field.id, field.label, field.control, {
                      readOnly: state.readOnly || undefined,
                      defaultValue: field.defaultValue,
                    }),
                    stateKey: section.id,
                    placement: "single",
                    readOnly: state.readOnly,
                    controlV2: field.control,
                  })}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      );
    }

    case "checklist": {
      const items = content.items.filter(
        (item) => resolveNodeState(item, scope).visible,
      );
      const shown =
        chrome.maxBodyRows != null ? items.slice(0, chrome.maxBodyRows) : items;
      const info: SectionRowInfo = {
        rowCount: items.length,
        shownRowCount: shown.length,
      };
      return (
        <div className="overflow-x-auto" style={wrapperStyle}>
          {settingsBar}
          <table
            className={`min-w-full border-collapse border ${BORDER} ${density.table}`}
          >
            <thead>
              <tr>
                {["NETA Section", "Description", "Result"].map((label) => (
                  <th
                    key={label}
                    className={`border ${BORDER} bg-neutral-50 dark:bg-dark-200 ${density.th}`}
                  >
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {shown.map((item) => (
                <tr key={item.id} style={rowStyle}>
                  <td className={`border ${BORDER} px-3 py-2 text-sm`}>
                    {item.netaSection || "-"}
                  </td>
                  <td className={`border ${BORDER} px-3 py-2 text-sm`}>
                    {item.description}
                  </td>
                  <td className={`border ${BORDER} ${density.td}`}>
                    {chrome.renderControl({
                      section: v1Section,
                      field: {
                        id: item.id,
                        label: "Result",
                        type: FieldType.SELECT,
                        options: item.options.map((o) => ({
                          label: o.label,
                          value: o.value,
                        })),
                      },
                      stateKey: section.id,
                      placement: "checklist-result",
                      controlV2: {
                        type: "select",
                        options: item.options,
                        allowBlank: true,
                      },
                    })}
                  </td>
                </tr>
              ))}
              {info.shownRowCount < info.rowCount &&
                chrome.renderRowOverflow?.(v1Section, info, 3)}
            </tbody>
          </table>
          {chrome.renderSectionFooter?.(v1Section, info)}
        </div>
      );
    }

    case "signatures":
      return (
        <div style={wrapperStyle} className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {content.roles.map((role) => (
            <div key={role.id}>
              <div className={density.label}>
                {role.label}
                {role.required && <span className="text-red-500 ml-1">*</span>}
              </div>
              {chrome.renderControl({
                section: v1Section,
                field: fieldShimFor(role.id, role.label, undefined),
                stateKey: section.id,
                placement: "signature",
                controlV2: {
                  type: "signature",
                  roleId: role.id,
                  roleLabel: role.label,
                },
              })}
            </div>
          ))}
        </div>
      );

    default:
      return null;
  }
};
