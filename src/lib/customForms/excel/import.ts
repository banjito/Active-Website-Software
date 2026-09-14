/**
 * Excel workbook to form template.
 *
 * Three parts, and only the middle one is a model:
 *
 * 1. `readExcelWorkbook` parses the file locally and never calculates anything.
 * 2. The edge function proposes a LAYOUT and a map from workbook cells to form
 *    fields. It is forbidden to write formulas, defaults or cached values.
 * 3. This module translates the workbook's own formulas deterministically with
 *    `translateExcelFormula`, then checks each result against Excel's cached
 *    value and records what it could not verify.
 *
 * The model never decides what a number means. Where translation or the type
 * check fails, the calculation is dropped and the field is left for a person to
 * fill in, which is visible in the review rather than silent.
 *
 * Nothing here certifies a workbook. `ExcelImportReview.reviewed` records only
 * that a person looked at these findings.
 */

import type {
  CustomFormStructure,
  CustomFormTemplate,
  FieldConfig,
  SectionConfig,
} from "@/lib/types/customForms";
import { ComponentType, FieldType } from "@/lib/types/customForms";
import {
  compileFormExpressions,
  formSlotId,
  listFormExpressionSlots,
  type FormExpressionSlot,
} from "@/lib/customForms/expressions/form-program";
import { resolveRowCount } from "@/lib/customForms/runtime/layout";
import { translateExcelFormula } from "@/lib/customForms/excel/formulas";
import type {
  ExcelCell,
  ExcelCellMapping,
  ExcelFormulaReview,
  ExcelGenerationResponse,
  ExcelImportDraft,
  ExcelImportIssue,
  ExcelScalar,
  ExcelSourceMap,
  ExcelWorkbookAnalysis,
} from "@/lib/customForms/excel/types";

/** Compile is retried after dropping rejected calculations; this bounds that loop. */
const MAX_COMPILE_ATTEMPTS = 8;
/** Cached results are compared to this relative tolerance, never for equality of floats. */
const COMPARISON_TOLERANCE = 1e-9;

function sourceKey(sheet: string, cell: string): string {
  return `${sheet}!${cell}`;
}

function findSection(structure: CustomFormStructure, id: string): SectionConfig | undefined {
  return structure.sections.find((section) => section.id === id);
}

/** The field a mapping points at, whether it is a table column or a plain field. */
function mappedField(section: SectionConfig, mapping: ExcelCellMapping): FieldConfig | undefined {
  if (mapping.columnId) {
    return section.columns?.find((column) => column.id === mapping.columnId)?.field;
  }
  const fields = [
    ...(section.fields ?? []),
    ...(section.aboveTableFields ?? []),
    ...(section.field ? [section.field] : []),
  ];
  return fields.find((field) => field.id === mapping.fieldId);
}

function columnLetters(column: number): string {
  let letters = "";
  for (let value = column; value > 0; value = Math.floor((value - 1) / 26)) {
    letters = String.fromCharCode(65 + ((value - 1) % 26)) + letters;
  }
  return letters;
}

function parseAddress(address: string): { column: number; row: number } | null {
  const match = /^([A-Z]{1,3})([1-9][0-9]{0,6})$/.exec(address.trim().toUpperCase());
  if (!match) return null;
  let column = 0;
  for (const letter of match[1]) column = column * 26 + letter.charCodeAt(0) - 64;
  return { column, row: Number(match[2]) };
}

/**
 * Expand the model's ranges into one mapping per cell.
 *
 * The model says which rectangle a table came from; which cells inside it are
 * readings and which are calculations is read from the workbook, not asked for.
 * That keeps the answer small enough to fit the output limit, and takes a whole
 * class of per-cell mistake away from the model.
 */
/**
 * How far apart a table's data rows are on the sheet.
 *
 * A row of a form drawn in Excel is often several sheet rows tall, merged into
 * one. Stepping by one row would then read blank cells between the real ones.
 * The merge that starts at a column's first data cell says how tall a row is.
 */
function rowStep(sheet: ExcelWorkbookAnalysis["sheets"][number], anchors: readonly string[]): number {
  let step = 1;
  for (const merge of sheet.merges) {
    const [from, to] = merge.split(":");
    const start = parseAddress(from ?? "");
    const end = parseAddress(to ?? from ?? "");
    if (!start || !end) continue;
    if (!anchors.includes(`${columnLetters(start.column)}${start.row}`)) continue;
    step = Math.max(step, end.row - start.row + 1);
  }
  return step;
}

