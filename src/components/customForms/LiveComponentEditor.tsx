/**
 * Live Component Editor
 *
 * Edits a component in place, the way it will look on the form:
 * - Tables: click a header to rename it, click a column to change its data
 *   type / cell behavior, type static text straight into cells, and drag the
 *   line between two headers to resize those columns.
 * - Grouped fields: click a field to change it, drag its right edge to make
 *   it span more or fewer grid columns.
 * - Checklists: edit NETA section and description on each line.
 *
 * Anything this view doesn't cover stays in the full settings modal.
 */

import React, { useRef, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Minus,
  Plus,
  Trash2,
} from "lucide-react";
import {
  ComponentType,
  FieldType,
  type ColumnConfig,
  type FieldConfig,
  type SectionConfig,
} from "@/lib/types/customForms";
import { resolveRowCount } from "@/lib/customForms/runtime/layout";
import { SectionContent } from "./FormPreview";
import { InlineOptionsEditor, inlineInputCls } from "./SectionEditor";

type Behavior = NonNullable<FieldConfig["cellBehavior"]>;

const FIELD_TYPES: { value: FieldType; label: string }[] = [
  { value: FieldType.TEXT, label: "Text" },
  { value: FieldType.NUMBER, label: "Number" },
  { value: FieldType.DATE, label: "Date" },
  { value: FieldType.SELECT, label: "Dropdown" },
  { value: FieldType.RADIO, label: "Radio buttons" },
  { value: FieldType.TEXTAREA, label: "Text Area" },
  { value: FieldType.CHECKBOX, label: "Checkbox" },
];

const LAYOUTS: { value: NonNullable<SectionConfig["layout"]>; cols: number }[] = [
  { value: "single-column", cols: 1 },
  { value: "two-column", cols: 2 },
  { value: "three-column", cols: 3 },
  { value: "four-column", cols: 4 },
  { value: "five-column", cols: 5 },
];

/** Grid width of a grouped-field component (mirrors the filler). */
function gridColumnsFor(section: SectionConfig): number {
  if (section.componentType === ComponentType.JOB_INFO) return 5;
  return LAYOUTS.find((l) => l.value === section.layout)?.cols ?? 1;
}

/** Move an item one place left/right in a list. */
function shift<T>(list: T[], index: number, delta: -1 | 1): T[] {
  const to = index + delta;
  if (to < 0 || to >= list.length) return list;
  const next = [...list];
  [next[index], next[to]] = [next[to], next[index]];
  return next;
}

/** Start a pointer drag; `onMove` gets the horizontal distance moved. */
function trackDrag(e: React.PointerEvent, onMove: (dx: number) => void) {
  e.preventDefault();
  e.stopPropagation();
  const startX = e.clientX;
  const move = (ev: PointerEvent) => onMove(ev.clientX - startX);
  const up = () => {
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", up);
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
  };
  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", up);
  document.body.style.cursor = "col-resize";
  document.body.style.userSelect = "none";
}

/** What an empty input of this type looks like, shown muted in the cell. */
const MockControl: React.FC<{ field: FieldConfig }> = ({ field }) => {
  const muted = "text-[11px] text-neutral-400 dark:text-neutral-500 truncate";
  switch (field.type) {
    case FieldType.NUMBER:
      return <span className={muted}>123{field.unit ? ` ${field.unit}` : ""}</span>;
    case FieldType.DATE:
      return <span className={muted}>mm/dd/yyyy</span>;
    case FieldType.SELECT:
      return (
        <span className={muted}>
          ▾ {field.options?.[0]?.label ?? "Dropdown"}
        </span>
      );
    case FieldType.RADIO:
      return (
        <span className={muted}>
          {(field.options?.length ? field.options : [{ label: "Option" }])
            .slice(0, 3)
            .map((o) => `○ ${o.label}`)
            .join("  ")}
        </span>
      );
    case FieldType.CHECKBOX:
      return <span className={muted}>☐</span>;
    case FieldType.TEXTAREA:
      return <span className={muted}>Long text…</span>;
    default:
      return <span className={muted}>Text{field.unit ? ` (${field.unit})` : ""}</span>;
  }
};

/** Floating bar of settings for whatever is selected. */
const Toolbar: React.FC<{ title: string; children: React.ReactNode }> = ({
  title,
  children,
}) => (
  <div className="sticky top-0 z-20 mb-2 flex flex-wrap items-center gap-2 border border-brand bg-white dark:bg-dark-150 px-2 py-1.5 rounded-none shadow-sm">
    <span className="text-xs font-semibold text-brand truncate max-w-[12rem]">
      {title}
    </span>
    {children}
  </div>
);

