import type { CustomFormStructure, FieldConfig, SectionConfig } from "@/lib/types/customForms";
import { cellKey, resolveRowCount, rowStateKey } from "@/lib/customForms/runtime/layout";
import { compileExpressionProgram, type CompiledExpressionProgram } from "@/lib/customForms/expressions/program";
import { expressionReferenceId, translateV1Expression } from "@/lib/customForms/expressions/v1-adapter";
import { EXPRESSION_ENGINE_VERSION, EXPRESSION_LIMITS, type ExpressionIssue, type ExpressionValue, type Result, type ValueType } from "@/lib/customForms/expressions/types";
import type { ExpressionResources, InterpolationCurve, LookupTable } from "@/lib/customForms/expressions/resources";

export interface FormExpressionSlot {
  id: string;
  label: string;
  sectionId: string;
  stateKey: string;
  field: FieldConfig;
  columnId?: string;
  rowIndex?: number;
  /** Composite-derived job values can be read but not replaced by a formula. */
  canCalculate: boolean;
  defaultValue?: unknown;
}

export interface FormExpressionEvaluation {
  slots: readonly FormExpressionSlot[];
  results: ReadonlyMap<string, Result<ExpressionValue>>;
  issues: ExpressionIssue[];
}

export interface CompiledFormExpressions {
  slots: readonly FormExpressionSlot[];
  calculationIds: ReadonlySet<string>;
  evaluate(data: Record<string, Record<string, unknown>>): FormExpressionEvaluation;
}

const issue = (code: string, message: string, calculationId?: string): ExpressionIssue => ({ code, message, start: 0, end: 0, calculationId });
const tableRows = (section: SectionConfig) => section.componentType === "conditional-table" ? section.conditionalRows?.length ?? 0 : resolveRowCount(section);
const slotType = (field: FieldConfig): ValueType => field.type === "number" ? "number" : field.type === "checkbox" ? "boolean" : "string";

export function formSlotId(section: SectionConfig, fieldId: string, cell?: { rowIndex: number; colId: string }): string | undefined {
  if (!cell) return expressionReferenceId({ scope: "field", sectionId: section.id, fieldId });
  const rowId = section.calculationRowIds?.[cell.rowIndex];
  return rowId ? expressionReferenceId({ scope: "cell", tableId: section.id, rowId, columnId: cell.colId }) : undefined;
}

/** This bridge intentionally supports only fixed V1-shaped rows, through the V2 renderer. */
export function listFormExpressionSlots(structure: CustomFormStructure): Result<FormExpressionSlot[]> {
  const slots: FormExpressionSlot[] = [];
  const issues: ExpressionIssue[] = [];
  for (const section of structure.sections) {
    const addField = (field: FieldConfig, canCalculate = true) => {
      if (field.type === "temperature-humidity") return;
      slots.push({ id: formSlotId(section, field.id)!, label: `${section.title} / ${field.label || field.id}`, sectionId: section.id, stateKey: section.id, field, canCalculate, defaultValue: field.defaultValue });
    };
    [...(section.fields ?? []), ...(section.aboveTableFields ?? []), ...(section.field ? [section.field] : [])].forEach((field) => addField(field));
    section.settingFields?.forEach((setting) => addField({ ...setting, type: "select", defaultValue: setting.defaultValue ?? setting.options[0]?.value }, false));
    section.checklistItems?.forEach((item) => addField({ id: item.id, label: item.description, type: "select" }, false));
    if (section.componentType === "job-info") {
      for (const id of ["temperature", "temperatureCelsius", "tcf", "humidity"]) {
        const existing = slots.find((slot) => slot.sectionId === section.id && slot.field.id === id);
        if (existing) { existing.field = { ...existing.field, type: "number" }; existing.canCalculate = false; }
        else addField({ id, label: id, type: "number", readOnly: true }, false);
      }
    }
    if (!section.columns?.length) continue;
    const count = tableRows(section);
    if (!Number.isInteger(count) || count < 0 || count * section.columns.length > EXPRESSION_LIMITS.programNodes) {
      issues.push(issue("form.rows", `"${section.title}" has an invalid or excessive row count.`));
      continue;
    }
    if (section.allowAddRows || section.allowRemoveRows) issues.push(issue("form.dynamicRows", `"${section.title}": turn off Add/Remove Rows before enabling typed calculations. Dynamic row identity is not supported yet.`));
    const rowIds = section.calculationRowIds;
    if (!Array.isArray(rowIds) || rowIds.length !== count || rowIds.some((id) => typeof id !== "string" || !id) || new Set(rowIds).size !== rowIds.length) {
      issues.push(issue("form.rowIds", `"${section.title}" needs unique fixed row IDs matching its row count. Use Prepare typed calculations to assign IDs after a structural edit.`));
      continue;
    }
    for (let rowIndex = 0; rowIndex < count; rowIndex++) {
      for (const column of section.columns) {
        const field = column.field;
        if (!field || field.type === "temperature-humidity") {
          issues.push(issue("form.control", `"${section.title}" has an unsupported composite or missing table control.`));
          continue;
        }
        slots.push({
          id: formSlotId(section, field.id, { rowIndex, colId: column.id })!,
          label: `${section.title} / row ${rowIndex + 1} / ${column.label || column.id}`,
          sectionId: section.id, stateKey: rowStateKey(section.id, rowIndex), field, columnId: column.id, rowIndex,
          canCalculate: field.cellBehavior !== "static",
          defaultValue: field.cellBehavior === "static" ? section.staticCells?.[cellKey(rowIndex, column.id)] ?? field.staticValue ?? "" : field.defaultValue,
        });
      }
    }
  }
  const ids = new Set<string>();
  for (const slot of slots) {
    if (ids.has(slot.id)) issues.push(issue("form.duplicateSlot", `Duplicate expression field "${slot.label}".`, slot.id));
    ids.add(slot.id);
  }
  if (slots.length > EXPRESSION_LIMITS.programNodes) issues.push(issue("limit.program", "Template has too many fields for this expression engine."));
  return issues.length ? { ok: false, issues } : { ok: true, value: slots };
}

