import React from "react";
import type { CustomFormStructure } from "@/lib/types/customForms";
import type { SectionChrome } from "@/lib/customForms/runtime";
import { compileFormExpressions, formSlotId } from "@/lib/customForms/expressions/form-program";
import type { ExpressionIssue } from "@/lib/customForms/expressions/types";

const ERROR_CLASS = "block whitespace-normal break-words border border-red-300 bg-red-50 p-2 text-xs text-red-900 dark:border-red-700 dark:bg-red-950 dark:text-red-200 rounded-none print:border-black print:bg-white print:text-black";

/** No per-mode formula implementation: preview, fill, read-only and print wrap the same chrome. */
export function useExpressionChrome(structure: CustomFormStructure, chrome: SectionChrome): { chrome: SectionChrome; issues: ExpressionIssue[] } {
  const compiled = React.useMemo(() => compileFormExpressions(structure), [structure]);
  const values = chrome.conditionValues?.() ?? {};
  const evaluated = React.useMemo(() => compiled.ok ? compiled.value?.evaluate(values) : undefined, [compiled, values]);
  if (compiled.ok && !compiled.value) return { chrome, issues: [] };
  if (!compiled.ok) return {
    issues: compiled.issues,
    chrome: { ...chrome, renderControl: () => <span className={ERROR_CLASS}>Calculation setup error — see report warnings.</span> },
  };
  const program = compiled.value!;
  const byId = new Map(program.slots.map((slot) => [slot.id, slot]));
  const conditionValues = { ...values };
  for (const slot of program.slots) {
    const result = evaluated?.results.get(slot.id);
    conditionValues[slot.stateKey] = { ...conditionValues[slot.stateKey], [slot.field.id]: result?.ok ? result.value : null };
    if (slot.columnId) conditionValues[slot.stateKey][slot.columnId] = result?.ok ? result.value : null;
  }
  return {
    issues: evaluated?.issues ?? [],
    chrome: {
      ...chrome,
      conditionValues: () => conditionValues,
      renderControl(slot) {
        const id = formSlotId(slot.section, slot.field.id, slot.cell);
        const source = id ? byId.get(id) : undefined;
        if (!source || !id) return chrome.renderControl(slot);
        const result = evaluated?.results.get(id);
        if (program.calculationIds.has(id)) {
          if (result && !result.ok) return <span role="alert" className={ERROR_CLASS}>Calculation error: {result.issues[0].message}</span>;
          const value = result?.ok ? result.value : null;
          return <span data-expression-target={id} className="block min-h-6 whitespace-pre-wrap break-words px-2 py-1.5 text-sm text-neutral-900 dark:text-white print:text-black print:whitespace-normal">{value === null ? "—" : Array.isArray(value) ? value.join(", ") : String(value)}</span>;
        }
        // V1 data uses field.id, which need not equal the V2 column.id shim.
        const input = chrome.renderControl({ ...slot, field: { ...source.field, readOnly: slot.readOnly || source.field.readOnly }, ...(slot.cell ? { cell: { ...slot.cell, column: { ...slot.cell.column, field: source.field } } } : {}) });
        return result && !result.ok ? <>{input}<span role="alert" className={ERROR_CLASS}>{result.issues[0].message}</span></> : input;
      },
    },
  };
}

export const ExpressionDiagnostics: React.FC<{ issues: ExpressionIssue[] }> = ({ issues }) => issues.length ? (
  <div role="alert" className={`${ERROR_CLASS} mb-4 print:break-inside-avoid`}>
    <strong>Calculation errors — do not approve or publish this report.</strong>
    <ul className="mt-1 list-disc pl-4">{issues.map((entry, index) => <li key={`${entry.calculationId ?? entry.referenceId}-${index}`}>{entry.message}</li>)}</ul>
  </div>
) : null;
