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
      : (field.defaultValue ?? "");

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
}> = ({ stateKey, formData, onFieldChange, readOnly }) => {
  const data = formData[stateKey] ?? {};
  const inputClasses =
    "temp-humidity-input w-10 min-w-[2.5rem] max-w-full px-2 py-1 border border-neutral-300 dark:border-neutral-500 rounded bg-white dark:bg-dark-150 text-neutral-900 dark:text-white focus:ring-1 focus:ring-brand focus:border-brand text-xs";
  return (
    <div className="temp-humidity-one-line flex flex-wrap items-center gap-x-2 gap-y-1 text-xs border border-neutral-200 dark:border-neutral-600 rounded px-2 py-1.5 bg-white dark:bg-dark-100 w-full max-w-full min-w-0">
      <span className="shrink-0 font-medium text-neutral-600 dark:text-neutral-400">
        °F
      </span>
      <input
        type="text"
        inputMode="numeric"
        value={data.temperature ?? ""}
        readOnly={readOnly}
        onChange={(e) => onFieldChange(stateKey, "temperature", e.target.value)}
        placeholder="68"
        title="Temperature (°F)"
        className={`temp-humidity-f ${inputClasses}`}
      />
      <span className="text-neutral-400 dark:text-neutral-500 shrink-0">°C</span>
      <span
        className="temp-humidity-c min-w-[2.5rem] text-neutral-600 dark:text-neutral-400 shrink-0 tabular-nums"
        title="Calculated"
      >
        {data.temperatureCelsius ?? ""}
      </span>
      <span className="text-neutral-400 dark:text-neutral-500 shrink-0">
        TCF
      </span>
      <span
        className="temp-humidity-tcf min-w-[2rem] text-neutral-600 dark:text-neutral-400 shrink-0 tabular-nums"
        title="Calculated"
      >
        {data.tcf ?? ""}
      </span>
      <span className="shrink-0 text-neutral-600 dark:text-neutral-400">
        Humidity %
      </span>
      <input
        type="text"
        inputMode="numeric"
        value={data.humidity ?? ""}
        readOnly={readOnly}
        onChange={(e) => onFieldChange(stateKey, "humidity", e.target.value)}
        placeholder="50"
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
      <span className="hidden print:block whitespace-pre-wrap break-words">{text}</span>
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
        <span className="block w-full px-2 py-1.5 text-sm text-neutral-900 dark:text-white">
          {staticText(slot)}
        </span>
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
    const change = (next: any) => onFieldChange(slot.stateKey, field.id, next);

    switch (field.type) {
      case "textarea":
        return withPrintText(
          <textarea
            value={value}
            onChange={(e) => change(e.target.value)}
            placeholder={field.placeholder}
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
            {/* Value Deviation selects always carry a value, so they are the
                one select without an empty prompt. */}
            {slot.placement !== "deviation-cell" && (
              <option value="">Select...</option>
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

      case "number":
        return withPrintText(
          <input
            type="text"
            inputMode="numeric"
            size={1}
            value={value}
            onChange={(e) => change(e.target.value)}
            placeholder={field.placeholder}
            readOnly={readOnly}
            className={classes}
          />,
          String(value ?? ""),
        );

      case "temperature-humidity":
        return (
          <TemperatureHumidity
            stateKey={slot.stateKey}
            formData={formData}
            onFieldChange={onFieldChange}
            readOnly={readOnly}
          />
        );

      default:
        return withPrintText(
          <input
            type="text"
            size={1}
            value={value}
            onChange={(e) => change(e.target.value)}
            placeholder={field.placeholder}
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
      // Phase 4 owns capture. Until then this records who attested and when,
      // which is the part the document actually needs to carry.
      const signedBy = options.formData[slot.stateKey]?.[
        `${slot.field.id}__signedBy`
      ] as string | undefined;
      const signedAt = options.formData[slot.stateKey]?.[
        `${slot.field.id}__signedAt`
      ] as string | undefined;
      return (
        <div className="border border-neutral-200 dark:border-neutral-600 rounded p-2">
          <input
            type="text"
            value={signedBy ?? ""}
            readOnly={readOnly}
            placeholder="Name"
            onChange={(e) =>
              onFieldChange(
                slot.stateKey,
                `${slot.field.id}__signedBy`,
                e.target.value,
              )
            }
            className={readOnly ? READ_ONLY_CONTROL_CLASSES : CONTROL_CLASSES}
          />
          <div className="mt-1 text-[11px] text-neutral-500 dark:text-neutral-400">
            {signedAt
              ? `Attested ${new Date(signedAt).toLocaleString()}`
              : "Not yet attested"}
          </div>
        </div>
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
