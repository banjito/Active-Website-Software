/**
 * Declarative condition evaluation.
 *
 * Conditions are data, never source. Nothing here parses or executes a string,
 * so a template cannot make the renderer do anything the schema does not
 * describe.
 *
 * Evaluation is total: an unresolvable reference reads as empty rather than
 * throwing, because a half-built draft must still render in the builder.
 */

import type { ConditionV2, SectionBlockV2, ValueRefV2 } from "./schema";
import type { SectionConfig } from "@/lib/types/customForms";

/** Everything a condition can read. */
export interface ConditionScope {
  /** Instance values, keyed the way the runtime keys them. */
  values: Record<string, any>;
  /** The row being evaluated, for `row: "current"` cell references. */
  currentRow?: { tableId: string; stateKey: string; index: number };
  /** Resolved binding values, by binding id. */
  bindings?: Record<string, unknown>;
  /** Runtime row lookup: table id and row id to the row's state key. */
  rowStateKey?: (tableId: string, row: { rowId?: string; index?: number }) =>
    | string
    | undefined;
}

function isBlank(value: unknown): boolean {
  return (
    value === undefined ||
    value === null ||
    value === "" ||
    (Array.isArray(value) && value.length === 0)
  );
}

export function readRef(ref: ValueRefV2, scope: ConditionScope): unknown {
  switch (ref.scope) {
    case "field":
      return scope.values[ref.sectionId]?.[ref.fieldId];

    case "setting":
      return scope.values[ref.sectionId]?.[ref.settingId];

    case "binding":
      return scope.bindings?.[ref.bindingId];

    case "cell": {
      if (ref.row === "current") {
        if (scope.currentRow?.tableId !== ref.tableId) return undefined;
        return scope.values[scope.currentRow.stateKey]?.[ref.columnId];
      }
      const stateKey = scope.rowStateKey?.(ref.tableId, ref.row);
      if (!stateKey) return undefined;
      return scope.values[stateKey]?.[ref.columnId];
    }

    default:
      return undefined;
  }
}

function toNumber(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

/** Compare loosely enough that "5" from a text input matches the number 5. */
function looseEquals(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (isBlank(a) && isBlank(b)) return true;
  if (typeof a === "boolean" || typeof b === "boolean") {
    return Boolean(a) === Boolean(b);
  }
  const aNumber = toNumber(a);
  const bNumber = toNumber(b);
  if (aNumber !== null && bNumber !== null) return aNumber === bNumber;
  return String(a ?? "") === String(b ?? "");
}

export function evaluateCondition(
  condition: ConditionV2 | undefined,
  scope: ConditionScope,
): boolean {
  if (!condition) return true;

  switch (condition.kind) {
    case "always":
      return true;
    case "never":
      return false;

    case "equals":
      return looseEquals(readRef(condition.ref, scope), condition.value);

    case "in": {
      const value = readRef(condition.ref, scope);
      return condition.values.some((candidate) =>
        looseEquals(value, candidate),
      );
    }

    case "empty":
      return isBlank(readRef(condition.ref, scope));

    case "notEmpty":
      return !isBlank(readRef(condition.ref, scope));

    case "compare": {
      const value = toNumber(readRef(condition.ref, scope));
      if (value === null) return false;
      switch (condition.op) {
        case "lt":
          return value < condition.value;
        case "lte":
          return value <= condition.value;
        case "gt":
          return value > condition.value;
        case "gte":
          return value >= condition.value;
        default:
          return false;
      }
    }

    case "all":
      return condition.of.every((child) => evaluateCondition(child, scope));

    case "any":
      return condition.of.some((child) => evaluateCondition(child, scope));

    case "not":
      return !evaluateCondition(condition.of, scope);

    default:
      return true;
  }
}

/** Resolved condition slots for one node. */
export interface NodeState {
  visible: boolean;
  printable: boolean;
  required: boolean;
  readOnly: boolean;
}

export function resolveNodeState(
  node: {
    visibleWhen?: ConditionV2;
    printWhen?: ConditionV2;
    requiredWhen?: ConditionV2;
    readOnlyWhen?: ConditionV2;
    required?: boolean;
    readOnly?: boolean;
  },
  scope: ConditionScope,
): NodeState {
  const visible = evaluateCondition(node.visibleWhen, scope);
  return {
    visible,
    // A node hidden on screen is hidden in print too; printWhen can only
    // narrow further, never resurrect something the user cannot see.
    printable: visible && evaluateCondition(node.printWhen, scope),
    required:
      node.requiredWhen != null
        ? evaluateCondition(node.requiredWhen, scope)
        : !!node.required,
    readOnly:
      node.readOnlyWhen != null
        ? evaluateCondition(node.readOnlyWhen, scope)
        : !!node.readOnly,
  };
}

/** Every reference a condition reads, for dependency and validation passes. */
export function conditionRefs(condition: ConditionV2 | undefined): ValueRefV2[] {
  if (!condition) return [];
  switch (condition.kind) {
    case "equals":
    case "in":
    case "empty":
    case "notEmpty":
    case "compare":
      return [condition.ref];
    case "all":
    case "any":
      return condition.of.flatMap(conditionRefs);
    case "not":
      return conditionRefs(condition.of);
    default:
      return [];
  }
}

// ---------------------------------------------------------------------------
// Building a scope
// ---------------------------------------------------------------------------

type SettingSource =
  | SectionConfig
  | SectionBlockV2
  | { id: string; settings?: { id: string; defaultValue?: string; options: { value: string }[] }[] };

/** A section's settings, whichever schema the section is written in. */
function settingsOf(
  section: SettingSource,
): Array<{ id: string; defaultValue?: string; options: { value: string }[] }> {
  const v1 = (section as SectionConfig).settingFields;
  if (v1) return v1;
  return (section as SectionBlockV2).settings ?? [];
}

/**
 * Instance values with every section's setting defaults folded in.
 *
 * A form the technician has just opened has touched no dropdown, so its
 * settings hold nothing. Evaluating a condition against that raw state made a
 * conditional table render with no rows at all until someone clicked the
 * dropdown. The default has to be in the scope before any condition runs.
 *
 * Stored values always win: this only fills gaps.
 */
export function conditionScopeValues(
  sections: readonly SettingSource[],
  values: Record<string, any>,
): Record<string, any> {
  let merged: Record<string, any> | null = null;

  for (const section of sections) {
    const settings = settingsOf(section);
    if (settings.length === 0) continue;

    const current = values[section.id] ?? {};
    let patch: Record<string, unknown> | null = null;

    for (const setting of settings) {
      const stored = current[setting.id];
      if (stored !== undefined && stored !== null && stored !== "") continue;
      const fallback = setting.defaultValue ?? setting.options[0]?.value ?? "";
      patch = { ...(patch ?? {}), [setting.id]: fallback };
    }

    if (patch) {
      merged = merged ?? { ...values };
      merged[section.id] = { ...current, ...patch };
    }
  }

  return merged ?? values;
}