const iconBtn =
  "p-1 rounded-none text-neutral-500 hover:text-neutral-900 dark:hover:text-white hover:bg-neutral-100 dark:hover:bg-dark-100 disabled:opacity-30";

/** Type / options / unit / required controls shared by columns and fields. */
const FieldTypeControls: React.FC<{
  field: FieldConfig;
  onChange: (patch: Partial<FieldConfig>) => void;
}> = ({ field, onChange }) => (
  <>
    <select
      value={field.type}
      onChange={(e) => {
        const type = e.target.value as FieldType;
        const patch: Partial<FieldConfig> = { type };
        if (
          (type === FieldType.SELECT || type === FieldType.RADIO) &&
          !field.options?.length
        ) {
          patch.options = [{ label: "Option 1", value: "Option 1" }];
        }
        onChange(patch);
      }}
      title="Data type"
      className={`${inlineInputCls} w-32`}
    >
      {FIELD_TYPES.map((t) => (
        <option key={t.value} value={t.value}>
          {t.label}
        </option>
      ))}
    </select>
    <input
      value={field.unit ?? ""}
      onChange={(e) => onChange({ unit: e.target.value || undefined })}
      placeholder="Unit"
      title="Unit (e.g. kV, A, Ω)"
      className={`${inlineInputCls} w-16`}
    />
    <label className="flex items-center gap-1 text-xs text-neutral-700 dark:text-neutral-300 cursor-pointer">
      <input
        type="checkbox"
        checked={!!field.required}
        onChange={(e) => onChange({ required: e.target.checked })}
        className="rounded-none"
      />
      Required
    </label>
    {(field.type === FieldType.SELECT || field.type === FieldType.RADIO) && (
      <div className="basis-full">
        <InlineOptionsEditor
          options={field.options || []}
          onChange={(options) => onChange({ options })}
          onAdd={() => {
            const n = (field.options?.length ?? 0) + 1;
            onChange({
              options: [
                ...(field.options || []),
                { label: `Option ${n}`, value: `Option ${n}` },
              ],
            });
          }}
        />
      </div>
    )}
  </>
);

// ---------------------------------------------------------------------------
// Tables
// ---------------------------------------------------------------------------

