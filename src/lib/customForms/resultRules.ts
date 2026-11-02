/**
 * Pass/fail result rules.
 *
 * A result column compares a reading with a limit and shows PASS, FAIL or
 * LIMITED SERVICE, the way the hard-coded reports judge their readings. The
 * builder stores the rule as plain settings (`field.resultRule`) and compiles
 * it to an ordinary formula (`field.calculation.formula`), so the existing
 * formula engine, previews, print and the V2 renderer all work unchanged.
 *
 * Every operand is a formula fragment: a number ("100"), a reference
 * ("{IR.C3}") or an expression (`lookup("neta.table100_1", {JD.voltage}, "min")`).
 * A blank reading or limit gives a blank result, never FAIL: "not measured" is
 * not "measured and wrong".
 */

import type { CustomFormStructure, FieldConfig, SectionConfig } from '@/lib/types/customForms';
import { getCellValue } from '@/lib/customForms/formCellResolution';
import { resolveRowCount, rowStateKey } from '@/lib/customForms/runtime/layout';

export type ResultTest = 'atLeast' | 'atMost' | 'between' | 'withinPercent';

export interface ResultRule {
  /** The reading being judged. */
  reading: string;
  test: ResultTest;
  /** atLeast: the minimum. atMost: the maximum. between: the low end. withinPercent: the nominal. */
  limit?: string;
  /** between: the high end. */
  limitHigh?: string;
  /** withinPercent: allowed deviation either side of nominal, in percent. */
  percent?: number;
  /**
   * Optional LIMITED SERVICE band (atLeast / atMost only). For atLeast, a
   * reading below `limit` but at or above this is LIMITED SERVICE; for atMost,
   * above `limit` but at or below this.
   */
  limitedLimit?: string;
  passText?: string;
  failText?: string;
  limitedText?: string;
  /**
   * Compare in this unit (e.g. "MΩ"). Readings and limits that are plain
   * references are converted into it from the unit they were entered in;
   * typed numbers are taken as already in it.
   */
  unit?: string;
}

export const DEFAULT_RESULT_TEXT = {
  pass: 'PASS',
  fail: 'FAIL',
  limited: 'LIMITED SERVICE',
} as const;

export const RESULT_TEST_LABELS: Record<ResultTest, string> = {
  atLeast: 'Reading ≥ minimum',
  atMost: 'Reading ≤ maximum',
  between: 'Reading between low and high',
  withinPercent: 'Within ± % of nominal',
};

const op = (text: string | undefined) => `(${(text ?? '').trim()})`;

/** "{IR.C3}" → "{IR.C3 in MΩ}" (only a plain reference without a unit of its own). */
function inUnit(text: string | undefined, unit: string | undefined): string | undefined {
  if (!unit || !text) return text;
  const m = text.trim().match(/^\{([^}]+)\}$/);
  if (!m || /\s+in\s+\S+\s*$/i.test(m[1])) return text;
  return `{${m[1].trim()} in ${unit}}`;
}
const has = (text: string | undefined) => !!text && text.trim() !== '';
const str = (text: string) => JSON.stringify(text);

/** The formula a rule stands for, or "" while it is incomplete. */
export function compileResultRule(rule: ResultRule): string {
  const pass = str(rule.passText || DEFAULT_RESULT_TEXT.pass);
  const fail = str(rule.failText || DEFAULT_RESULT_TEXT.fail);
  const limited = str(rule.limitedText || DEFAULT_RESULT_TEXT.limited);
  if (!has(rule.reading) || !has(rule.limit)) return '';
  const u = rule.unit;
  const R = op(inUnit(rule.reading, u));
  const L = op(inUnit(rule.limit, u));

  switch (rule.test) {
    case 'atLeast':
    case 'atMost': {
      const cmp = rule.test === 'atLeast' ? '>=' : '<=';
      const below = has(rule.limitedLimit)
        ? `if(${R} ${cmp} ${op(inUnit(rule.limitedLimit, u))}, ${limited}, ${fail})`
        : fail;
      return `if(isnull(${R}) or isnull(${L}), null, if(${R} ${cmp} ${L}, ${pass}, ${below}))`;
    }
    case 'between': {
      if (!has(rule.limitHigh)) return '';
      const H = op(inUnit(rule.limitHigh, u));
      return `if(isnull(${R}) or isnull(${L}) or isnull(${H}), null, if(${R} >= ${L} and ${R} <= ${H}, ${pass}, ${fail}))`;
    }
    case 'withinPercent': {
      const p = Number(rule.percent);
      if (!Number.isFinite(p)) return '';
      return `if(isnull(${R}) or isnull(${L}), null, if(abs(${R} - ${L}) <= abs(${L}) * ${p} / 100, ${pass}, ${fail}))`;
    }
  }
}

/** The field settings for a result column using this rule. */
export function resultRuleField(field: FieldConfig, rule: ResultRule): FieldConfig {
  return {
    ...field,
    resultRule: rule,
    cellBehavior: 'calculate',
    readOnly: true,
    populateFrom: undefined,
    calculation: { formula: compileResultRule(rule), dependsOn: field.calculation?.dependsOn ?? [] },
  };
}

export type ResultTone = 'pass' | 'fail' | 'limited';

/** How a shown value reads as a result, if it is one. */
export function resultTone(value: unknown): ResultTone | null {
  if (typeof value !== 'string') return null;
  const v = value.trim().toUpperCase();
  if (!v) return null;
  if (v === 'PASS' || v === 'SATISFACTORY' || v === 'ACCEPTABLE') return 'pass';
  if (v === 'FAIL' || v === 'UNSATISFACTORY' || v === 'UNACCEPTABLE') return 'fail';
  if (v === 'LIMITED SERVICE' || v === 'LIMITED' || v === 'INVESTIGATE') return 'limited';
  return null;
}

export type ReportStatus = 'PASS' | 'FAIL' | 'LIMITED SERVICE';

/** The worst of a set of results: any FAIL fails, then any LIMITED SERVICE. */
export function worstResult(values: readonly unknown[]): ReportStatus | null {
  let worst: ReportStatus | null = null;
  for (const value of values) {
    const tone = resultTone(value);
    if (tone === 'fail') return 'FAIL';
    if (tone === 'limited') worst = 'LIMITED SERVICE';
    else if (tone === 'pass' && !worst) worst = 'PASS';
  }
  return worst;
}

/** True when the template has at least one pass/fail result column. */
export function hasResultColumns(structure: CustomFormStructure): boolean {
  return structure.sections.some((s) => (s.columns ?? []).some((c) => c.field.resultRule));
}

/** Every result-column value in a filled form, for the report's status box. */
export function collectFormResults(
  structure: CustomFormStructure,
  formData: Record<string, Record<string, any>>,
): string[] {
  const sections: SectionConfig[] = structure.sections;
  const out: string[] = [];
  for (const section of sections) {
    const resultColumns = (section.columns ?? []).filter((c) => c.field.resultRule);
    if (!resultColumns.length) continue;
    const rows = section.conditionalRows?.length ?? resolveRowCount(section);
    for (let r = 0; r < rows; r++) {
      for (const column of resultColumns) {
        const value = getCellValue(
          formData,
          column.field,
          rowStateKey(section.id, r),
          section.id,
          r,
          sections,
          section.cellFormulas,
          column.id,
        );
        if (value !== '' && value != null) out.push(String(value));
      }
    }
  }
  return out;
}
