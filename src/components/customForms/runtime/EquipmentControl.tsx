/**
 * Equipment search cell for custom forms (filler and preview).
 *
 * Wraps the shared EquipmentAutocomplete. Picking a record fills the row's
 * serial / AMP id / calibration columns and keeps the calibration due date, and
 * the cell warns when that date has passed or is close.
 */

import React from "react";
import { AlertTriangle } from "lucide-react";
import { EquipmentAutocomplete } from "@/components/equipment/EquipmentAutocomplete";
import type { ControlSlot } from "@/lib/customForms/runtime";
import type { CustomFormStructure } from "@/lib/types/customForms";
import {
  CAL_DUE_KEY,
  EQUIPMENT_ID_KEY,
  calibrationState,
  equipmentLookupKeys,
  equipmentWarnings,
  indexCalibrationRecords,
  isEquipmentColumn,
  resolveEquipmentFill,
  reportTestDate,
  rowDueDate,
  toDateOnly,
  type EquipmentCalibrationRecord,
  type LiveCalibration,
} from "@/lib/customForms/equipment";

/**
 * The current calibration of every piece of test equipment on the form, read
 * from the Test Equipment table (field_equipment), so warnings follow the
 * equipment's record: recalibrate it and the warning clears on every report.
 */
export function useLiveEquipmentCalibration(
  structure: CustomFormStructure | undefined | null,
  formData: FormData,
): LiveCalibration | undefined {
  const keys = React.useMemo(
    () => (structure ? equipmentLookupKeys(structure, formData) : { ids: [], ampIds: [], serials: [] }),
    [structure, formData],
  );
  const signature = JSON.stringify(keys);
  const [live, setLive] = React.useState<LiveCalibration>();
  React.useEffect(() => {
    if (!keys.ids.length && !keys.ampIds.length && !keys.serials.length) {
      setLive(undefined);
      return;
    }
    let cancelled = false;
    // Debounced: typing an AMP id shouldn't query on every key.
    const timer = window.setTimeout(async () => {
      try {
        const { supabase } = await import("@/lib/supabase");
        const columns = "id, amp_id, serial_number, calibration_date, calibration_due_date, calibration_interval_months";
        const queries: PromiseLike<{ data: unknown[] | null }>[] = [];
        if (keys.ids.length) queries.push(supabase.schema("neta_ops").from("field_equipment").select(columns).in("id", keys.ids));
        if (keys.ampIds.length) queries.push(supabase.schema("neta_ops").from("field_equipment").select(columns).in("amp_id", keys.ampIds));
        if (keys.serials.length) queries.push(supabase.schema("neta_ops").from("field_equipment").select(columns).in("serial_number", keys.serials));
        const results = await Promise.all(queries);
        const records = results.flatMap((r) => (r.data ?? []) as EquipmentCalibrationRecord[]);
        if (!cancelled) setLive(indexCalibrationRecords(records));
      } catch (err) {
        console.error("Could not read test equipment calibration:", err);
      }
    }, 600);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature]);
  return live;
}

type FormData = Record<string, Record<string, any>>;

const fmt = (iso: string) => {
  const [y, m, d] = iso.split("-");
  return y && m && d ? `${m}/${d}/${y}` : iso;
};

/** Screen-only note under the equipment name, judged on the report's test date (none without one). */
const CalibrationNote: React.FC<{ due: string; testDate: { date: Date } | null }> = ({ due, testDate }) => {
  if (!testDate) return null;
  const state = calibrationState(due, testDate.date);
  if (state.kind === "unknown" || state.kind === "ok") return null;
  const expired = state.kind === "expired";
  const on = "the test date";
  return (
    <div
      className={`mt-0.5 flex items-center gap-1 text-[10px] font-medium print:hidden ${
        expired ? "text-red-600 dark:text-red-400" : "text-amber-600 dark:text-amber-400"
      }`}
    >
      <AlertTriangle className="w-3 h-3 shrink-0" />
      {expired
        ? `Calibration expired ${fmt(due)}, before ${on}`
        : state.days === 0
          ? `Calibration due on ${on}`
          : `Calibration due ${state.days} day${state.days === 1 ? "" : "s"} after ${on}`}
    </div>
  );
};

/**
 * A `renderControlOverride` for the fill chrome: equipment-search columns get
 * the picker; every other slot falls through (returns null).
 */
