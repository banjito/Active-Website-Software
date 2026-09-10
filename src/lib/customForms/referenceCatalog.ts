/**
 * Every reference a formula can name, as a list a person can pick from.
 *
 * The builder previously asked authors to type `{IR.C2.R1}` from memory. That
 * is not something a non-developer can be expected to know, and a typo yields a
 * blank cell rather than an error, so it fails quietly. This produces the
 * catalogue the formula editor offers instead.
 *
 * References follow the legacy addressing that published templates already use:
 * a section's reference code, then either a field id or a column and row.
 */

import type { SectionConfig } from "@/lib/types/customForms";
import { getSectionReferenceCode } from "./formCellResolution";
import { classifySection } from "./runtime/sectionKind";
import { resolveRowCount } from "./runtime/layout";
import { ComponentType } from "@/lib/types/customForms";
import { parseExpression } from "./expressions/parser";
import { inferNode } from "./expressions/semantics";
import { ExpressionFailure, type ExpressionIssue } from "./expressions/types";

export interface ReferenceEntry {
  /** What gets inserted, braces included. */
  insert: string;
  /** What the author reads in the list. */
  label: string;
  /** Where it comes from, for grouping. */
  sectionTitle: string;
  sectionId: string;
  /** Plain-language explanation. */
  description: string;
  kind: "field" | "column" | "cell" | "derived";
}

/** How many specific rows to offer per column before it gets unhelpful. */
const MAX_ROW_REFERENCES = 6;

export function listReferences(
  sections: readonly SectionConfig[],
): ReferenceEntry[] {
  const entries: ReferenceEntry[] = [];

  for (const section of sections) {
    const code = getSectionReferenceCode(section);
    const title = section.title || section.id;
    const kind = classifySection(section);

    const push = (
      insert: string,
      label: string,
      description: string,
      entryKind: ReferenceEntry["kind"],
    ) =>
      entries.push({
        insert,
        label,
        description,
        kind: entryKind,
        sectionTitle: title,
        sectionId: section.id,
      });

    // Grouped and single fields.
    for (const field of [
      ...(section.fields ?? []),
      ...(section.aboveTableFields ?? []),
      ...(section.field ? [section.field] : []),
    ]) {
      push(
        `{${code}.${field.id}}`,
        field.label || field.id,
        `${title}: the ${field.label || field.id} field.`,
        "field",
      );
    }

    // Settings dropdowns.
    for (const setting of section.settingFields ?? []) {
      push(
        `{${code}.${setting.id}}`,
        `${setting.label} (setting)`,
        `${title}: which option the ${setting.label} dropdown is on.`,
        "field",
      );
    }

    // Job info derives these; they are addressable but not declared fields.
    if (section.componentType === ComponentType.JOB_INFO) {
      push(
        `{${code}.tcf}`,
        "Temperature correction factor",
        `${title}: the TCF derived from the temperature reading. The usual way to correct a resistance.`,
        "derived",
      );
      push(
        `{${code}.temperatureCelsius}`,
        "Temperature (°C)",
        `${title}: the Celsius reading, derived from the Fahrenheit entry.`,
        "derived",
      );
      push(
        `{${code}.humidity}`,
        "Humidity (%)",
        `${title}: the humidity reading.`,
        "derived",
      );
    }

    // Table columns: same-row, then a few specific rows.
    const columns = section.columns ?? [];
    const rowCount =
      kind === "conditional-table"
        ? (section.conditionalRows?.length ?? 0)
        : resolveRowCount(section);

    columns.forEach((column, index) => {
      const number = index + 1;
      push(
        `{${code}.C${number}}`,
        `${column.label || column.id} (same row)`,
        `${title}: the ${column.label || column.id} column, in whichever row the formula is in. This is usually what you want.`,
        "column",
      );

      for (let row = 1; row <= Math.min(rowCount, MAX_ROW_REFERENCES); row += 1) {
        push(
          `{${code}.C${number}.R${row}}`,
          `${column.label || column.id}, row ${row}`,
          `${title}: the ${column.label || column.id} column in row ${row} specifically.`,
          "cell",
        );
      }
    });

    // Checklist results.
    for (const item of section.checklistItems ?? []) {
      push(
        `{${code}.${item.id}}`,
        item.description,
        `${title}: the result chosen for "${item.description}".`,
        "field",
      );
    }
  }

  return entries;
}

