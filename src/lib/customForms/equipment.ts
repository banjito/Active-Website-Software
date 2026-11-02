/**
 * Test equipment search in custom forms.
 *
 * Any table column can be an "equipment search": the technician types part
 * of a name, AMP id or serial, picks the record from field_equipment, and the
 * row's serial number, AMP id and calibration dates fill themselves in. The
 * calibration due date is kept with the row (even with no column for it) so
 * the form can warn about equipment that is past calibration.
 */

import type { CustomFormStructure, SectionConfig } from '@/lib/types/customForms';
import { resolveRowCount, rowStateKey } from '@/lib/customForms/runtime/layout';

/** Which columns the picked record fills. Values are column ids. */
export interface EquipmentFill {
  serialNumber?: string;
  ampId?: string;
  calibrationDate?: string;
  calibrationDue?: string;
}

export interface EquipmentPickerConfig {
  /** Explicit mapping; columns left out are matched by name. */
  fill?: EquipmentFill;
}

/** Row data key the calibration due date is always kept under. */
export const CAL_DUE_KEY = '__calibrationDue';
/** Row data key the picked field_equipment record's id is kept under. */
export const EQUIPMENT_ID_KEY = '__equipmentId';

/** How soon a due date counts as "due soon": the Test Equipment page's window. */
export const DUE_SOON_DAYS = 60;

/** A field_equipment record's calibration, as the Test Equipment page keeps it. */
export interface EquipmentCalibrationRecord {
  id: string;
  amp_id: string | null;
  serial_number: string | null;
  calibration_date: string | null;
  calibration_due_date: string | null;
  calibration_interval_months: number | null;
}

/**
 * The due date the Test Equipment page goes by: its due date, or when that is
 * blank, the calibration date plus the calibration interval.
 */