export function deriveMappings(
  structure: CustomFormStructure,
  workbook: ExcelWorkbookAnalysis,
  sources: readonly ExcelSourceMap[],
  issues: ExcelImportIssue[],
): ExcelCellMapping[] {
  const cells = new Map<string, ExcelCell>();
  for (const sheet of workbook.sheets) {
    for (const cell of sheet.cells) cells.set(sourceKey(sheet.name, cell.address), cell);
  }
  const sheetNames = new Set(workbook.sheets.map((sheet) => sheet.name));
  const mappings: ExcelCellMapping[] = [];
  const taken = new Set<string>();

  const add = (mapping: ExcelCellMapping) => {
    const key = sourceKey(mapping.sheet, mapping.cell);
    if (taken.has(key)) {
      issues.push({
        code: "DUPLICATE_SOURCE",
        message: "This cell was claimed by two sections; only the first was used.",
        sheet: mapping.sheet,
        cell: mapping.cell,
      });
      return;
    }
    taken.add(key);
    // A cell that carries a formula is a calculation; everything else is
    // something a technician types. The workbook decides, not the model.
    mappings.push({ ...mapping, role: cells.get(key)?.formula ? "calculated" : "input" });
  };

  for (const source of sources) {
    const section = findSection(structure, source.sectionId);
    if (!section || !sheetNames.has(source.sheet)) {
      issues.push({
        code: "UNMAPPED_TARGET",
        message: `A source refers to ${!section ? `a section that is not in the layout ("${source.sectionId}")` : `a sheet that is not in the workbook ("${source.sheet}")`}; it was left out.`,
        sheet: sheetNames.has(source.sheet) ? source.sheet : undefined,
      });
      continue;
    }

    if (source.kind === "fields") {
      for (const entry of source.cells) {
        const address = parseAddress(entry.cell);
        const field = mappedField(section, { ...entry, sheet: source.sheet, sectionId: section.id, role: "input" } as ExcelCellMapping);
        if (!address || !field) {
          issues.push({
            code: "UNMAPPED_TARGET",
            message: `"${entry.fieldId}" could not be matched to a field in "${section.title}"; that cell was left out.`,
            sheet: source.sheet,
            cell: entry.cell,
          });
          continue;
        }
        add({
          sheet: source.sheet,
          cell: `${columnLetters(address.column)}${address.row}`,
          sectionId: section.id,
          fieldId: entry.fieldId,
          role: "input",
        });
      }
      continue;
    }

    const columns = section.columns ?? [];

    if (source.kind === "columns") {
      const sheet = workbook.sheets.find((entry) => entry.name === source.sheet)!;
      const step = rowStep(sheet, source.anchors);
      source.anchors.forEach((anchor, index) => {
        // An empty anchor is a column of fixed text: nothing to read from.
        if (!anchor || !columns[index]) return;
        const start = parseAddress(anchor);
        if (!start) {
          issues.push({
            code: "UNMAPPED_TARGET",
            message: `"${columns[index].label || `column ${index + 1}`}" of "${section.title}" has an unreadable cell ("${anchor}"); it was left out.`,
            sheet: source.sheet,
          });
          return;
        }
        for (let row = 0; row < source.rows; row++) {
          add({
            sheet: source.sheet,
            cell: `${columnLetters(start.column)}${start.row + row * step}`,
            sectionId: section.id,
            fieldId: columns[index].field.id,
            rowIndex: row,
            columnId: columns[index].id,
            role: "input",
          });
        }
      });
      continue;
    }

    const [from, to] = source.range.split(":");
    const start = parseAddress(from ?? "");
    const end = parseAddress(to ?? from ?? "");
    const rows = resolveRowCount(section);
    if (!start || !end || !columns.length) {
      issues.push({
        code: "UNMAPPED_TARGET",
        message: `"${section.title}" has an unreadable source range ("${source.range}"); its cells were left out.`,
        sheet: source.sheet,
      });
      continue;
    }
    const width = end.column - start.column + 1;
    const height = end.row - start.row + 1;
    if (width !== columns.length || height !== rows) {
      issues.push({
        code: "RANGE_MISMATCH",
        message: `"${section.title}" is ${columns.length} columns by ${rows} rows, but its source range ${source.range} is ${width} by ${height}. The overlapping part was used; check this section against the workbook.`,
        sheet: source.sheet,
      });
    }
    for (let row = 0; row < Math.min(height, rows); row++) {
      for (let column = 0; column < Math.min(width, columns.length); column++) {
        add({
          sheet: source.sheet,
          cell: `${columnLetters(start.column + column)}${start.row + row}`,
          sectionId: section.id,
          fieldId: columns[column].field.id,
          rowIndex: row,
          columnId: columns[column].id,
          role: "input",
        });
      }
    }
  }
  return mappings;
}

