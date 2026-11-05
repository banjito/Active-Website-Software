/**
 * The interactive control renderer.
 *
 * Used wherever a custom form is actually filled in: the job filler and the
 * template preview page. It owns cell resolution (populate, calculate, static)
 * and the temperature/humidity composite, so a field that is read-only in one
 * of those modes is read-only in the other.
 */

import React from "react";
import type { FieldConfig, SectionConfig } from "@/lib/types/customForms";
import { cellKey, type ControlSlot } from "@/lib/customForms/runtime";
import { getCellValue } from "@/lib/customForms/formCellResolution";
import { phaseDeviation } from "@/lib/customForms/deviation";
import { resultTone, type ResultTone } from "@/lib/customForms/resultRules";
import { SignatureField } from "./SignatureField";
import { PhotoField } from "./PhotoField";

/** The builder's own field for a slot (the renderer passes a V2 shim). */
function v1FieldOf(section: SectionConfig, fieldId: string): FieldConfig | undefined {
  return (
    section.fields?.find((f) => f.id === fieldId) ??
    (section.field?.id === fieldId ? section.field : undefined) ??
    section.columns?.find((c) => c.field.id === fieldId)?.field
  );
}

const TONE_STYLE: Record<ResultTone, React.CSSProperties> = {
  pass: { color: "#15803d", background: "#f0fdf4", borderColor: "#86efac" },
  fail: { color: "#b91c1c", background: "#fef2f2", borderColor: "#fca5a5" },
  limited: { color: "#b45309", background: "#fffbeb", borderColor: "#fcd34d" },
};

/**
 * A calculated PASS / FAIL / LIMITED SERVICE, shown as a coloured tag on
 * screen and on paper (print-color-adjust keeps the colours when printing).
 */
const ResultBadge: React.FC<{ value: string; tone: ResultTone }> = ({ value, tone }) => (
  <span
    className="cf-result inline-block px-1.5 py-0.5 text-xs font-bold border rounded-none whitespace-nowrap"
    style={{ ...TONE_STYLE[tone], WebkitPrintColorAdjust: "exact", printColorAdjust: "exact" } as React.CSSProperties}
    data-result={tone}
  >
    {value}
  </span>
);

export const CONTROL_CLASSES =
  "w-full min-w-0 px-2 py-1.5 text-sm border border-neutral-200 dark:border-neutral-600 rounded bg-white dark:bg-dark-100 text-neutral-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-brand focus:border-brand";
export const READ_ONLY_CONTROL_CLASSES =
  "w-full min-w-0 px-2 py-1.5 text-sm border border-neutral-200 dark:border-neutral-600 rounded bg-neutral-50 dark:bg-dark-200 text-neutral-700 dark:text-neutral-300";

export interface InteractiveControlOptions {
  formData: Record<string, any>;
  sections: SectionConfig[];
  onFieldChange: (stateKey: string, fieldId: string, value: any) => void;
  /** Force every control read-only, for a saved instance shown without editing. */
  readOnly?: boolean;
}

/** The resolved value and read-only state for one slot. */
export function resolveSlotValue(
  slot: ControlSlot,
  { formData, sections }: Pick<InteractiveControlOptions, "formData" | "sections">,
): { value: any; readOnly: boolean } {
  const { field, cell, section, stateKey } = slot;
  if (field.id === "phaseMeasured") {
    return { value: phaseDeviation(formData[stateKey]), readOnly: true };
  }
  const hasCellFormula = cell
    ? !!section.cellFormulas?.[cellKey(cell.rowIndex, cell.colId)]?.trim()
    : false;
  const useCellResolution =
    !!cell &&
    (hasCellFormula ||
      field.cellBehavior === "populate" ||
      field.cellBehavior === "calculate");

  const raw = useCellResolution
    ? getCellValue(
        formData,
        field,
        stateKey,
        section.id,
        cell!.rowIndex,
        sections,
        section.cellFormulas,
        cell!.colId,
      )
    : formData[stateKey]?.[field.id] !== undefined
      ? formData[stateKey][field.id]
      : ((cell ? section.cellDefaults?.[cellKey(cell.rowIndex, cell.colId)] : undefined) ??
        field.defaultValue ??
        "");

  return {
    value: raw !== undefined && raw !== null ? raw : "",
    readOnly:
      !!field.readOnly ||
      hasCellFormula ||
      (useCellResolution &&
        (field.cellBehavior === "populate" ||
          field.cellBehavior === "calculate")),
  };
}