const LiveTable: React.FC<{
  section: SectionConfig;
  onUpdate: (u: Partial<SectionConfig>) => void;
}> = ({ section, onUpdate }) => {
  const cols = section.columns ?? [];
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const headerRefs = useRef<Record<string, HTMLTableCellElement | null>>({});

  const conditional = !!section.conditionalRows?.length;
  const rowCount = conditional
    ? section.conditionalRows!.length
    : resolveRowCount(section);

  const selIndex = cols.findIndex((c) => c.id === selectedId);
  const selected = selIndex >= 0 ? cols[selIndex] : null;

  const setColumns = (columns: ColumnConfig[]) => onUpdate({ columns });
  const updateColumn = (i: number, patch: Partial<ColumnConfig>) =>
    setColumns(cols.map((c, k) => (k === i ? { ...c, ...patch } : c)));
  const updateField = (i: number, patch: Partial<FieldConfig>) =>
    updateColumn(i, { field: { ...cols[i].field, ...patch } });

  const setBehavior = (i: number, next: Behavior) =>
    updateField(i, {
      cellBehavior: next,
      ...(next === "user" && {
        populateFrom: undefined,
        calculation: undefined,
        readOnly: undefined,
      }),
      ...(next === "calculate" && { populateFrom: undefined, readOnly: true }),
      ...(next === "static" && {
        populateFrom: undefined,
        calculation: undefined,
        readOnly: true,
      }),
    });

  const setStaticCell = (row: number, colId: string, value: string) => {
    const key = `row${row}_${colId}`;
    const next = { ...(section.staticCells ?? {}) };
    if (value === "") delete next[key];
    else next[key] = value;
    onUpdate({ staticCells: next });
  };

  const addColumn = () => {
    const id = `col-${Date.now()}`;
    const label = `Column ${cols.length + 1}`;
    const allPercent = cols.length > 0 && cols.every((c) => c.width?.endsWith("%"));
    // Make room for the new column so percentages still add up to 100.
    const scale = cols.length / (cols.length + 1);
    const resized = allPercent
      ? cols.map((c) => ({
          ...c,
          width: `${(parseFloat(c.width!) * scale).toFixed(1)}%`,
        }))
      : cols;
    setColumns([
      ...resized,
      {
        id,
        label,
        width: allPercent ? `${(100 / (cols.length + 1)).toFixed(1)}%` : undefined,
        field: { id, label, type: FieldType.TEXT },
      },
    ]);
    setSelectedId(id);
  };

  /** Drag the line between column i and i+1; their combined width stays the same. */
  const startResize = (i: number, e: React.PointerEvent) => {
    const widths = cols.map(
      (c) => headerRefs.current[c.id]?.getBoundingClientRect().width ?? 100,
    );
    const total = widths.reduce((a, b) => a + b, 0) || 1;
    const pair = widths[i] + widths[i + 1];
    const MIN = 32;
    trackDrag(e, (dx) => {
      const left = Math.min(pair - MIN, Math.max(MIN, widths[i] + dx));
      const next = [...widths];
      next[i] = left;
      next[i + 1] = pair - left;
      setColumns(
        cols.map((c, k) => ({
          ...c,
          width: `${((next[k] / total) * 100).toFixed(1)}%`,
        })),
      );
    });
  };

  const setRows = (n: number) => {
    if (conditional) {
      const current = section.conditionalRows!;
      onUpdate({
        conditionalRows:
          n > current.length
            ? [...current, { id: `row-${Date.now()}`, label: `Row ${n}` }]
            : current.slice(0, Math.max(1, n)),
      });
    } else {
      onUpdate({ rows: Math.max(1, n) });
    }
  };

  const behavior: Behavior = selected?.field.cellBehavior ?? "user";

  return (
    <div>
      {selected ? (
        <Toolbar title={selected.label || "Column"}>
          <select
            value={behavior}
            onChange={(e) => setBehavior(selIndex, e.target.value as Behavior)}
            title="What goes in this column's cells"
            className={`${inlineInputCls} w-40`}
          >
            <option value="user">User entry</option>
            <option value="static">Static text</option>
            <option value="calculate">Calculated</option>
            <option value="populate" disabled={behavior !== "populate"}>
              Copied from field (all settings)
            </option>
          </select>
          {behavior === "user" && (
            <FieldTypeControls
              field={selected.field}
              onChange={(patch) => updateField(selIndex, patch)}
            />
          )}
          {behavior === "static" && (
            <input
              value={selected.field.staticValue ?? ""}
              onChange={(e) => updateField(selIndex, { staticValue: e.target.value })}
              placeholder="Text for every row (or type in each cell)"
              className={`${inlineInputCls} w-64`}
            />
          )}
          {behavior === "calculate" && (
            <input
              value={selected.field.calculation?.formula ?? ""}
              onChange={(e) =>
                updateField(selIndex, {
                  calculation: {
                    formula: e.target.value,
                    dependsOn: selected.field.calculation?.dependsOn ?? [],
                  },
                })
              }
              placeholder="Formula, e.g. {IR.C1} * 2"
              className={`${inlineInputCls} w-64 font-mono`}
            />
          )}
          <div className="ml-auto flex items-center gap-0.5">
            <button
              type="button"
              className={iconBtn}
              disabled={selIndex === 0}
              onClick={() => setColumns(shift(cols, selIndex, -1))}
              title="Move left"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              type="button"
              className={iconBtn}
              disabled={selIndex === cols.length - 1}
              onClick={() => setColumns(shift(cols, selIndex, 1))}
              title="Move right"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
            <button
              type="button"
              className={`${iconBtn} hover:text-red-600`}
              onClick={() => {
                setColumns(cols.filter((_, k) => k !== selIndex));
                setSelectedId(null);
              }}
              title="Delete column"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </Toolbar>
      ) : (
        <p className="mb-2 text-xs text-neutral-500 dark:text-neutral-400">
          Click a column to change it. Drag the line between two headers to resize.
          Static cells can be typed into directly.
        </p>
      )}

      <div className="overflow-x-auto">
        <table className="w-full table-fixed border-collapse text-xs">
          <thead>
            <tr>
              {conditional && (
                <th className="w-28 border border-neutral-300 dark:border-neutral-600 bg-neutral-100 dark:bg-dark-200 px-2 py-1.5 text-left font-medium text-neutral-500">
                  Row
                </th>
              )}
              {cols.map((col, i) => (
                <th
                  key={col.id}
                  ref={(el) => {
                    headerRefs.current[col.id] = el;
                  }}
                  style={col.width ? { width: col.width } : undefined}
                  onClick={() => setSelectedId(col.id)}
                  className={`relative border border-neutral-300 dark:border-neutral-600 bg-neutral-100 dark:bg-dark-200 p-0 ${
                    col.id === selectedId ? "outline outline-2 -outline-offset-2 outline-brand" : ""
                  }`}
                >
                  <input
                    value={col.label}
                    onChange={(e) => updateColumn(i, { label: e.target.value })}
                    onFocus={() => setSelectedId(col.id)}
                    className="w-full bg-transparent px-2 py-1.5 text-center text-xs font-semibold text-neutral-900 dark:text-white focus:outline-none"
                  />
                  {i < cols.length - 1 && (
                    <div
                      onPointerDown={(e) => startResize(i, e)}
                      onClick={(e) => e.stopPropagation()}
                      className="absolute top-0 -right-1.5 z-10 h-full w-3 cursor-col-resize hover:bg-brand/40"
                      title="Drag to resize"
                    />
                  )}
                </th>
              ))}
              <th className="w-9 border border-dashed border-neutral-300 dark:border-neutral-600 p-0">
                <button
                  type="button"
                  onClick={addColumn}
                  className="w-full h-full py-1.5 flex justify-center text-brand hover:bg-brand/10"
                  title="Add column"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </th>
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: rowCount }).map((_, r) => (
              <tr key={r}>
                {conditional && (
                  <td className="border border-neutral-300 dark:border-neutral-600 p-0">
                    <input
                      value={section.conditionalRows![r].label}
                      onChange={(e) =>
                        onUpdate({
                          conditionalRows: section.conditionalRows!.map((row, k) =>
                            k === r ? { ...row, label: e.target.value } : row,
                          ),
                        })
                      }
                      className="w-full bg-transparent px-2 py-1 text-xs text-neutral-700 dark:text-neutral-200 focus:outline-none"
                    />
                  </td>
                )}
                {cols.map((col) => {
                  const b = col.field.cellBehavior ?? "user";
                  const isSel = col.id === selectedId;
                  return (
                    <td
                      key={col.id}
                      onClick={() => setSelectedId(col.id)}
                      className={`border border-neutral-300 dark:border-neutral-600 h-7 cursor-pointer ${
                        isSel ? "bg-brand/5" : "hover:bg-neutral-50 dark:hover:bg-dark-100"
                      } ${b === "static" ? "p-0" : "px-2 py-1"}`}
                    >
                      {b === "static" ? (
                        <input
                          value={section.staticCells?.[`row${r}_${col.id}`] ?? ""}
                          onChange={(e) => setStaticCell(r, col.id, e.target.value)}
                          onFocus={() => setSelectedId(col.id)}
                          placeholder={col.field.staticValue || "Static text"}
                          className="w-full h-7 bg-transparent px-2 text-xs text-neutral-900 dark:text-white placeholder:text-neutral-500 focus:outline-none"
                        />
                      ) : b === "calculate" ? (
                        <span className="block truncate font-mono text-[11px] text-amber-600 dark:text-amber-400">
                          = {col.field.calculation?.formula || "formula"}
                        </span>
                      ) : b === "populate" ? (
                        <span className="text-[11px] text-blue-500">(copied)</span>
                      ) : (
                        <MockControl field={col.field} />
                      )}
                    </td>
                  );
                })}
                <td />
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-2 flex items-center gap-1 text-xs text-neutral-600 dark:text-neutral-300">
        Rows:
        <button
          type="button"
          className={iconBtn}
          onClick={() => setRows(rowCount - 1)}
          disabled={rowCount <= 1}
          title="Remove last row"
        >
          <Minus className="w-3.5 h-3.5" />
        </button>
        <span className="w-6 text-center font-medium">{rowCount}</span>
        <button
          type="button"
          className={iconBtn}
          onClick={() => setRows(rowCount + 1)}
          title="Add row"
        >
          <Plus className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Grouped fields
// ---------------------------------------------------------------------------

const LiveFields: React.FC<{
  section: SectionConfig;
  onUpdate: (u: Partial<SectionConfig>) => void;
}> = ({ section, onUpdate }) => {
  const fields = section.fields ?? [];
  const n = gridColumnsFor(section);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const gridRef = useRef<HTMLDivElement>(null);

  const selIndex = fields.findIndex((f) => f.id === selectedId);
  const selected = selIndex >= 0 ? fields[selIndex] : null;

  const setFields = (next: FieldConfig[]) => onUpdate({ fields: next });
  const updateField = (i: number, patch: Partial<FieldConfig>) =>
    setFields(fields.map((f, k) => (k === i ? { ...f, ...patch } : f)));

  /** Drag a field's right edge; it snaps to whole grid columns. */
  const startSpanDrag = (i: number, e: React.PointerEvent) => {
    const cell = (gridRef.current?.getBoundingClientRect().width ?? 600) / n;
    const start = Math.min(fields[i].colSpan ?? 1, n);
    let last = start;
    trackDrag(e, (dx) => {
      const span = Math.min(n, Math.max(1, Math.round(start + dx / cell)));
      if (span !== last) {
        last = span;
        updateField(i, { colSpan: span });
      }
    });
  };

  return (
    <div>
      {selected ? (
        <Toolbar title={selected.label || "Field"}>
          <FieldTypeControls
            field={selected}
            onChange={(patch) => updateField(selIndex, patch)}
          />
          <div className="ml-auto flex items-center gap-0.5">
            <button
              type="button"
              className={iconBtn}
              disabled={selIndex === 0}
              onClick={() => setFields(shift(fields, selIndex, -1))}
              title="Move earlier"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              type="button"
              className={iconBtn}
              disabled={selIndex === fields.length - 1}
              onClick={() => setFields(shift(fields, selIndex, 1))}
              title="Move later"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
            <button
              type="button"
              className={`${iconBtn} hover:text-red-600`}
              onClick={() => {
                setFields(fields.filter((_, k) => k !== selIndex));
                setSelectedId(null);
              }}
              title="Delete field"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </Toolbar>
      ) : (
        <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-neutral-500 dark:text-neutral-400">
          <span>Click a field to change it. Drag its right edge to widen it.</span>
          {section.componentType !== ComponentType.JOB_INFO && (
            <label className="ml-auto flex items-center gap-1">
              Columns
              <select
                value={section.layout ?? "single-column"}
                onChange={(e) =>
                  onUpdate({ layout: e.target.value as SectionConfig["layout"] })
                }
                className={`${inlineInputCls} w-16`}
              >
                {LAYOUTS.map((l) => (
                  <option key={l.value} value={l.value}>
                    {l.cols}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
      )}

      <div
        ref={gridRef}
        className="grid gap-2"
        style={{ gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))` }}
      >
        {fields.map((field, i) => (
          <div
            key={field.id}
            onClick={() => setSelectedId(field.id)}
            style={{
              gridColumn: `span ${Math.min(field.colSpan ?? 1, n)}`,
              gridRow: `span ${field.rowSpan ?? 1}`,
            }}
            className={`relative border px-2 py-1 cursor-pointer rounded-none ${
              field.id === selectedId
                ? "border-brand ring-1 ring-brand"
                : "border-neutral-300 dark:border-neutral-600 hover:border-brand/60"
            }`}
          >
            <input
              value={field.label}
              onChange={(e) => updateField(i, { label: e.target.value })}
              onFocus={() => setSelectedId(field.id)}
              className="w-full bg-transparent text-[11px] font-medium text-neutral-700 dark:text-neutral-200 focus:outline-none"
            />
            <div className="h-5 flex items-center border-b border-neutral-200 dark:border-neutral-700">
              <MockControl field={field} />
            </div>
            {n > 1 && (
              <div
                onPointerDown={(e) => startSpanDrag(i, e)}
                onClick={(e) => e.stopPropagation()}
                className="absolute top-0 -right-1.5 z-10 h-full w-3 cursor-col-resize hover:bg-brand/40"
                title="Drag to change width"
              />
            )}
          </div>
        ))}
        <button
          type="button"
          onClick={() => {
            const id = `field-${Date.now()}`;
            setFields([
              ...fields,
              { id, label: `Field ${fields.length + 1}`, type: FieldType.TEXT },
            ]);
            setSelectedId(id);
          }}
          className="border border-dashed border-neutral-300 dark:border-neutral-600 py-2 flex items-center justify-center gap-1 text-xs text-brand hover:bg-brand/10 rounded-none"
        >
          <Plus className="w-3.5 h-3.5" />
          Add field
        </button>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Checklists
// ---------------------------------------------------------------------------

const LiveChecklist: React.FC<{
  section: SectionConfig;
  onUpdate: (u: Partial<SectionConfig>) => void;
}> = ({ section, onUpdate }) => {
  const items = section.checklistItems ?? [];
  const setItems = (next: typeof items) => onUpdate({ checklistItems: next });
  const cell = "border border-neutral-300 dark:border-neutral-600 p-0";
  const input =
    "w-full bg-transparent px-2 py-1 text-xs text-neutral-900 dark:text-white focus:outline-none focus:bg-brand/5";

  return (
    <table className="w-full table-fixed border-collapse text-xs">
      <thead>
        <tr className="bg-neutral-100 dark:bg-dark-200 text-neutral-600 dark:text-neutral-300">
          <th className="w-32 border border-neutral-300 dark:border-neutral-600 px-2 py-1.5 text-left">
            NETA Section
          </th>
          <th className="border border-neutral-300 dark:border-neutral-600 px-2 py-1.5 text-left">
            Description
          </th>
          <th className="w-36 border border-neutral-300 dark:border-neutral-600 px-2 py-1.5 text-left">
            Result
          </th>
          <th className="w-9 border border-neutral-300 dark:border-neutral-600" />
        </tr>
      </thead>
      <tbody>
        {items.map((item, i) => (
          <tr key={item.id}>
            <td className={cell}>
              <input
                value={item.netaSection ?? ""}
                onChange={(e) =>
                  setItems(items.map((it, k) => (k === i ? { ...it, netaSection: e.target.value } : it)))
                }
                placeholder="7.x.x"
                className={input}
              />
            </td>
            <td className={cell}>
              <input
                value={item.description}
                onChange={(e) =>
                  setItems(items.map((it, k) => (k === i ? { ...it, description: e.target.value } : it)))
                }
                placeholder="Description"
                title={item.description}
                className={input}
              />
            </td>
            <td className="border border-neutral-300 dark:border-neutral-600 px-2 py-1 text-[11px] text-neutral-400 truncate">
              ▾ {item.resultOptions?.[0] ?? "Result"}
            </td>
            <td className="border border-neutral-300 dark:border-neutral-600 text-center">
              <button
                type="button"
                className={`${iconBtn} hover:text-red-600`}
                onClick={() => setItems(items.filter((_, k) => k !== i))}
                title="Delete item"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </td>
          </tr>
        ))}
        <tr>
          <td colSpan={4} className="border border-dashed border-neutral-300 dark:border-neutral-600 p-0">
            <button
              type="button"
              onClick={() =>
                setItems([
                  ...items,
                  {
                    id: `item-${Date.now()}`,
                    netaSection: "",
                    description: "",
                    resultOptions: items[0]?.resultOptions ?? [],
                  },
                ])
              }
              className="w-full py-1.5 flex items-center justify-center gap-1 text-xs text-brand hover:bg-brand/10"
            >
              <Plus className="w-3.5 h-3.5" />
              Add item
            </button>
          </td>
        </tr>
      </tbody>
    </table>
  );
};

// ---------------------------------------------------------------------------

export const LiveComponentEditor: React.FC<{
  section: SectionConfig;
  onUpdate: (updates: Partial<SectionConfig>) => void;
}> = ({ section, onUpdate }) => {
  // Merged-cell (V2) tables have a layout this view can't edit safely.
  const live = !section.v2 && !!(section.columns || section.fields || section.checklistItems);

  return (
    <div className="space-y-4">
      <input
        value={section.title}
        onChange={(e) => onUpdate({ title: e.target.value })}
        placeholder="Section title"
        className="w-full bg-transparent border-b border-neutral-200 dark:border-neutral-600 pb-1 text-sm font-semibold text-neutral-800 dark:text-neutral-100 focus:outline-none focus:border-brand"
      />
      {!live && (
        <>
          <p className="text-xs text-neutral-500 dark:text-neutral-400">
            This component can't be edited in place. Use All settings above.
          </p>
          <SectionContent section={section} />
        </>
      )}
      {live && section.fields && (
        <LiveFields section={section} onUpdate={onUpdate} />
      )}
      {live && section.columns && (
        <LiveTable section={section} onUpdate={onUpdate} />
      )}
      {live && section.checklistItems && (
        <LiveChecklist section={section} onUpdate={onUpdate} />
      )}
    </div>
  );
};

export default LiveComponentEditor;