export function useEquipmentControlOverride(
  formData: FormData,
  setFormData: React.Dispatch<React.SetStateAction<FormData>>,
  readOnly = false,
  live?: LiveCalibration,
  /** The report's test date (see reportTestDate); calibration is judged on it. Null: no check. */
  testDate: { date: Date } | null = null,
) {
  return React.useCallback(
    (slot: ControlSlot): React.ReactNode | null => {
      if (!slot.cell || !isEquipmentColumn(slot.section, slot.cell.colId)) return null;
      const column = slot.section.columns?.find((c) => c.id === slot.cell!.colId);
      if (!column) return null;
      const key = column.field.id;
      const stateKey = slot.stateKey;
      const row = formData[stateKey] ?? {};
      const fill = resolveEquipmentFill(slot.section, column.id);
      // The equipment's current record wins over the date saved when it was picked.
      const due = rowDueDate(slot.section, column.id, row, live);
      const name = String(row[key] ?? "");

      if (readOnly) {
        return (
          <div>
            <span className="text-sm">{name}</span>
            {due && <CalibrationNote due={toDateOnly(due)} testDate={testDate} />}
          </div>
        );
      }

      return (
        <div className="min-w-0">
          {/* Print shows the name as plain text, like every other control. */}
          <div className="print:hidden">
            <EquipmentAutocomplete
              value={name}
              onChange={(v) =>
                setFormData((prev) => ({
                  ...prev,
                  [stateKey]: { ...(prev[stateKey] || {}), [key]: v },
                }))
              }
              onSelect={(equipment) => {
                const calDate = toDateOnly(equipment.calibration_date);
                const calDue = toDateOnly(equipment.calibration_due_date);
                setFormData((prev) => {
                  const next = { ...(prev[stateKey] || {}), [key]: equipment.equipment_name };
                  if (fill.serialNumber) next[fill.serialNumber] = equipment.serial_number ?? "";
                  if (fill.ampId) next[fill.ampId] = equipment.amp_id ?? "";
                  if (fill.calibrationDate) next[fill.calibrationDate] = calDate;
                  if (fill.calibrationDue) next[fill.calibrationDue] = calDue;
                  next[`${CAL_DUE_KEY}_${key}`] = calDue;
                  // Kept so the form can follow this equipment's record later.
                  next[`${EQUIPMENT_ID_KEY}_${key}`] = equipment.id;
                  return { ...prev, [stateKey]: next };
                });
              }}
              placeholder="Search equipment…"
              // Sizing only: this class lands on the autocomplete's wrapper.
              className="w-full min-w-0"
            />
          </div>
          <span className="hidden print:block whitespace-pre-wrap break-words cf-print-text">{name}</span>
          {due && <CalibrationNote due={toDateOnly(due)} testDate={testDate} />}
        </div>
      );
    },
    [formData, setFormData, readOnly, live, testDate],
  );
}

/** A banner above the form listing equipment past (or close to) calibration. */
export const EquipmentCalibrationBanner: React.FC<{
  structure: CustomFormStructure | undefined | null;
  formData: FormData;
  live?: LiveCalibration;
}> = ({ structure, formData, live }) => {
  const testDate = React.useMemo(() => reportTestDate(structure, formData), [structure, formData]);
  const warnings = React.useMemo(
    () => (structure ? equipmentWarnings(structure, formData, testDate?.date ?? null, live) : []),
    [structure, formData, live, testDate],
  );
  if (!warnings.length) return null;
  const expired = warnings.filter((w) => w.state.kind === "expired");
  return (
    <div
      className={`mb-4 px-4 py-2 text-sm border rounded-none print:hidden ${
        expired.length
          ? "bg-red-50 dark:bg-red-900/20 border-red-300 dark:border-red-800 text-red-900 dark:text-red-200"
          : "bg-amber-50 dark:bg-amber-900/20 border-amber-300 dark:border-amber-800 text-amber-900 dark:text-amber-200"
      }`}
    >
      <div className="flex items-center gap-2 font-semibold">
        <AlertTriangle className="w-4 h-4" />
        {expired.length
          ? `${expired.length} piece${expired.length === 1 ? "" : "s"} of test equipment past calibration on the test date (${fmt(testDate!.iso)})`
          : `Test equipment calibration due soon after the test date (${fmt(testDate!.iso)})`}
      </div>
      <ul className="mt-1 text-xs space-y-0.5">
        {warnings.map((w, i) => (
          <li key={i}>
            {w.equipment || "Equipment"} ({w.sectionTitle}):{" "}
            {w.state.kind === "expired" ? `expired ${fmt(w.due)}` : `due ${fmt(w.due)}`}
          </li>
        ))}
      </ul>
    </div>
  );
};
