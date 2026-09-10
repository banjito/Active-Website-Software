import type { SectionConfig } from "@/lib/types/customForms";
import { getSectionReferenceCode } from "@/lib/customForms/formCellResolution";
import { expressionReferences, parseExpression } from "@/lib/customForms/expressions/parser";
import { type Result, type ExpressionIssue } from "@/lib/customForms/expressions/types";

/** No positional variant: a migrated reference must be bound to a durable id. */
export type StableExpressionReference =
  | { scope: "field"; sectionId: string; fieldId: string }
  | { scope: "cell"; tableId: string; rowId: string; columnId: string }
  | { scope: "binding"; bindingId: string };

export function expressionReferenceId(ref: StableExpressionReference): string {
  const parts = ref.scope === "field" ? ["field", ref.sectionId, ref.fieldId]
    : ref.scope === "cell" ? ["cell", ref.tableId, ref.rowId, ref.columnId]
      : ["binding", ref.bindingId];
  return parts.map(encodeURIComponent).join("/");
}

export interface V1TranslationContext {
  sections: readonly SectionConfig[];
  /** Stable ids captured from the pinned definition/instance, in V1 data-slot order. */
  rowIdsBySection: ReadonlyMap<string, readonly string[]>;
  currentRowIndex: number;
}

export interface TranslatedV1Expression {
  source: string;
  references: ReadonlyMap<string, StableExpressionReference>;
}

/**
 * An explicit upgrade helper, NOT a new interpretation of saved V1 formulas.
 * Binds C1/R2/sameRow once using the supplied snapshot. It never creates ids or
 * rewrites stored values. Strict typed semantics must be reviewed separately
 * (notably blank-as-zero and V1's comparison-prefix strings such as '<2200').
 */
export function translateV1Expression(source: string, context: V1TranslationContext): Result<TranslatedV1Expression> {
  const parsed = parseExpression(source);
  if (!parsed.ok) return parsed;
  const references = new Map<string, StableExpressionReference>();
  const replacements: Array<{ start: number; end: number; text: string }> = [];
  const issues: ExpressionIssue[] = [];
  for (const token of expressionReferences(parsed.value)) {
    const [sectionToken, second, third, ...extra] = token.id.split(".");
    const exact = context.sections.find((section) => section.id === sectionToken);
    const matches = exact ? [exact] : context.sections.filter((section) => getSectionReferenceCode(section).toLowerCase() === sectionToken.toLowerCase());
    const reject = (message: string) => issues.push({ start: token.start, end: token.end, code: "v1.reference", message, referenceId: token.id });
    if (matches.length !== 1) { reject(`Reference "${token.id}" has an unknown or ambiguous section.`); continue; }
    if (!second || extra.length) { reject(`Unsupported V1 reference "${token.id}".`); continue; }
    const section = matches[0];
    const columnMatch = second.match(/^C(\d+)$/i);
    let reference: StableExpressionReference;
    if (columnMatch || third !== undefined) {
      let rowIndex: number;
      let column;
      if (columnMatch) {
        column = section.columns?.[Number(columnMatch[1]) - 1];
        const rowMatch = third?.match(/^R(\d+)$/i);
        if (third !== undefined && !rowMatch) { reject(`Invalid V1 row in "${token.id}".`); continue; }
        rowIndex = rowMatch ? Number(rowMatch[1]) - 1 : context.currentRowIndex;
      } else {
        const rowMatch = second.match(/^row(\d+)$/i);
        if (second !== "sameRow" && !rowMatch) { reject(`Invalid V1 row in "${token.id}".`); continue; }
        rowIndex = rowMatch ? Number(rowMatch[1]) : context.currentRowIndex;
        column = section.columns?.find((entry) => (entry.field?.id ?? entry.id) === third || entry.id === third);
      }
      const rowId = Number.isInteger(rowIndex) && rowIndex >= 0 ? context.rowIdsBySection.get(section.id)?.[rowIndex] : undefined;
      if (!column || !rowId) { reject(`Reference "${token.id}" needs an existing column and persisted row id.`); continue; }
      const rowIds = context.rowIdsBySection.get(section.id)!;
      if (new Set(rowIds).size !== rowIds.length) { reject(`Section "${section.id}" has duplicate row ids.`); continue; }
      reference = { scope: "cell", tableId: section.id, rowId, columnId: column.id };
    } else {
      const fieldId = second.toUpperCase() === "TCF" && section.componentType === "job-info" ? "tcf" : second;
      const fields = [...(section.fields ?? []), ...(section.aboveTableFields ?? []), ...(section.settingFields ?? []), ...(section.field ? [section.field] : [])];
      const derivedJobField = section.componentType === "job-info" && ["temperature", "temperatureCelsius", "tcf", "humidity"].includes(fieldId);
      if (!fields.some((field) => field.id === fieldId) && !derivedJobField) { reject(`Unknown field in "${token.id}".`); continue; }
      reference = { scope: "field", sectionId: section.id, fieldId };
    }
    const id = expressionReferenceId(reference);
    references.set(id, reference);
    replacements.push({ start: token.start, end: token.end, text: `{${id}}` });
  }
  if (issues.length) return { ok: false, issues };
  let translated = source;
  // Source spans, not regex substitution: a string containing '{IR.C1}' stays text.
  for (const replacement of replacements.sort((a, b) => b.start - a.start)) {
    translated = translated.slice(0, replacement.start) + replacement.text + translated.slice(replacement.end);
  }
  return { ok: true, value: { source: translated, references } };
}