/** Builder-defined fixed text: the per-cell entry wins over the column default. */
function staticText(slot: ControlSlot): string {
  const { field, cell, section } = slot;
  if (cell) {
    const perCell = section.staticCells?.[cellKey(cell.rowIndex, cell.colId)];
    if (perCell != null && perCell !== "") return perCell;
  }
  return field.staticValue ?? "";
}

const TemperatureHumidity: React.FC<{
  stateKey: string;
  formData: Record<string, any>;
  onFieldChange: InteractiveControlOptions["onFieldChange"];
  readOnly: boolean;
  field?: FieldConfig;
}> = ({ stateKey, formData, onFieldChange, readOnly, field }) => {
  const data = formData[stateKey] ?? {};
  const labels = {
    fahrenheit: field?.subLabels?.fahrenheit || "°F",
    celsius: field?.subLabels?.celsius || "°C",
    tcf: field?.subLabels?.tcf || "TCF",
    humidity: field?.subLabels?.humidity || "Humidity %",
  };
  const inputClasses =
    "temp-humidity-input w-10 min-w-[2.5rem] max-w-full px-2 py-1 border border-neutral-300 dark:border-neutral-500 rounded bg-white dark:bg-dark-150 text-neutral-900 dark:text-white focus:ring-1 focus:ring-brand focus:border-brand text-xs";
  return (
    <div className="temp-humidity-one-line flex flex-wrap items-center gap-x-2 gap-y-1 text-xs border border-neutral-200 dark:border-neutral-600 rounded px-2 py-1.5 bg-white dark:bg-dark-100 w-full max-w-full min-w-0">
      <span className="shrink-0 font-medium text-neutral-600 dark:text-neutral-400">
        {labels.fahrenheit}
      </span>
      <input
        type="text"
        inputMode="numeric"
        value={data.temperature ?? ""}
        readOnly={readOnly}
        onChange={(e) => onFieldChange(stateKey, "temperature", e.target.value)}
        placeholder={String(field?.defaultTemperature ?? 68)}
        title="Temperature (°F)"
        className={`temp-humidity-f ${inputClasses}`}
      />
      <span className="text-neutral-400 dark:text-neutral-500 shrink-0">{labels.celsius}</span>
      <span
        className="temp-humidity-c min-w-[2.5rem] text-neutral-600 dark:text-neutral-400 shrink-0 tabular-nums"
        title="Calculated"
      >
        {data.temperatureCelsius ?? ""}
      </span>
      <span className="text-neutral-400 dark:text-neutral-500 shrink-0">
        {labels.tcf}
      </span>
      <span
        className="temp-humidity-tcf min-w-[2rem] text-neutral-600 dark:text-neutral-400 shrink-0 tabular-nums"
        title="Calculated"
      >
        {data.tcf ?? ""}
      </span>
      <span className="shrink-0 text-neutral-600 dark:text-neutral-400">
        {labels.humidity}
      </span>
      <input
        type="text"
        inputMode="numeric"
        value={data.humidity ?? ""}
        readOnly={readOnly}
        onChange={(e) => onFieldChange(stateKey, "humidity", e.target.value)}
        placeholder={String(field?.defaultHumidity ?? 50)}
        title="Humidity (%)"
        className={`temp-humidity-hum ${inputClasses}`}
      />
    </div>
  );
};

/** "2026-09-10" as "09/10/2026", the way a date input shows it; anything else as is. */
function printedDate(value: unknown): string {
  const text = String(value ?? "");
  const match = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return match ? `${match[2]}/${match[3]}/${match[1]}` : text;
}

/**
 * A control on screen, its value as plain text on paper.
 *
 * The preview and job pages print the live page, so without this an empty
 * dropdown printed "Select..." and a date printed "mm/dd/yyyy" with a calendar
 * icon. The wrapper is `display: contents`, so on screen the control lays out
 * exactly as if it were not wrapped.
 */