/**
 * Take each field's type from the workbook, not from the model's guess.
 *
 * A column left as text cannot carry a numeric calculation: the type checker
 * rejects the arithmetic and the formula is dropped, which is how a run can map
 * every cell correctly and still carry over nothing. What the cells actually
 * hold is in the file, so it is read rather than asked for.
 */
function inferFieldTypes(
  structure: CustomFormStructure,
  workbook: ExcelWorkbookAnalysis,
  mappings: readonly ExcelCellMapping[],
): void {
  const cells = new Map<string, ExcelCell>();
  for (const sheet of workbook.sheets) {
    for (const cell of sheet.cells) cells.set(sourceKey(sheet.name, cell.address), cell);
  }
  const evidence = new Map<FieldConfig, { numeric: number; other: number }>();

  for (const mapping of mappings) {
    const section = findSection(structure, mapping.sectionId);
    const field = section ? mappedField(section, mapping) : undefined;
    // A choice or a date is already more specific than anything a value can say.
    if (!field || field.type !== "text") continue;
    const cell = cells.get(sourceKey(mapping.sheet, mapping.cell));
    if (!cell) continue;
    const tally = evidence.get(field) ?? { numeric: 0, other: 0 };
    const numeric =
      cell.type === "number" ||
      (cell.formula !== undefined && (cell.value === undefined || typeof cell.value === "number"));
    if (numeric) tally.numeric += 1;
    else if (cell.value !== undefined && cell.value !== "") tally.other += 1;
    evidence.set(field, tally);
  }

  for (const [field, tally] of evidence) {
    if (tally.numeric > 0 && tally.other === 0) field.type = FieldType.NUMBER;
  }
}

/**
 * What the form does not account for.
 *
 * Valid JSON is not coverage: a layout can parse, compile and agree with every
 * formula it kept while quietly leaving a whole table out of the form. Formula
 * cells are already reported one by one; this counts the filled cells no
 * section covers, so a workbook that came across half-imported says so.
 *
 * Labels and headings are expected to be uncovered: the layout turns them into
 * titles and static text rather than fields. The count is a prompt to compare
 * against the workbook, not a defect list.
 */
function coverageIssues(
  workbook: ExcelWorkbookAnalysis,
  mappings: readonly ExcelCellMapping[],
): ExcelImportIssue[] {
  const covered = new Set(mappings.map((mapping) => sourceKey(mapping.sheet, mapping.cell)));
  const issues: ExcelImportIssue[] = [];
  for (const sheet of workbook.sheets) {
    const missed = sheet.cells.filter(
      (cell) =>
        (cell.formula !== undefined || (cell.value !== undefined && cell.value !== "")) &&
        !covered.has(sourceKey(sheet.name, cell.address)),
    );
    if (!missed.length) continue;
    const shown = missed.slice(0, 10).map((cell) => cell.address).join(", ");
    issues.push({
      code: "UNCOVERED_CELLS",
      message: `${missed.length} of ${sheet.cells.length} filled cells on this sheet are not in the form (${shown}${missed.length > 10 ? ", …" : ""}). Headings and labels are expected here; anything a technician types or reads is not.`,
      sheet: sheet.name,
    });
  }
  return issues;
}

/**
 * Give every table row a stable id.
 *
 * A calculation target for a table cell is only stable once its row has an id
 * that survives reordering. `prepareTypedForm` does this too, but it also
 * compiles, and an imported layout cannot compile until its formulas have been
 * translated, which needs these ids first.
 */
function assignRowIds(structure: CustomFormStructure, newId: () => string): CustomFormStructure {
  const draft = structuredClone(structure);
  for (const section of draft.sections) {
    if (!section.columns?.length) continue;
    const count = resolveRowCount(section);
    section.calculationRowIds = Array.from(
      { length: count },
      (_, index) => section.calculationRowIds?.[index] ?? newId(),
    );
  }
  return draft;
}

