import React from "react";
import type { CustomFormStructure } from "@/lib/types/customForms";
import { listFormExpressionSlots, prepareTypedForm } from "@/lib/customForms/expressions/form-program";
import type { ExpressionIssue } from "@/lib/customForms/expressions/types";
import { Button } from "@/components/ui/Button";

interface Props {
  structure: CustomFormStructure;
  onChange: (structure: CustomFormStructure) => void;
}

const INPUT = "w-full rounded-none border border-neutral-300 bg-white p-2 text-sm text-neutral-900 dark:border-neutral-600 dark:bg-dark-150 dark:text-white focus:outline-none focus:ring-1 focus:ring-brand";

/** Explicit draft upgrade and stable-reference authoring; publication remains a separate action. */
export const TypedCalculationEditor: React.FC<Props> = ({ structure, onChange }) => {
  const [confirmed, setConfirmed] = React.useState(false);
  const [selected, setSelected] = React.useState("");
  const [errors, setErrors] = React.useState<ExpressionIssue[]>([]);
  const active = structure.expressions !== undefined;
  const listed = React.useMemo(() => active ? listFormExpressionSlots(structure) : null, [structure, active]);
  const slots = listed?.ok ? listed.value : [];
  const formulaIds = Object.keys(structure.expressions?.formulas ?? {});
  const targets = slots.filter((slot) => slot.canCalculate);
  const orphanIds = formulaIds.filter((id) => !targets.some((slot) => slot.id === id));
  const id = selected || formulaIds[0] || targets[0]?.id || "";
  const source = structure.expressions?.formulas?.[id] ?? "";
  const updateSource = (value: string) => {
    if (!structure.expressions || !id) return;
    const formulas = { ...structure.expressions.formulas };
    if (value.trim()) formulas[id] = value;
    else delete formulas[id];
    onChange({ ...structure, expressions: { ...structure.expressions, formulas } });
  };
  const prepare = () => {
    try {
      const result = prepareTypedForm(structure);
      if (!result.ok) { setErrors(result.issues); return; }
      setErrors([]);
      onChange(result.value);
    } catch (error) {
      setErrors([{ code: "prepare.error", message: error instanceof Error ? error.message : "Could not prepare typed calculations.", start: 0, end: 0 }]);
    }
  };

  return (
    <details className="border-b border-neutral-200 bg-white px-4 py-3 text-sm dark:border-neutral-700 dark:bg-dark-150 print:hidden">
      <summary className="cursor-pointer font-medium text-neutral-900 dark:text-white">Typed calculations {active ? `(${structure.expressions?.engineVersion ?? "unsupported"})` : "(opt-in)"}</summary>
      <div className="mt-3 space-y-3">
        <p className="text-xs text-neutral-600 dark:text-neutral-300">
          Fixed-row templates only. Blanks stay missing, invalid inputs show errors, and calculated values cannot be manually overridden.
          This changes the draft only. Save and publish a new version after checking the results. Existing version-pinned reports are unchanged.
        </p>
        {!active && <label className="flex items-start gap-2 text-xs text-neutral-700 dark:text-neutral-200">
          <input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} className="rounded-none" />
          I understand that blank-as-zero behavior and saved overrides will not carry into the new engine.
        </label>}
        <Button type="button" variant="outline" size="sm" className="rounded-none" disabled={!active && !confirmed} onClick={prepare}>Prepare typed calculations</Button>
        {active && <p className="text-xs text-neutral-500 dark:text-neutral-400">After adding or removing fixed rows in the draft, prepare again to assign IDs. Missing targets and references must be corrected before publication.</p>}
        {errors.length > 0 && <ul role="alert" className="list-disc pl-4 text-xs text-red-700 dark:text-red-300">{errors.map((entry, index) => <li key={index}>{entry.message}</li>)}</ul>}
        {active && <>
          <label className="block text-neutral-700 dark:text-neutral-200">Calculated field or cell
            <select value={id} onChange={(event) => setSelected(event.target.value)} className={`${INPUT} mt-1`}>
              {!targets.length && !orphanIds.length && <option value="">Add fields to the template first</option>}
              {targets.map((slot) => <option key={slot.id} value={slot.id}>{slot.label}</option>)}
              {orphanIds.map((target) => <option key={target} value={target}>Missing target: {target}</option>)}
            </select>
          </label>
          {id && <>
            <label className="block text-neutral-700 dark:text-neutral-200">Formula
              <textarea value={source} onChange={(event) => updateSource(event.target.value)} rows={3} spellCheck={false} className={`${INPUT} mt-1 font-mono`} placeholder={'Example: if({field/section-id/reading} > 10, "PASS", "FAIL")'} />
            </label>
            <label className="block text-neutral-700 dark:text-neutral-200">Insert a stable reference
              <select value="" onChange={(event) => { if (event.target.value) updateSource(`${source}{${event.target.value}}`); }} className={`${INPUT} mt-1`}>
                <option value="">Choose a field or cell…</option>
                {slots.map((slot) => <option key={slot.id} value={slot.id}>{slot.label}</option>)}
              </select>
            </label>
            <p className="text-xs text-neutral-500 dark:text-neutral-400">References are inserted at the end. Use numeric input types for math. Supported: if, coalesce, isNull, min, max, avg, sum, abs, sqrt, round and concat. Clear the formula to return a normal input to manual entry.</p>
          </>}
        </>}
      </div>
    </details>
  );
};