function withPrintText(control: React.ReactNode, text: string): React.ReactNode {
  return (
    <>
      <div className="contents print:hidden">{control}</div>
      <span className="hidden print:block whitespace-pre-wrap break-words cf-print-text">{text}</span>
    </>
  );
}

/**
 * Build the `renderControl` a fill-mode chrome hands to the runtime.
 */
export function createInteractiveControlRenderer(
  options: InteractiveControlOptions,
): (slot: ControlSlot) => React.ReactNode {
  const { formData, onFieldChange } = options;

  return function renderControl(slot: ControlSlot) {
    const field: FieldConfig = slot.field;

    if (field.cellBehavior === "static") {
      return (
        <span className="cf-static-text block w-full px-2 py-1.5 text-sm text-neutral-900 dark:text-white">
          {staticText(slot)}
        </span>
      );
    }

    // Temperature: °F typed, °C shown beside it ("87°F (31°C)"). Always writes
    // the section's "temperature", which recomputes °C and the TCF.
    if (v1FieldOf(slot.section, field.id)?.type === "temperature") {
      const ro = !!options.readOnly || !!slot.readOnly;
      const row = options.formData[slot.stateKey] ?? {};
      const f = row.temperature ?? "";
      const c = row.temperatureCelsius;
      const cText = c !== undefined && c !== "" && !isNaN(Number(c)) ? `${Math.round(Number(c))}°C` : "";
      const printed = f !== "" ? `${f}°F${cText ? ` (${cText})` : ""}` : "";
      return withPrintText(
        <div className="flex items-center justify-center gap-1 min-w-0">
          <input
            type="text"
            inputMode="decimal"
            size={1}
            value={f}
            readOnly={ro}
            onChange={(e) => onFieldChange(slot.stateKey, "temperature", e.target.value)}
            placeholder="68"
            title="Temperature (°F)"
            className={`${ro ? READ_ONLY_CONTROL_CLASSES : CONTROL_CLASSES} w-16 text-center`}
          />
          <span className="shrink-0 text-xs text-neutral-600 dark:text-neutral-300 whitespace-nowrap">
            °F{cText && ` (${cText})`}
          </span>
        </div>,
        printed,
      );
    }

    // Photos have no V2 control of their own; recognise them by the builder's field.
    if (v1FieldOf(slot.section, field.id)?.type === "photo") {
      const ro = !!options.readOnly || !!slot.readOnly;
      return (
        <PhotoField
          value={options.formData[slot.stateKey]?.[field.id]}
          readOnly={ro}
          onChange={(next) => onFieldChange(slot.stateKey, field.id, next)}
        />
      );
    }

    // V2-only controls. `field` carries a best-effort V1 shape for chromes
    // that predate V2, but where a real V2 control exists it wins.
    const v2 = renderV2Control(slot, options, onFieldChange);
    if (v2 !== undefined) return v2;

    const resolved = resolveSlotValue(slot, options);
    const readOnly = resolved.readOnly || !!options.readOnly || !!slot.readOnly;
    const value = resolved.value;
    const classes = readOnly ? READ_ONLY_CONTROL_CLASSES : CONTROL_CLASSES;

    // Calculated results (pass/fail rules, or any formula giving PASS / FAIL)
    // show as a coloured tag rather than plain text.
    if (field.cellBehavior === "calculate" || field.resultRule) {
      const tone = resultTone(value);
      if (tone) return <ResultBadge value={String(value)} tone={tone} />;
    }
    const change = (next: any) => onFieldChange(slot.stateKey, field.id, next);

    switch (field.type) {
      case "textarea":
        return withPrintText(
          <textarea
            value={value}
            onChange={(e) => change(e.target.value)}
            placeholder={readOnly ? undefined : field.placeholder}
            rows={3}
            readOnly={readOnly}
            className={classes}
          />,
          String(value ?? ""),
        );

      case "select": {
        const chosen = field.options?.find(
          (opt: any) => String(opt?.value ?? opt?.label ?? "") === String(value ?? ""),
        );
        return withPrintText(
          <select
            value={value}
            onChange={(e) => change(e.target.value)}
            disabled={readOnly}
            className={classes}
          >
            {/* An older report's Value Deviation selects always carry a value,
                so they are the one select without an empty prompt. */}
            {slot.placement !== "deviation-cell" && (
              <option value="">{field.placeholder || "Select..."}</option>
            )}
            {field.options?.map((opt: any, index: number) => {
              const optionValue = opt?.value ?? opt?.label ?? "";
              const optionLabel = opt?.label ?? opt?.value ?? "";
              return (
                <option
                  key={`${field.id}-${index}-${optionValue}`}
                  value={optionValue}
                >
                  {optionLabel}
                </option>
              );
            })}
          </select>,
          value === "" || value == null
            ? ""
            : String(chosen?.label ?? chosen?.value ?? value),
        );
      }

      case "checkbox":
        return (
          <input
            type="checkbox"
            checked={!!value}
            onChange={(e) => change(e.target.checked)}
            disabled={readOnly}
            className="w-4 h-4 text-brand border-neutral-300 rounded focus:ring-brand"
          />
        );

      case "date":
        return withPrintText(
          <input
            type="date"
            size={1}
            value={value}
            onChange={(e) => change(e.target.value)}
            readOnly={readOnly}
            className={classes}
          />,
          printedDate(value),
        );

      case "number": {
        // A suffix ("%") sits right after the value, on screen and on paper.
        const suffix = v1FieldOf(slot.section, field.id)?.valueSuffix ?? "";
        const input = (
          <input
            type="text"
            inputMode="numeric"
            size={1}
            value={value}
            onChange={(e) => change(e.target.value)}
            placeholder={readOnly ? undefined : field.placeholder}
            readOnly={readOnly}
            className={classes}
          />
        );
        return withPrintText(
          suffix ? (
            <div className="flex items-center gap-1 min-w-0">
              {input}
              <span className="shrink-0 text-xs text-neutral-600 dark:text-neutral-300">{suffix}</span>
            </div>
          ) : (
            input
          ),
          value === "" || value == null ? "" : `${String(value)}${suffix}`,
        );
      }

      case "temperature-humidity":
        return (
          <TemperatureHumidity
            stateKey={slot.stateKey}
            formData={formData}
            onFieldChange={onFieldChange}
            readOnly={readOnly}
            field={field}
          />
        );

      default:
        return withPrintText(
          <input
            type="text"
            size={1}
            value={value}
            onChange={(e) => change(e.target.value)}
            placeholder={readOnly ? undefined : field.placeholder}
            readOnly={readOnly}
            className={classes}
          />,
          String(value ?? ""),
        );
    }
  };
}