/** The stable calculation target id for a mapping, once row ids exist. */
function targetId(section: SectionConfig, mapping: ExcelCellMapping): string | undefined {
  if (mapping.columnId !== undefined && mapping.rowIndex !== undefined) {
    return formSlotId(section, mapping.fieldId, {
      rowIndex: mapping.rowIndex,
      colId: mapping.columnId,
    });
  }
  return formSlotId(section, mapping.fieldId);
}

/**
 * Leave a field a technician can type in.
 *
 * Called when a calculation is dropped: a field still marked calculated with no
 * formula fails compilation, and would print an empty cell with no way to fill
 * it. A number field the technician completes is the honest fallback.
 */
function degradeToInput(field: FieldConfig): void {
  if (field.type === "calculated") field.type = "number";
  if (field.cellBehavior === "calculate") field.cellBehavior = "user";
  field.readOnly = false;
}

/** A workbook value as the typed engine's literal source text. */
function literalSource(value: ExcelScalar): string {
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "";
  if (typeof value === "boolean") return value ? "true" : "false";
  return JSON.stringify(value);
}

function comparable(value: unknown): number | string | boolean | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "string") return value;
  return null;
}

/** Excel's cached result against ours. Floats are compared relatively, never with ===. */
function sameValue(ours: unknown, cached: ExcelScalar | undefined): boolean | null {
  const left = comparable(ours);
  const right = comparable(cached);
  if (left === null || right === null) return null;
  if (typeof left === "number" && typeof right === "number") {
    const scale = Math.max(Math.abs(left), Math.abs(right), 1);
    return Math.abs(left - right) <= COMPARISON_TOLERANCE * scale;
  }
  if (typeof left === "number" || typeof right === "number") {
    // Excel stores some results as text; compare what a reader would see.
    return String(left).trim() === String(right).trim();
  }
  return String(left) === String(right);
}

interface Wiring {
  /** Workbook cell to the calculation target it feeds or produces. */
  slotBySource: Map<string, string>;
  cellBySource: Map<string, ExcelCell>;
  mappingByTarget: Map<string, ExcelCellMapping>;
}

function wire(
  structure: CustomFormStructure,
  workbook: ExcelWorkbookAnalysis,
  mappings: ExcelCellMapping[],
  issues: ExcelImportIssue[],
): Wiring {
  const slotBySource = new Map<string, string>();
  const mappingByTarget = new Map<string, ExcelCellMapping>();
  const cellBySource = new Map<string, ExcelCell>();
  for (const sheet of workbook.sheets) {
    for (const cell of sheet.cells) cellBySource.set(sourceKey(sheet.name, cell.address), cell);
  }
  for (const mapping of mappings) {
    const section = findSection(structure, mapping.sectionId);
    const id = section ? targetId(section, mapping) : undefined;
    if (!section || !id) {
      issues.push({
        code: "UNMAPPED_TARGET",
        message: "A mapped cell does not point at a field in the generated layout; it was left out.",
        sheet: mapping.sheet,
        cell: mapping.cell,
      });
      continue;
    }
    slotBySource.set(sourceKey(mapping.sheet, mapping.cell), id);
    mappingByTarget.set(id, mapping);
  }
  return { slotBySource, cellBySource, mappingByTarget };
}

/**
 * Translate the workbook's formulas and constants into typed calculations.
 *
 * Formula text always comes from the workbook, never from the model, and every
 * reference must already be mapped: an unmapped reference is an error, not a
 * cached number quietly substituted for a live one.
 */
