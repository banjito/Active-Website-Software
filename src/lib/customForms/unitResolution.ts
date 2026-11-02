/**
 * Units for formula references.
 *
 * A reference can ask for a unit: `{IR.C3 in MΩ}`. The reading is converted
 * from the unit it was entered in, so a 1.2 GΩ reading compares correctly with
 * a 100 MΩ minimum. Where the entered unit comes from, first match wins:
 *
 *   1. typed with the number ("1.2 GΩ");
 *   2. a column the builder pointed at (`field.unitSource.column`);
 *   3. the column's unit chooser, or the table's (V2 `columnUnits` / `units`);
 *   4. the column's own fixed unit (`field.unit`, e.g. a "Test kV" column);
 *   5. a "Units" column in the same row (the built-in tables' pattern).
 *
 * No unit found means the reading is taken as already in the asked-for unit,
 * which is what a formula without units has always done. A unit of another
 * kind (kV asked of an Ω reading) gives a blank: a wrong conversion that
 * looks plausible is worse than none.
 */

import type { FieldConfig, SectionConfig } from '@/lib/types/customForms';
import { knownUnit, unitDimension } from '@/lib/customForms/expressions/resources';
import { convertUnits } from '@/lib/customForms/expressions/resources';

/** "IR.C3 in MΩ" → { path: "IR.C3", unit: "MΩ" }. */
export function splitUnitRef(path: string): { path: string; unit?: string } {
  const m = path.match(/^(.*?)\s+in\s+(\S+)\s*$/i);
  if (!m) return { path: path.trim() };
  return { path: m[1].trim(), unit: m[2] };
}

/** The unit typed after a number, if it is one we know ("1.2 GΩ" → "GΩ"). */
export function typedUnit(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const m = value.trim().match(/^[<>≤≥]?=?\s*[-+]?[\d.,]+(?:e[-+]?\d+)?\s*(\S+)$/i);
  return m && knownUnit(m[1]) ? m[1] : undefined;
}

const isUnitsColumn = (id: string, label: string) =>
  /^units?$/i.test(id.trim()) || /^units?$/i.test(label.trim());

/**
 * The unit a stored value was entered in, or undefined when nothing says.
 * `rowData` is the row's values (table) or the section's values (fields).
 */
export function resolveSourceUnit(args: {
  section: SectionConfig | undefined;
  fieldId: string;
  value: unknown;
  rowData: Record<string, any> | undefined;
  sectionData: Record<string, any> | undefined;
}): string | undefined {
  const { section, fieldId, value, rowData, sectionData } = args;
  const typed = typedUnit(value);
  if (typed) return typed;
  if (!section) return undefined;

  const known = (u: unknown) => (typeof u === 'string' && knownUnit(u.trim()) ? u.trim() : undefined);
  const columns = section.columns ?? [];
  const column = columns.find((c) => (c.field?.id ?? c.id) === fieldId);

  if (column) {
    const pointed = column.field.unitSource?.column;
    if (pointed) {
      const src = columns.find((c) => c.id === pointed);
      const u = known(rowData?.[src?.field.id ?? pointed]) ?? known(src?.field.defaultValue);
      if (u) return u;
    }
    const colSpec = section.v2?.columnUnits?.[column.id];
    if (colSpec) {
      const u = known(sectionData?.[`__units_${column.id}`]) ?? known(colSpec.default) ?? known(colSpec.options[0]);
      if (u) return u;
    }
    const tableSpec = section.v2?.units;
    if (tableSpec) {
      const u =
        known(sectionData?.[`__units_${section.id}`]) ?? known(tableSpec.default) ?? known(tableSpec.options[0]);
      if (u) return u;
    }
    const own = known(column.field.unit);
    if (own) return own;
    const unitsCol = columns.find((c) => c.id !== column.id && isUnitsColumn(c.id, c.label));
    if (unitsCol) {
      return known(rowData?.[unitsCol.field.id]) ?? known(unitsCol.field.defaultValue);
    }
    return undefined;
  }

  const field: FieldConfig | undefined =
    section.fields?.find((f) => f.id === fieldId) ?? (section.field?.id === fieldId ? section.field : undefined);
  return known(field?.unit);
}

/**
 * `value` (already a number) in `target` units, given the unit it was entered
 * in. Null when the two are different kinds of quantity.
 */
export function convertReading(value: number, source: string | undefined, target: string): number | null {
  if (!source || source === target) return value;
  if (!knownUnit(target) || unitDimension(source) !== unitDimension(target)) return null;
  try {
    return convertUnits(value, source, target, { start: 0, end: 0 } as any);
  } catch {
    return null;
  }
}

/** Every unit symbol a formula can ask for, grouped by kind, for pickers. */
export const UNIT_CHOICES: { kind: string; units: string[] }[] = [
  { kind: 'Resistance', units: ['μΩ', 'mΩ', 'Ω', 'kΩ', 'MΩ', 'GΩ'] },
  { kind: 'Voltage', units: ['mV', 'V', 'kV'] },
  { kind: 'Current', units: ['μA', 'mA', 'A', 'kA'] },
  { kind: 'Capacitance', units: ['pF', 'nF', 'μF', 'F'] },
  { kind: 'Power', units: ['W', 'kW', 'MW'] },
  { kind: 'Time', units: ['ms', 's', 'min', 'cycles'] },
  { kind: 'Temperature', units: ['°F', '°C'] },
];