// ---------------------------------------------------------------------------
// V2-only controls
// ---------------------------------------------------------------------------

const RADIO_LAYOUTS: Record<string, string> = {
  horizontal: "flex flex-wrap items-center gap-x-4 gap-y-1",
  vertical: "flex flex-col gap-1",
  "table-cell": "flex items-center justify-center gap-3",
};

const TONE_CLASSES: Record<string, string> = {
  pass: "text-green-700 dark:text-green-400",
  fail: "text-red-700 dark:text-red-400",
  limited: "text-yellow-700 dark:text-yellow-400",
  neutral: "",
};

/**
 * Returns `undefined` when the slot is not a V2-only control, so the caller
 * falls through to the shared V1 rendering.
 */
function renderV2Control(
  slot: ControlSlot,
  options: InteractiveControlOptions,
  onFieldChange: InteractiveControlOptions["onFieldChange"],
): React.ReactNode | undefined {
  const control = slot.controlV2;
  if (!control) return undefined;

  const { value, readOnly: resolvedReadOnly } = resolveSlotValue(slot, options);
  const readOnly = resolvedReadOnly || !!options.readOnly || !!slot.readOnly;
  const change = (next: unknown) =>
    onFieldChange(slot.stateKey, slot.field.id, next);

  switch (control.type) {
    case "radio-group": {
      const name = `${slot.stateKey}-${slot.field.id}`;
      return (
        <div className={RADIO_LAYOUTS[control.presentation] ?? RADIO_LAYOUTS.horizontal}>
          {control.options.map((option) => (
            <label
              key={option.value}
              className={`inline-flex items-center gap-1.5 text-sm cursor-pointer ${
                TONE_CLASSES[option.tone ?? "neutral"] ?? ""
              } ${readOnly ? "cursor-default opacity-70" : ""}`}
            >
              <input
                type="radio"
                name={name}
                value={option.value}
                checked={String(value ?? "") === option.value}
                disabled={readOnly}
                onChange={() => change(option.value)}
                className="w-4 h-4 text-brand border-neutral-300 focus:ring-brand"
              />
              <span>{option.label}</span>
            </label>
          ))}
        </div>
      );
    }

    case "checkbox-group": {
      const selected: string[] = Array.isArray(value)
        ? (value as string[])
        : value
          ? [String(value)]
          : [];
      return (
        <div
          className={
            control.layout === "column"
              ? "flex flex-col gap-1"
              : "flex flex-wrap items-center gap-x-4 gap-y-1"
          }
        >
          {control.options.map((option) => (
            <label
              key={option.value}
              className="inline-flex items-center gap-1.5 text-sm cursor-pointer"
            >
              <input
                type="checkbox"
                checked={selected.includes(option.value)}
                disabled={readOnly}
                onChange={(e) =>
                  change(
                    e.target.checked
                      ? [...selected, option.value]
                      : selected.filter((v) => v !== option.value),
                  )
                }
                className="w-4 h-4 text-brand border-neutral-300 rounded focus:ring-brand"
              />
              <span>{option.label}</span>
            </label>
          ))}
        </div>
      );
    }

    case "unit-value": {
      // The reading and its unit are two values under one control, so the unit
      // travels with the number instead of living in a separate column.
      const unitKey = `${slot.field.id}__unit`;
      const unit =
        (options.formData[slot.stateKey]?.[unitKey] as string) ??
        control.units.default ??
        control.units.options[0] ??
        "";
      return withPrintText(
        <div className="flex items-center gap-1">
          <input
            type="text"
            inputMode="decimal"
            value={value as string}
            readOnly={readOnly}
            onChange={(e) => change(e.target.value)}
            className={readOnly ? READ_ONLY_CONTROL_CLASSES : CONTROL_CLASSES}
          />
          <select
            value={unit}
            disabled={readOnly || control.units.scope !== "cell"}
            onChange={(e) =>
              onFieldChange(slot.stateKey, unitKey, e.target.value)
            }
            className="px-1 py-1.5 text-xs border border-neutral-200 dark:border-neutral-600 rounded bg-white dark:bg-dark-100 text-neutral-900 dark:text-white"
          >
            {control.units.options.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </div>,
        value === "" || value == null ? "" : `${String(value)} ${unit}`.trim(),
      );
    }

    case "signature": {
      // The name is the field's own value; older forms kept it in __signedBy.
      const row = options.formData[slot.stateKey] ?? {};
      const id = slot.field.id;
      return (
        <SignatureField
          label={slot.field.label}
          readOnly={readOnly}
          value={{
            name: (row[id] ?? row[`${id}__signedBy`] ?? "") as string,
            image: (row[`${id}__signature`] ?? "") as string,
            signedAt: (row[`${id}__signedAt`] ?? "") as string,
          }}
          onChange={(patch) => {
            if (patch.name !== undefined) onFieldChange(slot.stateKey, id, patch.name);
            if (patch.image !== undefined) onFieldChange(slot.stateKey, `${id}__signature`, patch.image);
            if (patch.signedAt !== undefined) onFieldChange(slot.stateKey, `${id}__signedAt`, patch.signedAt);
          }}
        />
      );
    }

    case "time":
    case "datetime":
      return withPrintText(
        <input
          type={control.type === "time" ? "time" : "datetime-local"}
          value={value as string}
          readOnly={readOnly}
          onChange={(e) => change(e.target.value)}
          className={readOnly ? READ_ONLY_CONTROL_CLASSES : CONTROL_CLASSES}
        />,
        control.type === "time"
          ? String(value ?? "")
          : String(value ?? "").replace("T", " "),
      );

    default:
      return undefined;
  }
}
