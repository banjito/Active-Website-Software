/**
 * Expression resources: lookup tables, interpolation curves, and units.
 *
 * These are the three things NETA calculations need that arithmetic alone
 * cannot express. All of them are declared data, resolved by id at compile
 * time, so a formula can never reach a table the template did not declare and
 * a typo in a table name is a publication error rather than a blank cell.
 *
 * Unit conversion is here rather than in the template because getting μΩ and
 * mΩ the wrong way round is a three-orders-of-magnitude error that reads as
 * plausible. The factors live in one table with one test.
 */

import {
  EXPRESSION_LIMITS,
  ExpressionFailure,
  type SourceSpan,
  type ValueType,
} from "@/lib/customForms/expressions/types";

// ---------------------------------------------------------------------------
// Lookup tables
// ---------------------------------------------------------------------------

export interface LookupEntry {
  key: string | number;
  value: string | number | boolean;
}

export interface LookupTable {
  id: string;
  keyType: "string" | "number";
  valueType: "string" | "number" | "boolean";
  entries: readonly LookupEntry[];
  /** Returned when no entry matches. Null when the table has no default. */
  fallback?: string | number | boolean | null;
}

// ---------------------------------------------------------------------------
// Interpolation curves
// ---------------------------------------------------------------------------

export interface CurvePoint {
  x: number;
  y: number;
}

export interface InterpolationCurve {
  id: string;
  /** Sorted ascending by x. Compilation rejects unsorted or duplicated points. */
  points: readonly CurvePoint[];
  /**
   * What happens outside the declared range. `clamp` holds the end value,
   * `null` refuses to guess. Extrapolating a test curve past its data is how
   * you get a confident wrong answer, so `null` is the default.
   */
  outOfRange?: "clamp" | "null";
}

// ---------------------------------------------------------------------------
// Units
// ---------------------------------------------------------------------------

/**
 * Both micro signs occur in this codebase: U+03BC (greek mu) in the insulation
 * and continuity options, U+00B5 (micro sign) in the current options. They are
 * different characters that look identical, so both map to the same unit.
 */
const MICRO_SIGNS = ["μ", "µ"];

interface UnitDefinition {
  dimension: string;
  /** Multiply by this to reach the dimension's base unit. */
  factor: number;
}

function scaled(dimension: string, base: string, scales: Record<string, number>) {
  const out: Record<string, UnitDefinition> = { [base]: { dimension, factor: 1 } };
  for (const [symbol, factor] of Object.entries(scales)) {
    out[symbol] = { dimension, factor };
    for (const micro of MICRO_SIGNS) {
      if (symbol.startsWith(micro)) {
        for (const other of MICRO_SIGNS) {
          out[other + symbol.slice(micro.length)] = { dimension, factor };
        }
      }
    }
  }
  return out;
}

const UNITS: Record<string, UnitDefinition> = {
  ...scaled("resistance", "Ω", {
    "GΩ": 1e9,
    "MΩ": 1e6,
    "kΩ": 1e3,
    "mΩ": 1e-3,
    "μΩ": 1e-6,
  }),
  ...scaled("voltage", "V", { kV: 1e3, MV: 1e6, mV: 1e-3 }),
  ...scaled("current", "A", { kA: 1e3, mA: 1e-3, "μA": 1e-6, nA: 1e-9 }),
  ...scaled("capacitance", "F", {
    mF: 1e-3,
    "μF": 1e-6,
    nF: 1e-9,
    pF: 1e-12,
  }),
  ...scaled("time", "s", { ms: 1e-3, min: 60, hr: 3600, cycles: 1 / 60 }),
  ...scaled("power", "W", { kW: 1e3, MW: 1e6, mW: 1e-3 }),
};

/** Temperature is affine, not a scale factor, so it converts separately. */
const TEMPERATURE = new Set(["°F", "°C", "F", "C"]);

function isFahrenheit(unit: string): boolean {
  return unit === "°F" || unit === "F";
}

export function knownUnit(unit: string): boolean {
  return Object.prototype.hasOwnProperty.call(UNITS, unit) || TEMPERATURE.has(unit);
}

export function unitDimension(unit: string): string | undefined {
  if (TEMPERATURE.has(unit)) return "temperature";
  return UNITS[unit]?.dimension;
}

/**
 * Convert between two units of the same dimension. Mixing dimensions is a
 * compile error, not a runtime surprise, so this only ever sees a valid pair.
 */
export function convertUnits(
  value: number,
  from: string,
  to: string,
  span: SourceSpan,
): number {
  if (from === to) return value;

  if (TEMPERATURE.has(from) && TEMPERATURE.has(to)) {
    const celsius = isFahrenheit(from) ? ((value - 32) * 5) / 9 : value;
    const result = isFahrenheit(to) ? (celsius * 9) / 5 + 32 : celsius;
    return finite(snap(result), span);
  }

  const source = UNITS[from];
  const target = UNITS[to];
  if (!source || !target) {
    throw new ExpressionFailure(
      "unit.unknown",
      `Unknown unit "${source ? to : from}".`,
      span,
    );
  }
  if (source.dimension !== target.dimension) {
    throw new ExpressionFailure(
      "unit.dimension",
      `Cannot convert ${source.dimension} (${from}) to ${target.dimension} (${to}).`,
      span,
    );
  }
  return finite(snap((value * source.factor) / target.factor), span);
}

/**
 * Remove floating-point representation noise.
 *
 * Scaling by powers of ten is not exact in binary: 1 mΩ into μΩ computes as
 * 1000.0000000000001, and that is what the technician would read on the form.
 * Snapping to 15 significant digits drops the noise while leaving any genuine
 * difference at that precision intact, which is far more precision than any
 * test instrument reports.
 */