/** The catalogue grouped by section, in document order. */
export function groupReferences(
  entries: readonly ReferenceEntry[],
): Array<{ sectionId: string; sectionTitle: string; entries: ReferenceEntry[] }> {
  const groups: Array<{
    sectionId: string;
    sectionTitle: string;
    entries: ReferenceEntry[];
  }> = [];
  for (const entry of entries) {
    let group = groups.find((candidate) => candidate.sectionId === entry.sectionId);
    if (!group) {
      group = {
        sectionId: entry.sectionId,
        sectionTitle: entry.sectionTitle,
        entries: [],
      };
      groups.push(group);
    }
    group.entries.push(entry);
  }
  return groups;
}

/** Free-text filter across label, insert text and description. */
export function filterReferences(
  entries: readonly ReferenceEntry[],
  query: string,
): ReferenceEntry[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return [...entries];
  return entries.filter(
    (entry) =>
      entry.label.toLowerCase().includes(needle) ||
      entry.insert.toLowerCase().includes(needle) ||
      entry.sectionTitle.toLowerCase().includes(needle),
  );
}

// ---------------------------------------------------------------------------
// Formula checking for the editor
// ---------------------------------------------------------------------------

export interface FormulaProblem {
  message: string;
  /** Character offsets into the formula, for pointing at the mistake. */
  start: number;
  end: number;
}

const REFERENCE_PATTERN = /\{([^{}]*)\}/g;

/**
 * Check a legacy formula as the author types.
 *
 * Deliberately forgiving: this runs on every keystroke, so a half-typed
 * formula must not shout. It reports the two mistakes that actually cost
 * people time, an unbalanced brace and a reference that names nothing.
 */
export function checkFormula(
  source: string,
  known: readonly ReferenceEntry[],
): FormulaProblem[] {
  const problems: FormulaProblem[] = [];
  if (!source.trim()) return problems;

  const opens = (source.match(/\{/g) ?? []).length;
  const closes = (source.match(/\}/g) ?? []).length;
  if (opens !== closes) {
    problems.push({
      message:
        opens > closes
          ? "A reference is missing its closing brace."
          : "There is a closing brace with no opening one.",
      start: 0,
      end: source.length,
    });
    return problems;
  }

  const valid = new Set(known.map((entry) => entry.insert));
  REFERENCE_PATTERN.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = REFERENCE_PATTERN.exec(source)) !== null) {
    const whole = match[0];
    const inner = match[1].trim();
    if (!inner) {
      problems.push({
        message: "Empty reference.",
        start: match.index,
        end: match.index + whole.length,
      });
      continue;
    }
    if (valid.has(whole) || valid.has(`{${inner}}`)) continue;
    problems.push({
      message: `Nothing in this template is called ${whole}. Pick one from the list.`,
      start: match.index,
      end: match.index + whole.length,
    });
  }
  if (problems.length) return problems;

  const syntax = checkFormulaSyntax(source);
  if (syntax) problems.push(syntax);
  return problems;
}

/**
 * Check the formula the way the form will run it. At run time every reference
 * is replaced by a number before the formula is evaluated, so the same is done
 * here, padded to the reference's length so a problem's position still points
 * at the right characters.
 */
function checkFormulaSyntax(source: string): FormulaProblem | null {
  const leadingEquals = source.match(/^\s*=/);
  if (leadingEquals) {
    return {
      message: 'Leave out the "=" at the start. Formulas here begin with the value itself.',
      start: leadingEquals.index! + leadingEquals[0].length - 1,
      end: leadingEquals[0].length,
    };
  }
  const singleQuote = source.indexOf("'");
  if (singleQuote >= 0) {
    return {
      message: 'Put text in double quotes, like "PASS".',
      start: singleQuote,
      end: singleQuote + 1,
    };
  }

  const numeric = source.replace(/\{[^{}]*\}/g, (ref) => "1".padEnd(ref.length, " "));
  const parsed = parseExpression(numeric);
  if (!parsed.ok) return toProblem(parsed.issues[0], source);
  try {
    inferNode(parsed.value, () => "number");
  } catch (error) {
    if (error instanceof ExpressionFailure) return toProblem(error.issue, source);
    throw error;
  }
  return null;
}

function toProblem(issue: ExpressionIssue, source: string): FormulaProblem {
  const lone = source.slice(issue.start, issue.end).trim();
  const message =
    issue.code === "syntax.character" && lone === "="
      ? 'Use "==" to compare two values, e.g. {IR.C1} == 0.'
      : issue.message;
  return { message, start: issue.start, end: Math.max(issue.end, issue.start + 1) };
}