function legacySource(slot: FormExpressionSlot, section: SectionConfig): string | undefined {
  if (slot.columnId && slot.rowIndex !== undefined) {
    const override = section.cellFormulas?.[cellKey(slot.rowIndex, slot.columnId)];
    if (override?.trim()) return override;
  }
  if (slot.field.calculation?.formula?.trim()) return slot.field.calculation.formula;
  const from = slot.field.populateFrom;
  if (slot.field.cellBehavior === "populate" && from) {
    const row = from.rowIndex ?? (from.rowMode === "first" ? 0 : from.rowMode === "same" ? slot.rowIndex : undefined);
    return row === undefined ? `{${from.sectionId}.${from.fieldId}}` : `{${from.sectionId}.row${row}.${from.fieldId}}`;
  }
  return undefined;
}

/** Explicit draft-only conversion. All-or-nothing: failure returns no changed structure. */
export function prepareTypedForm(structure: CustomFormStructure, newId: () => string = () => crypto.randomUUID()): Result<CustomFormStructure> {
  if (structure.expressions !== undefined && structure.expressions?.engineVersion !== EXPRESSION_ENGINE_VERSION) {
    return { ok: false, issues: [issue("engine.unsupported", "This calculation engine version is not supported.")] };
  }
  const draft = structuredClone(structure);
  for (const section of draft.sections) {
    if (!section.columns?.length) continue;
    const count = tableRows(section);
    if (!Number.isInteger(count) || count < 0 || count * section.columns.length > EXPRESSION_LIMITS.programNodes) {
      return { ok: false, issues: [issue("form.rows", `"${section.title}" has too many or invalid rows.`)] };
    }
    section.calculationRowIds = Array.from({ length: count }, (_, index) => section.calculationRowIds?.[index] ?? section.conditionalRows?.[index]?.id ?? newId());
  }
  const listed = listFormExpressionSlots(draft);
  if (!listed.ok) return listed;
  const formulas: Record<string, string> = { ...(draft.expressions?.formulas ?? {}) };
  const issues: ExpressionIssue[] = [];
  const rows = new Map(draft.sections.map((section) => [section.id, section.calculationRowIds ?? []]));
  for (const slot of listed.value) {
    const section = draft.sections.find((entry) => entry.id === slot.sectionId)!;
    const source = legacySource(slot, section);
    if (!source) continue;
    // A legacy control edited after upgrade cannot overwrite a stable formula silently.
    if (draft.expressions !== undefined) {
      issues.push(issue("form.legacyFormula", `"${slot.label}": use the Typed calculations editor, not the legacy formula controls.`, slot.id));
      continue;
    }
    const translated = translateV1Expression(source, { sections: draft.sections, rowIdsBySection: rows, currentRowIndex: slot.rowIndex ?? 0 });
    if (translated.ok) formulas[slot.id] = translated.value.source;
    else issues.push(...translated.issues.map((entry) => ({ ...entry, calculationId: slot.id })));
  }
  if (issues.length) return { ok: false, issues };
  const clearLegacy = (field: FieldConfig): FieldConfig => {
    const { calculation, populateFrom, ...rest } = field;
    return { ...rest, cellBehavior: field.cellBehavior === "calculate" || field.cellBehavior === "populate" ? "user" : field.cellBehavior };
  };
  draft.sections = draft.sections.map((section) => ({
    ...section,
    cellFormulas: undefined,
    fields: section.fields?.map(clearLegacy),
    field: section.field ? clearLegacy(section.field) : undefined,
    aboveTableFields: section.aboveTableFields?.map(clearLegacy),
    columns: section.columns?.map((column) => ({ ...column, field: clearLegacy(column.field) })),
  }));
  draft.expressions = { engineVersion: EXPRESSION_ENGINE_VERSION, formulas };
  const compiled = compileFormExpressions(draft);
  return compiled.ok ? { ok: true, value: draft } : compiled;
}