export function effectiveDueDate(record: EquipmentCalibrationRecord): string {
  const due = toDateOnly(record.calibration_due_date);
  if (due) return due;
  const cal = toDateOnly(record.calibration_date);
  const months = Number(record.calibration_interval_months);
  if (!cal || !Number.isFinite(months) || months <= 0) return '';
  const [y, m, d] = cal.split('-').map(Number);
  const target = new Date(y, m - 1 + months, d);
  // 31 Jan + 1 month is the end of February, not 3 March (as on the equipment page).
  if (target.getDate() !== d) target.setDate(0);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${target.getFullYear()}-${pad(target.getMonth() + 1)}-${pad(target.getDate())}`;
}

/** Current calibration records, found by id, AMP id or serial number. */
export interface LiveCalibration {
  byId: Map<string, EquipmentCalibrationRecord>;
  byAmpId: Map<string, EquipmentCalibrationRecord>;
  bySerial: Map<string, EquipmentCalibrationRecord>;
}

const norm = (v: unknown) => String(v ?? '').trim().toLowerCase();

/**
 * The due date for one equipment row: from the equipment's current record in
 * the Test Equipment table when it can be found (by the id saved when it was
 * picked, else its AMP id or serial), otherwise the date saved with the row.
 */
export function rowDueDate(
  section: SectionConfig,
  columnId: string,
  row: Record<string, any>,
  live?: LiveCalibration,
): string {
  const column = section.columns?.find((c) => c.id === columnId);
  if (!column) return '';
  const key = column.field.id;
  const fill = resolveEquipmentFill(section, columnId);
  if (live) {
    const record =
      live.byId.get(String(row[`${EQUIPMENT_ID_KEY}_${key}`] ?? '')) ??
      (fill.ampId && row[fill.ampId] ? live.byAmpId.get(norm(row[fill.ampId])) : undefined) ??
      (fill.serialNumber && row[fill.serialNumber] ? live.bySerial.get(norm(row[fill.serialNumber])) : undefined);
    if (record) return effectiveDueDate(record);
  }
  return toDateOnly(row[`${CAL_DUE_KEY}_${key}`] ?? (fill.calibrationDue ? row[fill.calibrationDue] : ''));
}

/** What to look up in the Test Equipment table for a filled form. */
export function equipmentLookupKeys(
  structure: CustomFormStructure,
  formData: Record<string, Record<string, any>>,
): { ids: string[]; ampIds: string[]; serials: string[] } {
  const ids = new Set<string>();
  const ampIds = new Set<string>();
  const serials = new Set<string>();
  for (const section of structure.sections) {
    const pickers = (section.columns ?? []).filter((c) => isEquipmentColumn(section, c.id));
    if (!pickers.length) continue;
    const rows = section.conditionalRows?.length ?? resolveRowCount(section);
    for (let r = 0; r < rows; r++) {
      const row = formData[rowStateKey(section.id, r)] ?? {};
      for (const column of pickers) {
        const fill = resolveEquipmentFill(section, column.id);
        const id = row[`${EQUIPMENT_ID_KEY}_${column.field.id}`];
        if (id) ids.add(String(id));
        if (fill.ampId && row[fill.ampId]) ampIds.add(String(row[fill.ampId]).trim());
        if (fill.serialNumber && row[fill.serialNumber]) serials.add(String(row[fill.serialNumber]).trim());
      }
    }
  }
  return { ids: [...ids], ampIds: [...ampIds], serials: [...serials] };
}

export function indexCalibrationRecords(records: EquipmentCalibrationRecord[]): LiveCalibration {
  const live: LiveCalibration = { byId: new Map(), byAmpId: new Map(), bySerial: new Map() };
  for (const r of records) {
    live.byId.set(r.id, r);
    if (r.amp_id) live.byAmpId.set(norm(r.amp_id), r);
    if (r.serial_number) live.bySerial.set(norm(r.serial_number), r);
  }
  return live;
}

/** Is this column an equipment search? (The built-in Test Equipment component's first column always is.) */
export function isEquipmentColumn(section: SectionConfig, columnId: string | undefined): boolean {
  if (!columnId) return false;
  const column = section.columns?.find((c) => c.id === columnId);
  if (!column) return false;
  if (column.field.equipmentPicker) return true;
  return section.componentType === 'test-equipment' && columnId === 'equipment';
}

/**
 * The columns a picked record fills, as row data keys (field ids). An
 * explicit mapping wins; otherwise columns are matched by id or heading.
 */
export function resolveEquipmentFill(section: SectionConfig, columnId: string): Required<Record<keyof EquipmentFill, string | undefined>> {
  const columns = (section.columns ?? []).filter((c) => c.id !== columnId);
  const explicit = section.columns?.find((c) => c.id === columnId)?.field.equipmentPicker?.fill ?? {};
  const fieldIdOf = (colId?: string) => columns.find((c) => c.id === colId)?.field.id;
  const byName = (test: RegExp, not?: RegExp) =>
    columns.find((c) => {
      const name = `${c.id} ${c.label}`;
      return test.test(name) && !(not && not.test(name));
    })?.field.id;
  return {
    serialNumber: fieldIdOf(explicit.serialNumber) ?? byName(/serial|s\/n\b/i),
    ampId: fieldIdOf(explicit.ampId) ?? byName(/amp\s*_?id|ampid|asset\s*(id|tag)/i),
    calibrationDue: fieldIdOf(explicit.calibrationDue) ?? byName(/due|expir|next\s*cal/i),
    calibrationDate: fieldIdOf(explicit.calibrationDate) ?? byName(/cal/i, /due|expir|next/i),
  };
}

/** "2026-03-01T00:00:00Z" or a Date → "2026-03-01". */
export function toDateOnly(raw: unknown): string {
  if (!raw) return '';
  if (typeof raw === 'string') return raw.slice(0, 10);
  if (raw instanceof Date && !Number.isNaN(raw.getTime())) return raw.toISOString().slice(0, 10);
  return '';
}

export type CalibrationState =
  | { kind: 'expired'; days: number }
  | { kind: 'soon'; days: number }
  | { kind: 'ok'; days: number }
  | { kind: 'unknown' };

/**
 * The date the testing was done: the report's own test date (Job
 * Information's Date, or another date field named like a test date), so
 * calibration is judged as of the day the equipment was used. Null when
 * the form has no test date filled in: then there is nothing to check
 * against, and no calibration warning is shown (never "today").
 */
export function reportTestDate(
  structure: CustomFormStructure | undefined | null,
  formData: Record<string, Record<string, any>>,
): { date: Date; iso: string } | null {
  const sections = structure?.sections ?? [];
  const candidates: { sectionId: string; fieldId: string }[] = [];
  for (const s of sections) {
    if (s.componentType === 'job-info') {
      for (const f of s.fields ?? []) if (f.id === 'date') candidates.push({ sectionId: s.id, fieldId: f.id });
    }
  }
  for (const s of sections) {
    for (const f of [...(s.fields ?? []), ...(s.field ? [s.field] : [])]) {
      // Other date fields that read as the test date: "testDate", "Date of test", "Test Date".
      if (f.type !== 'date') continue;
      if (/test\s*_?date|date\s*of\s*test/i.test(f.id) || /test/i.test(f.label ?? '')) {
        candidates.push({ sectionId: s.id, fieldId: f.id });
      }
    }
  }
  for (const c of candidates) {
    const iso = toDateOnly(formData[c.sectionId]?.[c.fieldId]);
    if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
      const [y, m, d] = iso.split('-').map(Number);
      return { date: new Date(y, m - 1, d), iso };
    }
  }
  return null;
}

/** Where a calibration due date stands on the report's test date (a date, not a time), as the Test Equipment page judges it. */
export function calibrationState(due: unknown, testDate: Date): CalibrationState {
  const text = toDateOnly(due);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return { kind: 'unknown' };
  const [y, m, d] = text.split('-').map(Number);
  const dueDay = Date.UTC(y, m - 1, d);
  const testDay = Date.UTC(testDate.getFullYear(), testDate.getMonth(), testDate.getDate());
  const days = Math.round((dueDay - testDay) / 86_400_000);
  if (days < 0) return { kind: 'expired', days: -days };
  if (days <= DUE_SOON_DAYS) return { kind: 'soon', days };
  return { kind: 'ok', days };
}

export interface EquipmentWarning {
  sectionTitle: string;
  equipment: string;
  due: string;
  state: CalibrationState;
}

/** Equipment in a filled form that is past (or near) its calibration due date. */
export function equipmentWarnings(
  structure: CustomFormStructure,
  formData: Record<string, Record<string, any>>,
  /** The report's test date; no test date, no warnings. */
  testDate: Date | null,
  live?: LiveCalibration,
): EquipmentWarning[] {
  if (!testDate) return [];
  const out: EquipmentWarning[] = [];
  for (const section of structure.sections) {
    const pickers = (section.columns ?? []).filter((c) => isEquipmentColumn(section, c.id));
    if (!pickers.length) continue;
    const rows = section.conditionalRows?.length ?? resolveRowCount(section);
    for (let r = 0; r < rows; r++) {
      const row = formData[rowStateKey(section.id, r)] ?? {};
      for (const column of pickers) {
        const due = rowDueDate(section, column.id, row, live);
        const state = calibrationState(due, testDate);
        if (state.kind === 'expired' || state.kind === 'soon') {
          out.push({
            sectionTitle: section.title,
            equipment: String(row[column.field.id] ?? ''),
            due: toDateOnly(due),
            state,
          });
        }
      }
    }
  }
  return out;
}
