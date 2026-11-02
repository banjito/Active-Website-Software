/**
 * In-memory registry of lookup tables for formulas.
 *
 * Kept free of network and React so the formula evaluator (and its regression
 * tests) can import it. lookupLibrary.ts loads the shared library into it.
 */

import type { ExpressionResources, LookupTable } from '@/lib/customForms/expressions/resources';
import { LIQUID_FILLED_TCF_ENTRIES, STANDARD_TCF_ENTRIES } from '@/lib/customForms/tcfTables';
import {
  ELECTRICAL_RESOURCES,
  TEST_VOLTAGE_TABLE,
} from '@/lib/customForms/expressions/rule-packs/electrical';

export interface SharedLookupTable extends LookupTable {
  name: string;
  description?: string;
  keyLabel?: string;
  valueLabel?: string;
  engineeringVerified: boolean;
  verifiedAt?: string | null;
  /** Ships in code; read-only in the editor (copy it to change it). */
  builtIn?: boolean;
  updatedAt?: string;
}

export const BUILT_IN_LOOKUP_TABLES: SharedLookupTable[] = [
  {
    id: 'neta.tcf',
    name: 'Temperature correction factor (standard)',
    description:
      'TCF by whole °C, 20 °C = 1.00. Same numbers as the built reports. Both the built reports and the custom forms {JD.tcf} round °C to the nearest degree and read the row (87°F = 30.56°C → 31°C → 1.664). ' +
      'In a formula: lookup("neta.tcf", round({JD.temperatureCelsius})). Not yet checked by an engineer.',
    keyType: 'number',
    valueType: 'number',
    match: 'exact',
    keyLabel: '°C',
    valueLabel: 'TCF',
    fallback: null,
    entries: STANDARD_TCF_ENTRIES,
    engineeringVerified: false,
    builtIn: true,
  },
  {
    id: 'neta.tcf_liquid_filled',
    name: 'Temperature correction factor (liquid-filled transformers)',
    description:
      'Temperature Insulation Factor by whole °C for liquid-filled transformers, as used by the Liquid-Filled Transformer ATS-25 report (30 °C → 1.98, vs 1.58 standard). ' +
      'Use with a rounded °C: lookup("neta.tcf_liquid_filled", round({JD.temperatureCelsius})). Not yet checked by an engineer.',
    keyType: 'number',
    valueType: 'number',
    match: 'exact',
    keyLabel: '°C',
    valueLabel: 'TCF',
    fallback: null,
    entries: LIQUID_FILLED_TCF_ENTRIES,
    engineeringVerified: false,
    builtIn: true,
  },
  {
    ...TEST_VOLTAGE_TABLE,
    name: 'Insulation test voltage by rating',
    description: 'Test voltage (V) for an equipment voltage rating such as "600V". Taken from the built reports; not yet checked by an engineer.',
    keyLabel: 'Voltage rating',
    valueLabel: 'Test voltage (V)',
    engineeringVerified: false,
    builtIn: true,
  },
];

let library: SharedLookupTable[] = [];
let missing = false;
const listeners = new Set<() => void>();

export function lookupRegistryState() {
  return { library, missing };
}

export function setLibraryLookupTables(tables: SharedLookupTable[], isMissing: boolean) {
  library = tables;
  missing = isMissing;
  listeners.forEach((fn) => fn());
}

/** Replace (or remove) one table after saving it, without a refetch. */
export function cacheLookupTable(t: SharedLookupTable | { id: string; deleted: true }) {
  const rest = library.filter((x) => x.id !== t.id);
  setLibraryLookupTables('deleted' in t ? rest : [...rest, t as SharedLookupTable], missing);
}

export function subscribeLookupTables(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

/** Every table a formula can name: built-ins, then the library (library wins on a clash). */
export function allLookupTables(): SharedLookupTable[] {
  const byId = new Map<string, SharedLookupTable>();
  BUILT_IN_LOOKUP_TABLES.forEach((t) => byId.set(t.id, t));
  library.forEach((t) => byId.set(t.id, t));
  return [...byId.values()];
}

/** Resources for the formula engine: all lookup tables plus the built-in curves (TCF). */
export function getLookupResources(): ExpressionResources {
  return {
    lookups: new Map(allLookupTables().map((t) => [t.id, t])),
    curves: ELECTRICAL_RESOURCES.curves,
  };
}