function snap(value: number): number {
  if (!Number.isFinite(value) || value === 0) return value;
  return Number(value.toPrecision(15));
}

function finite(value: number, span: SourceSpan): number {
  if (!Number.isFinite(value)) {
    throw new ExpressionFailure(
      "number.nonFinite",
      "Unit conversion produced a non-finite number.",
      span,
    );
  }
  return value;
}

// ---------------------------------------------------------------------------
// Resource set
// ---------------------------------------------------------------------------

export interface ExpressionResources {
  lookups: ReadonlyMap<string, LookupTable>;
  curves: ReadonlyMap<string, InterpolationCurve>;
}

export const EMPTY_RESOURCES: ExpressionResources = {
  lookups: new Map(),
  curves: new Map(),
};

/** The value type a lookup produces, for type inference. */
export function lookupValueType(
  resources: ExpressionResources,
  tableId: string,
): ValueType | undefined {
  return resources.lookups.get(tableId)?.valueType;
}

/** The key type a lookup expects, for type inference. */
export function lookupKeyType(
  resources: ExpressionResources,
  tableId: string,
): ValueType | undefined {
  return resources.lookups.get(tableId)?.keyType;
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

export interface ResourceIssue {
  code: string;
  message: string;
  resourceId: string;
}

/**
 * Check declared resources before anything compiles against them. An unsorted
 * curve or a duplicated lookup key produces answers that look right, so these
 * are errors rather than warnings.
 */
export function validateResources(
  resources: ExpressionResources,
): ResourceIssue[] {
  const issues: ResourceIssue[] = [];

  for (const [id, table] of resources.lookups) {
    if (table.id !== id) {
      issues.push({
        code: "lookup.idMismatch",
        message: `Lookup table registered as "${id}" declares id "${table.id}".`,
        resourceId: id,
      });
    }
    if (table.entries.length === 0) {
      issues.push({
        code: "lookup.empty",
        message: `Lookup table "${id}" has no entries.`,
        resourceId: id,
      });
    }
    if (table.entries.length > EXPRESSION_LIMITS.listLength) {
      issues.push({
        code: "lookup.tooLarge",
        message: `Lookup table "${id}" has more than ${EXPRESSION_LIMITS.listLength} entries.`,
        resourceId: id,
      });
    }
    const seen = new Set<string>();
    for (const entry of table.entries) {
      if (typeof entry.key !== table.keyType) {
        issues.push({
          code: "lookup.keyType",
          message: `Lookup table "${id}" declares ${table.keyType} keys but has a ${typeof entry.key} key.`,
          resourceId: id,
        });
        continue;
      }
      if (typeof entry.value !== table.valueType) {
        issues.push({
          code: "lookup.valueType",
          message: `Lookup table "${id}" declares ${table.valueType} values but has a ${typeof entry.value} value.`,
          resourceId: id,
        });
      }
      const key = String(entry.key);
      if (seen.has(key)) {
        issues.push({
          code: "lookup.duplicateKey",
          message: `Lookup table "${id}" has more than one entry for key "${key}".`,
          resourceId: id,
        });
      }
      seen.add(key);
    }
  }

  for (const [id, curve] of resources.curves) {
    if (curve.id !== id) {
      issues.push({
        code: "curve.idMismatch",
        message: `Interpolation curve registered as "${id}" declares id "${curve.id}".`,
        resourceId: id,
      });
    }
    if (curve.points.length < 2) {
      issues.push({
        code: "curve.tooFewPoints",
        message: `Interpolation curve "${id}" needs at least two points.`,
        resourceId: id,
      });
      continue;
    }
    if (curve.points.length > EXPRESSION_LIMITS.listLength) {
      issues.push({
        code: "curve.tooLarge",
        message: `Interpolation curve "${id}" has more than ${EXPRESSION_LIMITS.listLength} points.`,
        resourceId: id,
      });
    }
    for (let index = 0; index < curve.points.length; index += 1) {
      const point = curve.points[index];
      if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) {
        issues.push({
          code: "curve.nonFinite",
          message: `Interpolation curve "${id}" has a non-finite point at position ${index + 1}.`,
          resourceId: id,
        });
        continue;
      }
      if (index > 0 && point.x <= curve.points[index - 1].x) {
        issues.push({
          code: "curve.unsorted",
          message: `Interpolation curve "${id}" must be sorted by ascending x with no repeats; point ${index + 1} breaks that.`,
          resourceId: id,
        });
      }
    }
  }

  return issues;
}

// ---------------------------------------------------------------------------
// Evaluation
// ---------------------------------------------------------------------------

/** Exact-match lookup. A miss returns the table's fallback, or null. */
export function lookupValue(
  table: LookupTable,
  key: string | number,
): string | number | boolean | null {
  const wanted = String(key);
  for (const entry of table.entries) {
    if (String(entry.key) === wanted) return entry.value;
  }
  return table.fallback ?? null;
}

/**
 * Linear interpolation between the two points either side of `x`.
 *
 * Outside the declared range the curve returns null by default rather than
 * extrapolating: a VLF curve read past its last point is not a measurement,
 * and a blank cell is honest where a confident number is not.
 */
export function interpolateCurve(
  curve: InterpolationCurve,
  x: number,
  span: SourceSpan,
): number | null {
  const points = curve.points;
  const first = points[0];
  const last = points[points.length - 1];

  if (x < first.x || x > last.x) {
    if (curve.outOfRange !== "clamp") return null;
    return x < first.x ? first.y : last.y;
  }

  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1];
    const current = points[index];
    if (x <= current.x) {
      if (x === previous.x) return previous.y;
      if (x === current.x) return current.y;
      const ratio = (x - previous.x) / (current.x - previous.x);
      return finite(previous.y + ratio * (current.y - previous.y), span);
    }
  }
  return last.y;
}
