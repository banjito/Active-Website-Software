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
import {
  contactResistanceRowLabels,
  fitChecklistWidths,
  groupedFieldColumnCount,
  resolveRowCount,
} from "@/lib/customForms/runtime/layout";
import { ChecklistWidthInput } from "./ChecklistWidthInput";
import { InlineOptionsEditor, inlineInputCls } from "./SectionEditor";
import { TableGridEditor } from "./TableGridEditor";
import {
  pieceColumnIds,
  pieceFlex,
  resolveTableLayout,
} from "@/lib/customForms/tableLayout";
import { refAttrs } from "./FormulaRefHover";
import { ResultRuleEditor, DEFAULT_RESULT_RULE } from "./ResultRuleEditor";
import { EquipmentPickerSettings } from "./EquipmentPickerSettings";
import { AssetSourceSelect } from "./AssetSourceSelect";
import { ChartSettings } from "./ChartSettings";
import { SectionContent } from "./FormPreview";
import {
  combineAsFoundAsLeft,
  pairForColumn,
  splitAsFoundAsLeft,
} from "@/lib/customForms/asFoundAsLeft";
import { resultRuleField } from "@/lib/customForms/resultRules";
import { hasCombinedTemperatureField, splitTemperatureHumidity } from "@/lib/customForms/temperatureFields";
import { useLookupTables } from "@/lib/customForms/lookupLibrary";
import { resolveDeviation } from "./runtime/SectionBody";

type Behavior = NonNullable<FieldConfig["cellBehavior"]>;

const FIELD_TYPES: { value: FieldType; label: string }[] = [
  { value: FieldType.TEXT, label: "Text" },
  { value: FieldType.NUMBER, label: "Number" },
  { value: FieldType.DATE, label: "Date" },
  { value: FieldType.SELECT, label: "Dropdown" },
  { value: FieldType.RADIO, label: "Radio buttons" },
  { value: FieldType.TEXTAREA, label: "Text Area" },
  { value: FieldType.CHECKBOX, label: "Checkbox" },
  { value: FieldType.CALCULATED, label: "Calculated" },
  { value: FieldType.TEMPERATURE, label: "Temperature (°F with °C)" },
  { value: FieldType.TEMPERATURE_HUMIDITY, label: "Temp / Humidity (combined)" },
  { value: FieldType.SIGNATURE, label: "Signature" },
  { value: FieldType.PHOTO, label: "Photos" },
];

const LAYOUTS: { value: NonNullable<SectionConfig["layout"]>; cols: number }[] = [
  { value: "single-column", cols: 1 },
  { value: "two-column", cols: 2 },
  { value: "three-column", cols: 3 },
  { value: "four-column", cols: 4 },
  { value: "five-column", cols: 5 },
  { value: "six-column", cols: 6 },
];

