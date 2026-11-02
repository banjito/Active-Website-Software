/**
 * Result rule editor: set up a pass/fail column without writing a formula.
 *
 * Pick the reading (usually another column in the same row), the test
 * (minimum, maximum, between, ± %), and the limit: a number, another column,
 * or a value from a shared lookup table. An optional LIMITED SERVICE band
 * sits between PASS and FAIL.
 */

import React from "react";
import type { SectionConfig } from "@/lib/types/customForms";
import { getSectionReferenceCode } from "@/lib/customForms/formCellResolution";
import {
  DEFAULT_RESULT_TEXT,
  RESULT_TEST_LABELS,
  compileResultRule,
  type ResultRule,
  type ResultTest,
} from "@/lib/customForms/resultRules";
import { useLookupTables } from "@/lib/customForms/lookupLibrary";
import { UNIT_CHOICES } from "@/lib/customForms/unitResolution";

const box =
  "h-7 px-2 text-xs bg-white dark:bg-dark-150 border border-neutral-300 dark:border-neutral-700 rounded-none focus:outline-none focus:ring-1 focus:ring-brand text-neutral-900 dark:text-white";

export const DEFAULT_RESULT_RULE: ResultRule = { reading: "", test: "atLeast", limit: "" };

/**
 * One value in a rule: typed (a number or formula) or picked from this row's
 * columns or a lookup table.
 */
const Operand: React.FC<{
  label: string;
  value: string | undefined;
  onChange: (next: string) => void;
  section: SectionConfig;
  excludeColumnId?: string;
  placeholder?: string;
  width?: string;
}> = ({ label, value, onChange, section, excludeColumnId, placeholder, width = "w-44" }) => {
  const { tables } = useLookupTables();
  const code = getSectionReferenceCode(section);
  const columns = (section.columns ?? [])
    .map((c, i) => ({ c, ref: `{${code}.C${i + 1}}` }))
    .filter(({ c }) => c.id !== excludeColumnId);
  return (
    <span className="inline-flex items-center gap-1">
      <span className="text-[11px] text-neutral-500 dark:text-neutral-400">{label}</span>
      <input
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        title="A number, a reference like {IR.C3}, or a formula"
        className={`${box} ${width} font-mono`}
      />
      <select
        value=""
        onChange={(e) => {
          const v = e.target.value;
          if (!v) return;
          if (v.startsWith("lookup:")) {
            const [id, column] = v.slice(7).split("|");
            onChange(`lookup("${id}", {?}${column ? `, "${column}"` : ""})`);
          } else onChange(v);
        }}
        className={`${box} w-16`}
        title="Pick a column in this row, or a lookup table"
      >
        <option value="">Pick…</option>
        <optgroup label="This row">
          {columns.map(({ c, ref }) => (
            <option key={c.id} value={ref}>
              {c.label || ref}
            </option>
          ))}
        </optgroup>
        {tables.map((t) => (
          <optgroup key={t.id} label={`Lookup: ${t.name}${t.engineeringVerified ? "" : " (unverified)"}`}>
            <option value={`lookup:${t.id}`}>{t.valueLabel || "Value"}</option>
            {(t.columns ?? []).map((col) => (
              <option key={col} value={`lookup:${t.id}|${col}`}>
                {col}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
    </span>
  );
};

export const ResultRuleEditor: React.FC<{
  section: SectionConfig;
  /** The result column itself (left out of the reading choices). */
  columnId?: string;
  rule: ResultRule;
  onChange: (rule: ResultRule) => void;
}> = ({ section, columnId, rule, onChange }) => {
  const set = (patch: Partial<ResultRule>) => onChange({ ...rule, ...patch });
  const banded = rule.test === "atLeast" || rule.test === "atMost";
  const incomplete = !compileResultRule(rule);
  const hasLookupPlaceholder = [rule.reading, rule.limit, rule.limitHigh, rule.limitedLimit].some((v) =>
    v?.includes("{?}"),
  );

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
      <Operand
        label="Reading"
        value={rule.reading}
        onChange={(reading) => set({ reading })}
        section={section}
        excludeColumnId={columnId}
        placeholder="{IR.C3}"
      />
      <select
        value={rule.test}
        onChange={(e) => set({ test: e.target.value as ResultTest })}
        className={`${box} w-48`}
      >
        {(Object.keys(RESULT_TEST_LABELS) as ResultTest[]).map((t) => (
          <option key={t} value={t}>
            {RESULT_TEST_LABELS[t]}
          </option>
        ))}
      </select>
      <Operand
        label={
          rule.test === "atLeast"
            ? "Minimum"
            : rule.test === "atMost"
              ? "Maximum"
              : rule.test === "between"
                ? "Low"
                : "Nominal"
        }
        value={rule.limit}
        onChange={(limit) => set({ limit })}
        section={section}
        excludeColumnId={columnId}
        placeholder="100"
      />
      {rule.test === "between" && (
        <Operand
          label="High"
          value={rule.limitHigh}
          onChange={(limitHigh) => set({ limitHigh })}
          section={section}
          excludeColumnId={columnId}
          placeholder="200"
        />
      )}
      {rule.test === "withinPercent" && (
        <span className="inline-flex items-center gap-1 text-[11px] text-neutral-500">
          ±
          <input
            type="number"
            value={rule.percent ?? ""}
            onChange={(e) => set({ percent: e.target.value === "" ? undefined : Number(e.target.value) })}
            className={`${box} w-16`}
          />
          %
        </span>
      )}
      <label
        className="inline-flex items-center gap-1 text-[11px] text-neutral-500 dark:text-neutral-400"
        title="Readings and limits picked from columns are converted into this unit first (e.g. a 1.2 GΩ reading counts as 1200 MΩ). Typed numbers are taken as already in it."
      >
        Compare in
        <select
          value={rule.unit ?? ""}
          onChange={(e) => set({ unit: e.target.value || undefined })}
          className={`${box} w-20`}
        >
          <option value="">as entered</option>
          {UNIT_CHOICES.map((g) => (
            <optgroup key={g.kind} label={g.kind}>
              {g.units.map((u) => (
                <option key={u} value={u}>
                  {u}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </label>
      {banded && (
        <Operand
          label={rule.test === "atLeast" ? "Limited service from" : "Limited service up to"}
          value={rule.limitedLimit}
          onChange={(limitedLimit) => set({ limitedLimit: limitedLimit || undefined })}
          section={section}
          excludeColumnId={columnId}
          placeholder="optional"
          width="w-28"
        />
      )}
      <span className="inline-flex items-center gap-1 text-[11px] text-neutral-500">
        Shows
        {(
          [
            ["passText", DEFAULT_RESULT_TEXT.pass],
            ["failText", DEFAULT_RESULT_TEXT.fail],
            ...(banded && rule.limitedLimit ? [["limitedText", DEFAULT_RESULT_TEXT.limited]] : []),
          ] as [keyof ResultRule, string][]
        ).map(([key, fallback]) => (
          <input
            key={key}
            value={(rule[key] as string) ?? ""}
            onChange={(e) => set({ [key]: e.target.value || undefined } as Partial<ResultRule>)}
            placeholder={fallback}
            title={`Text shown for ${fallback}`}
            className={`${box} w-20`}
          />
        ))}
      </span>
      {(incomplete || hasLookupPlaceholder) && (
        <span className="basis-full text-[11px] text-amber-600 dark:text-amber-400">
          {incomplete
            ? "Fill in the reading and limit to switch the rule on."
            : "Replace {?} with the cell or field holding the lookup key (e.g. {JD.voltage})."}
        </span>
      )}
    </div>
  );
};

export default ResultRuleEditor;