function translateAll(
  structure: CustomFormStructure,
  workbook: ExcelWorkbookAnalysis,
  mappings: ExcelCellMapping[],
  wiring: Wiring,
): { formulas: Record<string, string>; reviews: ExcelFormulaReview[] } {
  const formulas: Record<string, string> = {};
  const reviews: ExcelFormulaReview[] = [];
  const blankTextReferences = new Set<string>();
  const translations = new Map<string, ReturnType<typeof translateExcelFormula>>();
  const dependents = new Map<string, Set<string>>();
  const blankQueue: string[] = [];
  const translate = (id: string, mapping: ExcelCellMapping) => {
    const cell = wiring.cellBySource.get(sourceKey(mapping.sheet, mapping.cell));
    if (mapping.role !== "calculated" || !cell?.formula) return;
    const result = translateExcelFormula(cell.formula, mapping.sheet, (sheet, address) => {
      const reference = wiring.slotBySource.get(sourceKey(sheet, address));
      if (reference) {
        const readers = dependents.get(reference) ?? new Set<string>();
        readers.add(id);
        dependents.set(reference, readers);
      }
      return reference;
    }, blankTextReferences);
    translations.set(id, result);
    if (result.ok && result.blankText && !blankTextReferences.has(id)) {
      blankTextReferences.add(id);
      blankQueue.push(id);
    }
  };
  for (const [id, mapping] of wiring.mappingByTarget) translate(id, mapping);
  // Empty-text results display as missing typed values. Do not let another formula
  // mistake them for genuinely blank numeric cells and silently turn them into zero.
  // Propagate that distinction independent of worksheet/mapping order, including chains.
  for (let index = 0; index < blankQueue.length; index++) {
    for (const id of dependents.get(blankQueue[index]) ?? []) {
      translate(id, wiring.mappingByTarget.get(id)!);
    }
  }

  for (const mapping of mappings) {
    const section = findSection(structure, mapping.sectionId);
    const id = section ? targetId(section, mapping) : undefined;
    if (!section || !id) continue;
    const cell = wiring.cellBySource.get(sourceKey(mapping.sheet, mapping.cell));

    if (mapping.role === "constant") {
      if (cell?.value === undefined) continue;
      formulas[id] = literalSource(cell.value);
      continue;
    }
    if (mapping.role !== "calculated" || !cell?.formula) continue;

    const translated = translations.get(id)!;
    if (translated.ok) {
      formulas[id] = translated.source;
      reviews.push({
        sheet: mapping.sheet,
        cell: mapping.cell,
        original: cell.formula,
        targetId: id,
        translated: translated.source,
        status: "unverified",
        message: "Translated. Not yet compared with the workbook's cached result.",
        // Where the translation is close rather than identical, the caveat
        // travels with the cell instead of being lost.
        ...(translated.notes?.length ? { caveats: translated.notes } : {}),
      });
    } else {
      const field = mappedField(section, mapping);
      if (field) degradeToInput(field);
      reviews.push({
        sheet: mapping.sheet,
        cell: mapping.cell,
        original: cell.formula,
        targetId: id,
        status: "unsupported",
        message: `${translated.message} This cell is a field to fill in by hand until someone rebuilds the calculation.`,
      });
    }
  }
  // A workbook formula nobody mapped produces nothing at all; say so per cell.
  for (const sheet of workbook.sheets) {
    for (const cell of sheet.cells) {
      if (!cell.formula) continue;
      if (wiring.slotBySource.has(sourceKey(sheet.name, cell.address))) continue;
      reviews.push({
        sheet: sheet.name,
        cell: cell.address,
        original: cell.formula,
        status: "unsupported",
        message: "This formula has no field in the generated layout, so it was not carried over.",
      });
    }
  }
  return { formulas, reviews };
}

/**
 * Compile, dropping whatever the engine rejects until the rest compiles.
 *
 * A single bad calculation must not cost the whole import: the type checker
 * rejects, for example, arithmetic on a text field, and only that calculation
 * has to go. Each drop is recorded against its cell, and its field is left as
 * something a technician can fill in rather than a dead read-only cell.
 */