/** Grid width of a grouped-field component (mirrors the filler). */
function gridColumnsFor(section: SectionConfig): number {
  return groupedFieldColumnCount(section);
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

/**
 * "Insert lookup…": adds lookup("table", {?}) to a formula, so nobody has to
 * remember table ids. {?} is then replaced with the cell holding the key.
 */
const LookupInsert: React.FC<{ onInsert: (text: string) => void }> = ({ onInsert }) => {
  const { tables } = useLookupTables();
  if (!tables.length) return null;
  return (
    <select
      value=""
      onChange={(e) => {
        if (!e.target.value) return;
        const [id, column] = e.target.value.split("|");
        onInsert(`lookup("${id}", {?}${column ? `, "${column}"` : ""})`);
      }}
      title="Insert a lookup from a shared table (Custom Forms → Lookup tables)"
      className={`${inlineInputCls} w-36`}
    >
      <option value="">Insert lookup…</option>
      {tables.map((t) => (
        <optgroup key={t.id} label={`${t.name}${t.engineeringVerified ? "" : " (unverified)"}`}>
          <option value={t.id}>{t.valueLabel || "Value"}</option>
          {(t.columns ?? []).map((c) => (
            <option key={c} value={`${t.id}|${c}`}>
              {c}
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  );
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
    {field.type !== FieldType.TEMPERATURE_HUMIDITY && (
      <AssetSourceSelect value={field.assetSource} onChange={(assetSource) => onChange({ assetSource })} />
    )}
    <label
      className="flex items-center gap-1 text-xs text-neutral-700 dark:text-neutral-300 cursor-pointer"
      title="Shown but not editable on the form"
    >
      <input
        type="checkbox"
        checked={!!field.readOnly}
        onChange={(e) => onChange({ readOnly: e.target.checked || undefined })}
        className="rounded-none"
      />
      Read-only
    </label>
    {field.type !== FieldType.TEMPERATURE_HUMIDITY && field.type !== FieldType.CHECKBOX && (
      <>
        <input
          value={field.placeholder ?? ""}
          onChange={(e) => onChange({ placeholder: e.target.value || undefined })}
          placeholder="Placeholder"
          title="Hint shown in the empty field"
          className={`${inlineInputCls} w-28`}
        />
        <input
          value={field.defaultValue ?? ""}
          onChange={(e) => onChange({ defaultValue: e.target.value || undefined })}
          placeholder="Default value"
          title="Value the field starts with on a new form"
          className={`${inlineInputCls} w-28`}
        />
      </>
    )}
    {(field.calculation || field.type === FieldType.CALCULATED) && (
      <input
        value={field.calculation?.formula ?? ""}
        onChange={(e) =>
          onChange({
            calculation: {
              formula: e.target.value,
              dependsOn: field.calculation?.dependsOn ?? [],
            },
          })
        }
        placeholder="Formula, e.g. (fahrenheit - 32) * 5 / 9"
        title="Calculated from other fields in this section (use their ids)"
        className={`${inlineInputCls} w-64 font-mono`}
      />
    )}
    {(field.calculation || field.type === FieldType.CALCULATED) && (
      <LookupInsert
        onInsert={(text) => {
          const current = field.calculation?.formula ?? "";
          onChange({
            calculation: {
              formula: current ? `${current} ${text}` : text,
              dependsOn: field.calculation?.dependsOn ?? [],
            },
          });
        }}
      />
    )}
    {field.type === FieldType.TEMPERATURE_HUMIDITY && (
      <div className="basis-full flex flex-wrap items-center gap-1.5 text-[10px] text-neutral-500">
        Labels:
        {(
          [
            ["fahrenheit", "°F"],
            ["celsius", "°C"],
            ["tcf", "TCF"],
            ["humidity", "Humidity %"],
          ] as const
        ).map(([key, fallback]) => (
          <input
            key={key}
            value={field.subLabels?.[key] ?? ""}
            onChange={(e) =>
              onChange({
                subLabels: { ...(field.subLabels ?? {}), [key]: e.target.value || undefined },
              })
            }
            placeholder={fallback}
            title={`Label for ${fallback}`}
            className={`${inlineInputCls} w-20`}
          />
        ))}
        Defaults:
        <input
          type="number"
          value={field.defaultTemperature ?? ""}
          onChange={(e) =>
            onChange({ defaultTemperature: e.target.value === "" ? undefined : Number(e.target.value) })
          }
          placeholder="68 °F"
          title="Default temperature (°F)"
          className={`${inlineInputCls} w-16`}
        />
        <input
          type="number"
          value={field.defaultHumidity ?? ""}
          onChange={(e) =>
            onChange({ defaultHumidity: e.target.value === "" ? undefined : Number(e.target.value) })
          }
          placeholder="50 %"
          title="Default humidity (%)"
          className={`${inlineInputCls} w-16`}
        />
      </div>
    )}
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
  /** One piece of a split table: only these columns. Edits still apply to the whole table. */
  visibleColumnIds?: string[];
  /** The first piece carries row labels, the row count and "add column". */
  primary?: boolean;
}> = ({ section, onUpdate, visibleColumnIds, primary = true }) => {
  const cols = section.columns ?? [];
  // Clicking the selected column again unselects it. Read on mousedown, since
  // the header input's focus re-selects the column before the click lands.
  const wasSelected = useRef(false);
  const toggleProps = (id: string) => ({
    onMouseDown: () => {
      wasSelected.current = selectedIdRef.current === id;
    },
    onClick: () => setSelectedId(wasSelected.current ? null : id),
  });
  const shownCols = visibleColumnIds
    ? cols.filter((c) => visibleColumnIds.includes(c.id))
    : cols;
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selectedIdRef = useRef(selectedId);
  selectedIdRef.current = selectedId;
  const headerRefs = useRef<Record<string, HTMLTableCellElement | null>>({});

  const conditional = !!section.conditionalRows?.length;
  // Contact resistance numbers its rows "Section 1, Section 2…"; editable here.
  const labelled = !conditional && section.componentType === ComponentType.CONTACT_RESISTANCE;
  const rowLabels = labelled ? contactResistanceRowLabels(section) : [];
  const setRowLabel = (r: number, label: string) => {
    const next = [...rowLabels];
    while (next.length <= r) next.push("");
    next[r] = label;
    onUpdate({ defaultRowLabels: next });
  };
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

  const setBehavior = (i: number, next: Behavior | "result") => {
    if (next === "result") {
      updateColumn(i, { field: resultRuleField(cols[i].field, cols[i].field.resultRule ?? DEFAULT_RESULT_RULE) });
      return;
    }
    updateField(i, {
      resultRule: undefined,
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
  };

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

  /**
   * Drag the line between shown column i and i+1; their combined width stays
   * the same. In a split piece only the shown columns change, keeping the share
   * of the table they had, so other pieces are unaffected.
   */
  const startResize = (i: number, e: React.PointerEvent) => {
    const widths = shownCols.map(
      (c) => headerRefs.current[c.id]?.getBoundingClientRect().width ?? 100,
    );
    const total = widths.reduce((a, b) => a + b, 0) || 1;
    const allPercent = shownCols.every((c) => c.width?.endsWith("%"));
    const share =
      visibleColumnIds && allPercent
        ? shownCols.reduce((sum, c) => sum + parseFloat(c.width!), 0)
        : 100;
    const pair = widths[i] + widths[i + 1];
    const MIN = 32;
    trackDrag(e, (dx) => {
      const left = Math.min(pair - MIN, Math.max(MIN, widths[i] + dx));
      const next = [...widths];
      next[i] = left;
      next[i + 1] = pair - left;
      const widthOf = new Map(
        shownCols.map((c, k) => [c.id, `${((next[k] / total) * share).toFixed(1)}%`]),
      );
      setColumns(cols.map((c) => (widthOf.has(c.id) ? { ...c, width: widthOf.get(c.id) } : c)));
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
  const isResult = !!selected?.field.resultRule;

  return (
    <div>
      {selected ? (
        <Toolbar title={selected.label || "Column"}>
          <select
            value={isResult ? "result" : behavior}
            onChange={(e) => setBehavior(selIndex, e.target.value as Behavior | "result")}
            title="What goes in this column's cells"
            className={`${inlineInputCls} w-40`}
          >
            <option value="user">User entry</option>
            <option value="static">Static text</option>
            <option value="calculate">Calculated</option>
            <option value="result">Pass / Fail result</option>
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
          {behavior === "user" && !isResult && selected.field.type === FieldType.NUMBER && (
            <label
              className="flex items-center gap-1 text-[11px] text-neutral-500 dark:text-neutral-400"
              title="Which column says what unit these readings are in. Auto: a unit typed with the number, a unit chooser, this column's own unit, then the row's Units column."
            >
              Unit from
              <select
                value={selected.field.unitSource?.column ?? ""}
                onChange={(e) =>
                  updateField(selIndex, {
                    unitSource: e.target.value ? { column: e.target.value } : undefined,
                  })
                }
                className={`${inlineInputCls} w-28`}
              >
                <option value="">Auto</option>
                {cols
                  .filter((c) => c.id !== selected.id)
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.label || c.id}
                    </option>
                  ))}
              </select>
            </label>
          )}
          {behavior === "user" && !isResult && (
            <div className="basis-full">
              <EquipmentPickerSettings
                section={section}
                columnId={selected.id}
                field={selected.field}
                onChange={(field) => updateColumn(selIndex, { field })}
              />
            </div>
          )}
          {behavior === "static" && (
            <input
              value={selected.field.staticValue ?? ""}
              onChange={(e) => updateField(selIndex, { staticValue: e.target.value })}
              placeholder="Text for every row (or type in each cell)"
              className={`${inlineInputCls} w-64`}
            />
          )}
          {isResult && (
            <div className="basis-full">
              <ResultRuleEditor
                section={section}
                columnId={selected.id}
                rule={selected.field.resultRule!}
                onChange={(rule) => updateColumn(selIndex, { field: resultRuleField(selected.field, rule) })}
              />
            </div>
          )}
          {behavior === "calculate" && !isResult && (
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
              placeholder="Formula, e.g. {IR.C1 in MΩ} * 2"
              title='Add "in UNIT" to a reference to convert it, e.g. {IR.C1 in MΩ}'
              className={`${inlineInputCls} w-64 font-mono`}
            />
          )}
          {behavior === "calculate" && !isResult && (
            <LookupInsert
              onInsert={(text) => {
                const current = selected.field.calculation?.formula ?? "";
                updateField(selIndex, {
                  calculation: {
                    formula: current ? `${current} ${text}` : text,
                    dependsOn: selected.field.calculation?.dependsOn ?? [],
                  },
                });
              }}
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
            {pairForColumn(section, selected.id) ? (
              <button
                type="button"
                className="h-7 px-2 text-[11px] border border-neutral-300 dark:border-neutral-600 rounded-none text-neutral-700 dark:text-neutral-200 hover:border-brand hover:text-brand"
                onClick={() => {
                  const pair = pairForColumn(section, selected.id)!;
                  onUpdate(combineAsFoundAsLeft(section, selected.id));
                  setSelectedId(pair.foundId);
                }}
                title="Back to one column (the As Left column and its readings are removed)"
              >
                Combine As Found / As Left
              </button>
            ) : (
              <button
                type="button"
                className="h-7 px-2 text-[11px] border border-neutral-300 dark:border-neutral-600 rounded-none text-neutral-700 dark:text-neutral-200 hover:border-brand hover:text-brand"
                onClick={() => onUpdate(splitAsFoundAsLeft(section, selected.id))}
                title="Make this an As Found column with an As Left column beside it, under one heading"
              >
                Split As Found / As Left
              </button>
            )}
            <button
              type="button"
              className={`${iconBtn} hover:text-red-600`}
              onClick={() => {
                const pair = pairForColumn(section, selected.id);
                // Deleting half of a pair forgets the pairing too.
                if (pair) {
                  const pairs = (section.asFoundAsLeft?.pairs ?? []).filter((p) => p !== pair);
                  onUpdate({
                    columns: cols.filter((_, k) => k !== selIndex),
                    asFoundAsLeft: pairs.length ? { pairs } : undefined,
                  });
                } else {
                  setColumns(cols.filter((_, k) => k !== selIndex));
                }
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
              {primary && (conditional || labelled) && (
                <th className="w-28 border border-neutral-300 dark:border-neutral-600 bg-neutral-100 dark:bg-dark-200 px-2 py-1.5 text-left font-medium text-neutral-500">
                  {labelled ? "Row label" : "Row"}
                </th>
              )}
              {shownCols.map((col, vi) => {
                const i = cols.indexOf(col);
                return (
                <th
                  key={col.id}
                  ref={(el) => {
                    headerRefs.current[col.id] = el;
                  }}
                  style={col.width ? { width: col.width } : undefined}
                  {...toggleProps(col.id)}
                  {...refAttrs(section.id, { columnId: col.id })}
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
                  {vi < shownCols.length - 1 && (
                    <div
                      onPointerDown={(e) => startResize(vi, e)}
                      onClick={(e) => e.stopPropagation()}
                      className="absolute top-0 -right-1.5 z-10 h-full w-3 cursor-col-resize hover:bg-brand/40"
                      title="Drag to resize"
                    />
                  )}
                </th>
                );
              })}
              {primary && (
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
              )}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: rowCount }).map((_, r) => (
              <tr key={r}>
                {primary && conditional && (
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
                {primary && labelled && (
                  <td className="border border-neutral-300 dark:border-neutral-600 p-0">
                    <input
                      value={rowLabels[r] ?? ""}
                      onChange={(e) => setRowLabel(r, e.target.value)}
                      placeholder={`Row ${r + 1}`}
                      className="w-full bg-transparent px-2 py-1 text-xs text-neutral-700 dark:text-neutral-200 focus:outline-none"
                    />
                  </td>
                )}
                {shownCols.map((col) => {
                  const b = col.field.cellBehavior ?? "user";
                  const isSel = col.id === selectedId;
                  return (
                    <td
                      key={col.id}
                      {...toggleProps(col.id)}
                      {...refAttrs(section.id, { columnId: col.id, rowIndex: r })}
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
                      ) : col.field.resultRule ? (
                        <span className="text-[11px] font-bold">
                          <span className="text-green-700">PASS</span>
                          <span className="text-neutral-400"> / </span>
                          <span className="text-red-700">FAIL</span>
                        </span>
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
                {primary && <td />}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {primary && (
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
      )}
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
  const fieldWasSelected = useRef(false);
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
          {(
            <label className="ml-auto flex items-center gap-1">
              Columns
              <select
                value={section.layout ?? (section.componentType === ComponentType.JOB_INFO ? "five-column" : "single-column")}
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
            onMouseDown={() => {
              fieldWasSelected.current = selectedId === field.id;
            }}
            onClick={() => setSelectedId(fieldWasSelected.current ? null : field.id)}
            {...refAttrs(section.id, { fieldId: field.id })}
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
  const headers = section.checklistHeaders ?? {};
  const setHeader = (key: "section" | "description" | "result", value: string) =>
    onUpdate({ checklistHeaders: { ...headers, [key]: value || undefined } });
  const widths = section.checklistColumnWidths ?? {};
  const setWidth = (key: "section" | "description" | "result", value: string) =>
    onUpdate({ checklistColumnWidths: { ...widths, [key]: value || undefined } });
  const [sectionWidth, descriptionWidth, resultWidth] = fitChecklistWidths(widths);
  const headInput =
    "w-full bg-transparent px-2 py-1.5 text-xs font-semibold text-neutral-700 dark:text-neutral-200 focus:outline-none focus:bg-brand/5";
  // Which item's result choices are open for editing ("all" = every item).
  const [editingResults, setEditingResults] = useState<string | null>(null);
  const toOptions = (list: string[] = []) => list.map((v) => ({ label: v, value: v }));
  const fromOptions = (list: { label: string }[]) => list.map((o) => o.label);
  const resultsTarget =
    editingResults === "all" ? items[0] : items.find((it) => it.id === editingResults);
  const setResults = (next: string[]) =>
    setItems(
      items.map((it) =>
        editingResults === "all" || it.id === editingResults ? { ...it, resultOptions: next } : it,
      ),
    );

  return (
    <div>
    {editingResults && resultsTarget ? (
      <Toolbar
        title={
          editingResults === "all"
            ? "Result choices · all items"
            : `Result choices · ${resultsTarget.netaSection || resultsTarget.description || "item"}`
        }
      >
        <InlineOptionsEditor
          options={toOptions(resultsTarget.resultOptions)}
          onChange={(next) => setResults(fromOptions(next))}
          onAdd={() =>
            setResults([
              ...(resultsTarget.resultOptions ?? []),
              `Option ${(resultsTarget.resultOptions?.length ?? 0) + 1}`,
            ])
          }
        />
        <button
          type="button"
          className="ml-auto text-xs text-neutral-500 hover:text-brand"
          onClick={() => setEditingResults(null)}
        >
          Done
        </button>
      </Toolbar>
    ) : (
      <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-neutral-500 dark:text-neutral-400">
        <span>Click a heading to rename it, set column widths under the headings, or click a Result cell to change that item's choices.</span>
        {items.length > 0 && (
          <button
            type="button"
            className="ml-auto text-brand hover:underline"
            onClick={() => setEditingResults("all")}
            title="Set the same result choices on every item"
          >
            Edit result choices for all items
          </button>
        )}
      </div>
    )}
    <table className="w-full table-fixed border-collapse text-xs">
      <thead>
        <tr className="bg-neutral-100 dark:bg-dark-200 text-neutral-600 dark:text-neutral-300">
          <th
            style={sectionWidth ? { width: sectionWidth } : undefined}
            className="w-32 border border-neutral-300 dark:border-neutral-600 p-0"
          >
            <input
              value={headers.section ?? ""}
              onChange={(e) => setHeader("section", e.target.value)}
              placeholder="NETA Section"
              className={headInput}
            />
          </th>
          <th
            style={descriptionWidth ? { width: descriptionWidth } : undefined}
            className="border border-neutral-300 dark:border-neutral-600 p-0"
          >
            <input
              value={headers.description ?? ""}
              onChange={(e) => setHeader("description", e.target.value)}
              placeholder="Description"
              className={headInput}
            />
          </th>
          <th
            style={resultWidth ? { width: resultWidth } : undefined}
            className="w-36 border border-neutral-300 dark:border-neutral-600 p-0"
          >
            <input
              value={headers.result ?? ""}
              onChange={(e) => setHeader("result", e.target.value)}
              placeholder="Result"
              className={headInput}
            />
          </th>
          <th className="w-9 border border-neutral-300 dark:border-neutral-600" />
        </tr>
        <tr>
          {(["section", "description", "result"] as const).map((key) => (
            <th key={key} className={`${cell} font-normal`}>
              <ChecklistWidthInput
                value={widths[key]}
                onChange={(next) => setWidth(key, next)}
                className={input}
              />
            </th>
          ))}
          <th className={cell} />
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
            <td
              onClick={() => setEditingResults(item.id)}
              className={`border border-neutral-300 dark:border-neutral-600 px-2 py-1 text-[11px] text-neutral-400 truncate cursor-pointer hover:bg-brand/5 ${
                editingResults === item.id ? "outline outline-2 -outline-offset-2 outline-brand" : ""
              }`}
              title={(item.resultOptions ?? []).join(", ") || "No choices yet"}
            >
              ▾ {item.resultOptions?.[0] ?? "Result"}
              <span className="ml-1 text-neutral-300">({item.resultOptions?.length ?? 0})</span>
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
    </div>
  );
};

// ---------------------------------------------------------------------------
// Contact resistance: Value Deviation tables
// ---------------------------------------------------------------------------

const LiveDeviation: React.FC<{
  section: SectionConfig;
  onUpdate: (u: Partial<SectionConfig>) => void;
  /** Draw only this table (where the table layout puts it). */
  part?: "phase" | "lines" | "combined";
  /** Only the switch and the choices; the tables are drawn by the layout. */
  settingsOnly?: boolean;
}> = ({ section, onUpdate, part, settingsOnly = false }) => {
  const dev = resolveDeviation(section);
  const own = section.deviation ?? {};
  const set = (patch: Partial<NonNullable<SectionConfig["deviation"]>>) =>
    onUpdate({ deviation: { ...own, ...patch } });
  const toOptions = (list: string[]) => list.map((v) => ({ label: v, value: v }));
  const fromOptions = (list: { label: string }[]) => list.map((o) => o.label);
  const optionsRow = (
    label: string,
    list: string[],
    onChange: (next: string[]) => void,
  ) => (
    <div className="flex flex-wrap items-center gap-2">
      <span className="w-28 shrink-0 text-[11px] font-medium text-neutral-600 dark:text-neutral-300">
        {label}
      </span>
      <InlineOptionsEditor
        options={toOptions(list)}
        onChange={(next) => onChange(fromOptions(next))}
        onAdd={() => onChange([...list, `Option ${list.length + 1}`])}
      />
    </div>
  );
  const head = "border border-neutral-300 dark:border-neutral-600 bg-neutral-100 dark:bg-dark-200 p-0";
  const headInput =
    "w-full bg-transparent px-2 py-1.5 text-xs font-semibold text-neutral-700 dark:text-neutral-200 focus:outline-none focus:bg-brand/5";
  const cellInput =
    "w-full bg-transparent px-2 py-1 text-xs text-neutral-800 dark:text-neutral-100 focus:outline-none focus:bg-brand/5";

  const headings = (
    <tr>
      {(["label", "criteria", "results"] as const).map((key) => (
        <th key={key} className={head}>
          <input
            value={dev.headers[key] ?? ""}
            onChange={(e) => set({ headers: { ...(own.headers ?? {}), [key]: e.target.value } })}
            className={headInput}
          />
        </th>
      ))}
    </tr>
  );

  const phaseTable = (
            <table className="w-full table-fixed border-collapse text-xs">
              <thead>{headings}</thead>
              <tbody>
                <tr>
                  <td className="border border-neutral-300 dark:border-neutral-600 p-0">
                    <input
                      value={dev.phaseLabel}
                      onChange={(e) => set({ phaseLabel: e.target.value })}
                      title="Shown on every row (one per table row above)"
                      className={cellInput}
                    />
                  </td>
                  <td className="border border-neutral-300 dark:border-neutral-600 px-2 py-1 text-[11px] text-neutral-400">
                    ▾ {dev.phaseCriteriaDefault}
                  </td>
                  <td className="border border-neutral-300 dark:border-neutral-600 px-2 py-1 text-[11px] text-neutral-400">
                    ▾ {dev.phaseResultDefault}
                  </td>
                </tr>
              </tbody>
            </table>
  );
  const linesTable = (withHead: boolean) => (
            <table className="w-full table-fixed border-collapse text-xs">
              {withHead && <thead>{headings}</thead>}
              <tbody>
                {dev.extraRows.map((row, i) => (
                  <tr key={row.id}>
                    <td className="border border-neutral-300 dark:border-neutral-600 p-0">
                      <div className="flex items-center">
                        <input
                          value={row.label}
                          onChange={(e) =>
                            set({
                              extraRows: dev.extraRows.map((r, k) =>
                                k === i ? { ...r, label: e.target.value } : r,
                              ),
                            })
                          }
                          className={cellInput}
                        />
                        <button
                          type="button"
                          className={`${iconBtn} hover:text-red-600`}
                          onClick={() => set({ extraRows: dev.extraRows.filter((_, k) => k !== i) })}
                          title="Remove line"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    </td>
                    <td className="border border-neutral-300 dark:border-neutral-600 px-2 py-1 text-[11px] text-neutral-400">
                      ▾ {dev.extraDefault}
                    </td>
                    <td className="border border-neutral-300 dark:border-neutral-600 px-2 py-1 text-[11px] text-neutral-400">
                      ▾ {dev.extraDefault}
                    </td>
                  </tr>
                ))}
                <tr>
                  <td colSpan={3} className="border border-dashed border-neutral-300 dark:border-neutral-600 p-0">
                    <button
                      type="button"
                      onClick={() =>
                        set({
                          extraRows: [
                            ...dev.extraRows,
                            { id: `line${Date.now().toString(36)}`, label: "New line: N/A" },
                          ],
                        })
                      }
                      className="w-full py-1 flex items-center justify-center gap-1 text-xs text-brand hover:bg-brand/10"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      Add line
                    </button>
                  </td>
                </tr>
              </tbody>
            </table>
  );

  // Placed by the table layout: just that table (or both, merged).
  if (part) {
    if (section.showDeviation === false) return null;
    if (part === "phase") return phaseTable;
    if (part === "lines") return linesTable(true);
    return (
      <div className="[&>table+table]:-mt-px">
        {phaseTable}
        {linesTable(false)}
      </div>
    );
  }

  return (
    <div className="space-y-3 border-t border-dashed border-neutral-300 dark:border-neutral-600 pt-3">
      <label className="flex items-center gap-2 text-xs font-medium text-neutral-700 dark:text-neutral-200">
        <input
          type="checkbox"
          checked={section.showDeviation !== false}
          onChange={(e) => onUpdate({ showDeviation: e.target.checked })}
          className="rounded-none"
        />
        Show the Value Deviation tables
      </label>
      {section.showDeviation !== false && (
        <>
          {!settingsOnly && (
            <div className="grid gap-4 md:grid-cols-2 items-start">
              {phaseTable}
              {linesTable(true)}
            </div>
          )}
          <div className="space-y-1.5">
            {optionsRow("Per-row criteria", dev.phaseCriteriaOptions, (v) => set({ phaseCriteriaOptions: v }))}
            {optionsRow("Per-row results", dev.phaseResultOptions, (v) => set({ phaseResultOptions: v }))}
            {optionsRow("Line criteria", dev.extraCriteriaOptions, (v) => set({ extraCriteriaOptions: v }))}
            {optionsRow("Line results", dev.extraResultOptions, (v) => set({ extraResultOptions: v }))}
            <div className="flex flex-wrap items-center gap-2 text-[11px] text-neutral-600 dark:text-neutral-300">
              <span className="w-28 shrink-0 font-medium">Starting values</span>
              per-row criteria
              <select
                value={dev.phaseCriteriaDefault}
                onChange={(e) => set({ phaseCriteriaDefault: e.target.value })}
                className={`${inlineInputCls} w-24`}
              >
                {dev.phaseCriteriaOptions.map((o) => (
                  <option key={o}>{o}</option>
                ))}
              </select>
              per-row result
              <select
                value={dev.phaseResultDefault}
                onChange={(e) => set({ phaseResultDefault: e.target.value })}
                className={`${inlineInputCls} w-24`}
              >
                {dev.phaseResultOptions.map((o) => (
                  <option key={o}>{o}</option>
                ))}
              </select>
              lines
              <input
                value={dev.extraDefault}
                onChange={(e) => set({ extraDefault: e.target.value })}
                className={`${inlineInputCls} w-20`}
              />
            </div>
          </div>
        </>
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Single field (Comments, Custom Text, ...)
// ---------------------------------------------------------------------------

const LiveSingleField: React.FC<{
  section: SectionConfig;
  onUpdate: (u: Partial<SectionConfig>) => void;
}> = ({ section, onUpdate }) => {
  const field = section.field!;
  const update = (patch: Partial<FieldConfig>) => onUpdate({ field: { ...field, ...patch } });
  return (
    <div className="space-y-2">
      <Toolbar title="Field">
        <input
          value={field.label}
          onChange={(e) => update({ label: e.target.value })}
          placeholder="Field label"
          className={`${inlineInputCls} w-48 font-medium`}
        />
        <FieldTypeControls field={field} onChange={update} />
      </Toolbar>
      <div
        className="border border-neutral-300 dark:border-neutral-600 px-2 py-1"
        {...refAttrs(section.id, { fieldId: field.id })}
      >
        <div className="text-[11px] font-medium text-neutral-700 dark:text-neutral-200">{field.label}</div>
        <div className={`${field.type === FieldType.TEXTAREA ? "h-16" : "h-5"} flex items-start border-b border-neutral-200 dark:border-neutral-700`}>
          <span className="text-[11px] text-neutral-400 truncate">
            {field.placeholder || field.defaultValue || ""}
          </span>
        </div>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------

export const LiveComponentEditor: React.FC<{
  section: SectionConfig;
  onUpdate: (updates: Partial<SectionConfig>) => void;
}> = ({ section, onUpdate }) => {
  // Merged-cell (V2) tables get the grid editor instead of the simple table.
  const isV2 = !!section.v2;
  // A custom table layout: the editor shows the tables arranged the same way.
  const layout = section.tableLayout && section.columns ? resolveTableLayout(section) : null;
  const firstColumnsPiece = layout?.rows.flat().find((p) => p.kind === "columns")?.id;

  return (
    <div className="space-y-4">
      <input
        value={section.title}
        onChange={(e) => onUpdate({ title: e.target.value })}
        placeholder="Section title"
        className="w-full bg-transparent border-b border-neutral-200 dark:border-neutral-600 pb-1 text-sm font-semibold text-neutral-800 dark:text-neutral-100 focus:outline-none focus:border-brand"
      />
      {section.chart && (
        <>
          <ChartSettings section={section} allSections={[section]} onUpdate={onUpdate} />
          <SectionContent section={section} />
        </>
      )}
      {hasCombinedTemperatureField(section.fields) && (
        <div className="flex flex-wrap items-center gap-2 px-3 py-2 text-xs border border-brand/40 bg-brand/5">
          <span className="text-neutral-700 dark:text-neutral-200">
            Temperature and humidity share one box here. The newer layout shows them separately:
            Temp as "87°F (31°C)" and Humidity as "21%".
          </span>
          <button
            type="button"
            onClick={() => onUpdate({ fields: splitTemperatureHumidity(section.fields!) })}
            className="ml-auto h-7 px-2 text-xs text-white bg-brand hover:bg-brand-dark rounded-none"
          >
            Use separate Temp and Humidity
          </button>
        </div>
      )}
      {section.fields && <LiveFields section={section} onUpdate={onUpdate} />}
      {section.field && <LiveSingleField section={section} onUpdate={onUpdate} />}
      {section.columns &&
        (isV2 ? (
          <TableGridEditor section={section} onUpdate={onUpdate} allSections={[section]} />
        ) : layout ? (
          // Same arrangement as the form: pieces in rows, side by side.
          <div className="space-y-4">
            {layout.rows.map((row, r) => (
              <div key={r} className="flex flex-wrap items-start gap-4">
                {row.map((piece) => (
                  <div key={piece.id} style={pieceFlex(piece)}>
                    {piece.kind === "columns" ? (
                      <LiveTable
                        section={section}
                        onUpdate={onUpdate}
                        visibleColumnIds={pieceColumnIds(section, piece)}
                        primary={piece.id === firstColumnsPiece}
                      />
                    ) : (
                      <LiveDeviation
                        section={section}
                        onUpdate={onUpdate}
                        part={
                          piece.kind === "deviation-phase"
                            ? "phase"
                            : piece.kind === "deviation-lines"
                              ? "lines"
                              : "combined"
                        }
                      />
                    )}
                  </div>
                ))}
              </div>
            ))}
          </div>
        ) : (
          <LiveTable section={section} onUpdate={onUpdate} />
        ))}
      {section.componentType === ComponentType.CONTACT_RESISTANCE && (
        <LiveDeviation section={section} onUpdate={onUpdate} settingsOnly={!!layout} />
      )}
      {section.checklistItems && <LiveChecklist section={section} onUpdate={onUpdate} />}
    </div>
  );
};

export default LiveComponentEditor;