/** Same compiler is used by publication and every document-rendering mode. */
/**
 * Lookup tables and curves the template declared, as the engine's resource
 * maps. Declared data only: a formula can never name a table the template did
 * not carry, so a published version is self-contained.
 */
export function structureResources(structure: CustomFormStructure): ExpressionResources {
  const definition = structure.expressions;
  return {
    lookups: new Map((definition?.lookups ?? []).map((table) => [table.id, table as LookupTable])),
    curves: new Map((definition?.curves ?? []).map((curve) => [curve.id, curve as InterpolationCurve])),
  };
}

export function compileFormExpressions(structure: CustomFormStructure): Result<CompiledFormExpressions | null> {
  if (structure.expressions === undefined) return { ok: true, value: null };
  const definition = structure.expressions;
  if (!definition || definition.engineVersion !== EXPRESSION_ENGINE_VERSION) return { ok: false, issues: [issue("engine.unsupported", "This report's calculation engine is not supported. It cannot fall back to legacy calculations.")] };
  if (!definition.formulas || typeof definition.formulas !== "object" || Array.isArray(definition.formulas)) return { ok: false, issues: [issue("form.formulas", "Typed formulas must be a target-to-source map.")] };
  const listed = listFormExpressionSlots(structure);
  if (!listed.ok) return listed;
  const slots = structuredClone(listed.value);
  const byId = new Map(slots.map((slot) => [slot.id, slot]));
  const formulas = Object.entries(definition.formulas);
  const calculationIds = new Set(formulas.map(([id]) => id));
  const issues: ExpressionIssue[] = [];
  for (const slot of slots) {
    const section = structure.sections.find((entry) => entry.id === slot.sectionId)!;
    if (legacySource(slot, section)) issues.push(issue("form.legacyFormula", `"${slot.label}": legacy formulas cannot run inside a typed template. Use Typed calculations.`, slot.id));
    if (slot.field.type === "calculated" && !calculationIds.has(slot.id)) issues.push(issue("form.missingFormula", `"${slot.label}" is calculated but has no typed formula.`, slot.id));
  }
  for (const [id] of formulas) {
    if (!byId.get(id)?.canCalculate) issues.push(issue("form.target", `Calculation target "${id}" is missing or cannot be calculated.`, id));
  }
  if (issues.length) return { ok: false, issues };
  const compiled = compileExpressionProgram({
    engineVersion: definition.engineVersion,
    inputs: slots.filter((slot) => !calculationIds.has(slot.id)).map((slot) => ({ id: slot.id, type: slotType(slot.field) })),
    calculations: formulas.map(([id, source]) => ({ id, source })),
    resources: structureResources(structure),
  });
  const labelIssues = (entries: ExpressionIssue[]) => entries.map((entry) => {
    const location = byId.get(entry.calculationId ?? entry.referenceId ?? "");
    return { ...entry, message: `${location?.label ?? "Calculation"}: ${entry.message}${entry.end > entry.start ? ` (characters ${entry.start + 1}–${entry.end})` : ""}` };
  });
  if (!compiled.ok) return { ok: false, issues: labelIssues(compiled.issues) };
  const program: CompiledExpressionProgram = compiled.value;
  return { ok: true, value: {
    slots, calculationIds,
    evaluate(data) {
      const inputs = new Map<string, unknown>();
      for (const slot of slots) {
        if (calculationIds.has(slot.id)) continue;
        const saved = data[slot.stateKey]?.[slot.field.id];
        // An explicitly cleared input stays blank; only absent input uses its default.
        inputs.set(slot.id, slot.field.cellBehavior === "static" ? slot.defaultValue : saved === undefined ? slot.defaultValue : saved);
      }
      const result = program.evaluate(inputs);
      return { slots, results: result.results, issues: labelIssues(result.issues) };
    },
  } };
}