function compileWhatWorks(
  structure: CustomFormStructure,
  formulas: Record<string, string>,
  reviews: ExcelFormulaReview[],
  issues: ExcelImportIssue[],
): CustomFormStructure {
  const byTarget = new Map(reviews.filter((review) => review.targetId).map((r) => [r.targetId!, r]));
  let draft: CustomFormStructure = { ...structure, expressions: { engineVersion: "typed-1", formulas } };

  for (let attempt = 0; attempt < MAX_COMPILE_ATTEMPTS; attempt++) {
    const compiled = compileFormExpressions(draft);
    if (compiled.ok) return draft;

    // Slots are read from the live structure, so degrading a field here is the
    // same object the renderer will use.
    const listed = listFormExpressionSlots(draft);
    const slots = new Map(listed.ok ? listed.value.map((slot) => [slot.id, slot]) : []);
    const remaining = { ...(draft.expressions?.formulas ?? {}) };
    let acted = false;

    for (const issue of compiled.issues) {
      const id = issue.calculationId;
      if (!id) continue;
      const hadFormula = id in remaining;
      const slot = slots.get(id);
      if (!hadFormula && !slot) continue;
      acted = true;
      if (hadFormula) delete remaining[id];
      if (slot) degradeToInput(slot.field);
      const review = byTarget.get(id);
      if (review && hadFormula) {
        review.status = "unsupported";
        review.translated = undefined;
        review.message = `${issue.message} This cell is a field to fill in by hand until someone rebuilds the calculation.`;
      }
    }

    if (!acted) {
      issues.push({
        code: "CALCULATIONS_DROPPED",
        message: `The layout could not carry any calculations: ${compiled.issues[0]?.message ?? "unknown error"}. Every value has to be entered by hand.`,
      });
      return { ...draft, expressions: undefined };
    }
    draft = { ...draft, expressions: { engineVersion: "typed-1", formulas: remaining } };
  }

  issues.push({
    code: "CALCULATIONS_DROPPED",
    message: "Calculations could not be made to compile after repeated attempts; they were all removed.",
  });
  return { ...draft, expressions: undefined };
}

/**
 * Run the translated calculations on the workbook's own inputs and compare.
 *
 * This is the only check that can say a translation reproduces the workbook,
 * and only for the one set of values the file happened to be saved with. A
 * match is evidence, not certification.
 */
function compareWithWorkbook(
  structure: CustomFormStructure,
  wiring: Wiring,
  reviews: ExcelFormulaReview[],
): void {
  const compiled = compileFormExpressions(structure);
  if (!compiled.ok || !compiled.value) return;
  const slots = new Map<string, FormExpressionSlot>(
    compiled.value.slots.map((slot) => [slot.id, slot]),
  );

  const data: Record<string, Record<string, unknown>> = {};
  for (const [source, id] of wiring.slotBySource) {
    const slot = slots.get(id);
    const cell = wiring.cellBySource.get(source);
    if (!slot || !cell || cell.value === undefined) continue;
    if (compiled.value.calculationIds.has(id)) continue;
    (data[slot.stateKey] ??= {})[slot.field.id] =
      slot.field.type === "number" ? cell.value : String(cell.value);
  }

  const { results } = compiled.value.evaluate(data);
  for (const review of reviews) {
    if (!review.targetId || review.status === "unsupported") continue;
    const result = results.get(review.targetId);
    const cell = wiring.cellBySource.get(sourceKey(review.sheet, review.cell));
    if (!result?.ok) {
      review.status = "unverified";
      review.message = result
        ? `Could not be worked out with the workbook's saved values: ${result.issues[0]?.message ?? "no result"}.`
        : "No result was produced for this cell.";
      continue;
    }
    const agrees = sameValue(result.value, cell?.value);
    if (agrees === null) {
      review.status = "unverified";
      review.message = cell?.value === undefined
        ? "The workbook stored no result for this cell, so there is nothing to compare against."
        : "The result could not be compared with the workbook's saved value.";
    } else if (agrees) {
      review.status = "matched";
      review.message = `Matches the workbook's saved result (${String(cell?.value)}) for the values saved in the file. Other inputs are untested.`;
      if (review.caveats?.length) review.message += ` Note: ${review.caveats.join(" ")}`;
    } else {
      review.status = "different";
      review.message = `Does not match the workbook: it saved ${String(cell?.value)}, this works out to ${String(result.value)}. Check this cell before using the form.`;
    }
  }
}

/**
 * The findings, as a section of the draft itself.
 *
 * A dialog closes and takes its warnings with it. This keeps them in front of
 * whoever opens the template, and never prints: they are notes for the person
 * certifying the form, not content for a customer's report. Delete the section
 * once the review is done.
 */
export function reviewSection(review: ExcelImportDraft["review"], order: number): SectionConfig {
  const counts = summarizeExcelReview(review);
  const lines: string[] = [
    `Imported from ${review.fileName}. Nothing here is verified, and this is not an engineering certification.`,
    `Sheets read: ${review.sheetNames.join(", ") || "none"}.`,
    `Calculations: ${counts.matched} match the workbook's saved results, ${counts.different} disagree, ${counts.unverified} could not be checked, ${counts.unsupported} were not carried over.`,
    "A match only means the numbers agreed for the values saved in the file. Other inputs are untested.",
  ];
  const listed = (status: ExcelFormulaReview["status"], heading: string) => {
    const rows = review.formulas.filter((formula) => formula.status === status);
    if (!rows.length) return;
    lines.push("", heading);
    for (const row of rows.slice(0, 100)) {
      lines.push(`${row.sheet}!${row.cell}: ${row.original} — ${row.message}`);
    }
    if (rows.length > 100) lines.push(`...and ${rows.length - 100} more.`);
  };
  listed("different", "Disagrees with the workbook, check these first:");
  listed("unsupported", "Not carried over, enter these by hand or rebuild them:");
  listed("unverified", "Could not be checked:");
  if (review.issues.length) {
    lines.push("", "Workbook and layout notes:");
    for (const issue of review.issues.slice(0, 100)) {
      const where = issue.sheet ? ` (${issue.sheet}${issue.cell ? `!${issue.cell}` : ""})` : "";
      lines.push(`${issue.code}${where}: ${issue.message}`);
    }
  }
  return {
    id: "excel-import-review",
    componentType: ComponentType.CUSTOM_TEXT,
    title: "Review notes: imported from Excel, not verified",
    order,
    showInPrint: false,
    field: {
      id: "notice",
      label: "Import review (not engineering criteria)",
      type: FieldType.TEXTAREA,
      readOnly: true,
      defaultValue: lines.join("\n"),
    },
  };
}

/**
 * Build a draft template from an analysed workbook.
 *
 * Pure: no file reading and no network call, so the whole assembly is testable.
 * `importExcelTemplate` in ./generate.ts supplies the two impure ends.
 */
export function buildExcelDraft(
  workbook: ExcelWorkbookAnalysis,
  response: ExcelGenerationResponse,
  newId: () => string = () => crypto.randomUUID(),
): ExcelImportDraft {
  const issues: ExcelImportIssue[] = [...workbook.issues];
  const template = structuredClone(response.template) as CustomFormTemplate;

  // Row ids first: every table cell's calculation target is named by its row id.
  let structure = assignRowIds(template.structure, newId);

  const mappings = deriveMappings(structure, workbook, response.sources, issues);
  inferFieldTypes(structure, workbook, mappings);
  const wiring = wire(structure, workbook, mappings, issues);
  const { formulas, reviews } = translateAll(structure, workbook, mappings, wiring);
  structure = compileWhatWorks(structure, formulas, reviews, issues);
  compareWithWorkbook(structure, wiring, reviews);

  issues.push(...coverageIssues(workbook, mappings));
  reviews.sort((a, b) => a.sheet.localeCompare(b.sheet) || a.cell.localeCompare(b.cell));
  for (const warning of response.warnings) issues.push({ code: "LAYOUT_REVIEW", message: warning });

  const review: ExcelImportDraft["review"] = {
    version: 1,
    fileName: workbook.fileName,
    sheetNames: workbook.sheets.map((sheet) => sheet.name),
    issues,
    formulas: reviews,
    reviewed: false,
  };
  return {
    template: {
      ...template,
      structure: {
        ...structure,
        sections: [...structure.sections, reviewSection(review, structure.sections.length)],
      },
    },
    review,
  };
}

/** How much of the workbook came across, for the dialog and the draft's notes. */
export function summarizeExcelReview(review: ExcelImportDraft["review"]): {
  matched: number;
  different: number;
  unverified: number;
  unsupported: number;
  total: number;
} {
  const count = (status: ExcelFormulaReview["status"]) =>
    review.formulas.filter((formula) => formula.status === status).length;
  return {
    matched: count("matched"),
    different: count("different"),
    unverified: count("unverified"),
    unsupported: count("unsupported"),
    total: review.formulas.length,
  };
}

/** Kept with the draft so the findings survive leaving the import dialog. */
export function reviewAsDescription(review: ExcelImportDraft["review"]): string {
  const counts = summarizeExcelReview(review);
  return [
    `Imported from ${review.fileName}. Not reviewed by a person and not certified.`,
    `Calculations: ${counts.matched} match the workbook's saved results, ${counts.different} disagree, ${counts.unverified} could not be checked, ${counts.unsupported} were not carried over.`,
  ].join(" ");
}
