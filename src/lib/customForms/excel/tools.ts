/**
 * The builder's authoring operations, as tools a model can call.
 *
 * The model used to write a whole template as one JSON document. That document
 * grew with the workbook, overran the provider's output limit, and was rejected
 * as a unit: one bad label cost the entire import. Here it makes one small call
 * at a time and the application performs it, so
 *
 * - no single answer is ever large enough to be truncated;
 * - a bad step fails alone, with a message the model can correct and retry;
 * - every intermediate state is a valid draft, so a run that stops early still
 *   leaves something worth opening.
 *
 * Identifiers are generated here, never by the model: it supplies labels, types
 * and source ranges, which is what a person reading the sheet would supply.
 * Formulas are not a tool. They are translated from the workbook afterwards.
 */

import {
  ComponentType,
  FieldType,
  type ColumnConfig,
  type FieldConfig,
  type SectionConfig,
} from "@/lib/types/customForms";
import { cellKey } from "@/lib/customForms/runtime/layout";
import type { ExcelSourceMap } from "@/lib/customForms/excel/types";

export const BUILD_LIMITS = Object.freeze({
  sections: 60,
  columns: 40,
  fields: 60,
  rows: 200,
  headerRows: 4,
  labelLength: 300,
  textLength: 2_000,
  options: 60,
});

/** Field types the model may choose. Anything else is refused with a list. */
const FIELD_TYPES: Record<string, FieldType> = {
  text: FieldType.TEXT,
  number: FieldType.NUMBER,
  date: FieldType.DATE,
  select: FieldType.SELECT,
  radio: FieldType.RADIO,
  textarea: FieldType.TEXTAREA,
  checkbox: FieldType.CHECKBOX,
};

export interface BuildState {
  name: string;
  sections: SectionConfig[];
  sources: ExcelSourceMap[];
  finished: boolean;
  /** Counter behind generated ids, so they stay unique and stable per run. */
  counter: number;
}

export function newBuildState(name: string): BuildState {
  return { name, sections: [], sources: [], finished: false, counter: 0 };
}

export interface ToolCall {
  name: string;
  args: Record<string, unknown>;
}

/** What the model is told after a step: either what happened, or what to fix. */
export type ToolResult =
  | { ok: true; message: string; summary: string }
  | { ok: false; message: string };

class ToolError extends Error {}
function fail(message: string): never {
  throw new ToolError(message);
}

// ---------------------------------------------------------------------------
// Argument reading. Every message is written for the model to act on.
// ---------------------------------------------------------------------------

function str(args: Record<string, unknown>, key: string, max: number = BUILD_LIMITS.labelLength, required = true): string {
  const value = args[key];
  if (value === undefined || value === null || value === "") {
    if (!required) return "";
    fail(`"${key}" is required and must be text.`);
  }
  if (typeof value !== "string") fail(`"${key}" must be text, not ${typeof value}.`);
  if (value.length > max) fail(`"${key}" is longer than ${max} characters. Shorten it.`);
  return value;
}

function int(args: Record<string, unknown>, key: string, min: number, max: number): number {
  const value = typeof args[key] === "string" ? Number(args[key]) : args[key];
  if (typeof value !== "number" || !Number.isInteger(value) || value < min || value > max) {
    fail(`"${key}" must be a whole number between ${min} and ${max}.`);
  }
  return value;
}

function array(args: Record<string, unknown>, key: string, max: number): unknown[] {
  const value = args[key];
  if (!Array.isArray(value)) fail(`"${key}" must be a list.`);
  if (!value.length) fail(`"${key}" cannot be empty.`);
  if (value.length > max) fail(`"${key}" has ${value.length} entries; the limit is ${max}. Split this into more than one section.`);
  return value;
}

function record(value: unknown, what: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail(`Each ${what} must be an object.`);
  return value as Record<string, unknown>;
}

function fieldType(value: unknown, what: string): FieldType {
  const key = String(value ?? "text").toLowerCase();
  const type = FIELD_TYPES[key];
  if (!type) fail(`"${value}" is not a field type for ${what}. Use one of: ${Object.keys(FIELD_TYPES).join(", ")}.`);
  return type;
}

function options(value: unknown, label: string): { label: string; value: string }[] | undefined {
  if (value === undefined || value === null) return undefined;
  if (!Array.isArray(value)) fail(`"options" for "${label}" must be a list of choices.`);
  if (value.length > BUILD_LIMITS.options) fail(`"${label}" has more than ${BUILD_LIMITS.options} choices.`);
  return value.map((entry) => {
    const text = typeof entry === "string" ? entry : String(record(entry, "choice").value ?? record(entry, "choice").label ?? "");
    if (!text) fail(`A choice for "${label}" is empty.`);
    return { label: text, value: text };
  });
}

const A1_CELL = /^[A-Z]{1,3}[1-9][0-9]{0,6}$/;
const A1_RANGE = /^[A-Z]{1,3}[1-9][0-9]{0,6}:[A-Z]{1,3}[1-9][0-9]{0,6}$/;

function cellAddress(value: unknown, what: string): string {
  const text = String(value ?? "").trim().toUpperCase();
  if (!A1_CELL.test(text)) fail(`"${value}" is not a cell address for ${what}. Use a single cell such as B12.`);
  return text;
}

function rangeAddress(value: unknown): string {
  const text = String(value ?? "").trim().toUpperCase();
  if (!A1_RANGE.test(text)) fail(`"${value}" is not a range. Use two cells such as B43:N46, covering data rows only.`);
  return text;
}

function rangeSize(range: string): { columns: number; rows: number } {
  const [from, to] = range.split(":");
  const parse = (address: string) => {
    const [, letters, digits] = /^([A-Z]{1,3})([0-9]+)$/.exec(address)!;
    let column = 0;
    for (const letter of letters) column = column * 26 + letter.charCodeAt(0) - 64;
    return { column, row: Number(digits) };
  };
  const start = parse(from);
  const end = parse(to);
  return {
    columns: Math.abs(end.column - start.column) + 1,
    rows: Math.abs(end.row - start.row) + 1,
  };
}

// ---------------------------------------------------------------------------
// The tools
// ---------------------------------------------------------------------------

/** Declarations sent to the provider. Kept terse: they are resent every step. */
export const BUILD_TOOLS = [
  {
    name: "add_section",
    description:
      "Add a section of individual labelled fields, such as job information or nameplate data. Each field names the workbook cell its value comes from.",
    parameters: {
      type: "object",
      required: ["title", "fields"],
      properties: {
        title: { type: "string", description: "Heading exactly as the sheet shows it." },
        columns: { type: "integer", description: "How many fields sit side by side. 1 to 5, default 2." },
        fields: {
          type: "array",
          description: "The fields, in reading order.",
          items: {
            type: "object",
            required: ["label", "cell"],
            properties: {
              label: { type: "string" },
              cell: { type: "string", description: "The cell holding the VALUE, not the label, e.g. F3." },
              type: { type: "string", description: "text, number, date, select, radio, textarea or checkbox." },
              options: { type: "array", items: { type: "string" }, description: "Choices for select or radio." },
            },
          },
        },
      },
    },
  },
  {
    name: "add_table",
    description:
      "Add a table. Each column names its FIRST DATA CELL, the cell under its heading in the first data row. Merged cells make the raw grid misleading, so give the cell you can see, not a rectangle.",
    parameters: {
      type: "object",
      required: ["title", "columns", "rows"],
      properties: {
        title: { type: "string" },
        rows: { type: "integer", description: "How many data rows the table has." },
        columns: {
          type: "array",
          items: {
            type: "object",
            required: ["label", "cell"],
            properties: {
              label: { type: "string", description: "Column heading. May be empty." },
              cell: { type: "string", description: "This column's cell in the FIRST data row, e.g. Q33." },
              type: { type: "string" },
              width: { type: "string", description: "Optional, e.g. 12%." },
              options: { type: "array", items: { type: "string" } },
            },
          },
        },
      },
    },
  },
  {
    name: "add_header_row",
    description:
      "Add a grouping row above a table's column headings, for merged headings such as 'Settings As Found' spanning four columns. Spans must add up to the table's column count.",
    parameters: {
      type: "object",
      required: ["section", "cells"],
      properties: {
        section: { type: "string", description: "Section id returned by add_table." },
        cells: {
          type: "array",
          items: {
            type: "object",
            required: ["label", "span"],
            properties: { label: { type: "string" }, span: { type: "integer" } },
          },
        },
      },
    },
  },
  {
    name: "set_column_text",
    description:
      "Fill one column with fixed text, one entry per row, for columns the technician does not type: NETA section numbers, criteria descriptions, row names.",
    parameters: {
      type: "object",
      required: ["section", "column", "values"],
      properties: {
        section: { type: "string" },
        column: { type: "integer", description: "1 for the first column." },
        values: { type: "array", items: { type: "string" } },
      },
    },
  },
  {
    name: "add_note",
    description: "Add a line of fixed text under a section, such as a caption or criteria note.",
    parameters: {
      type: "object",
      required: ["section", "text"],
      properties: { section: { type: "string" }, text: { type: "string" } },
    },
  },
  {
    name: "finish",
    description: "Call once the whole sheet is represented. State anything you could not build.",
    parameters: {
      type: "object",
      properties: { notes: { type: "string", description: "What a person should check." } },
    },
  },
] as const;

/**
 * A table whose rows and columns follow a dropdown, like Device Settings by
 * Trip Type. Only the section editor offers it: a workbook has no dropdown
 * that hides rows, so a file import never needs it.
 */
export const CONDITIONAL_TABLE_TOOL = {
  name: "add_conditional_table",
  description:
    "Add a table whose rows and columns change with a dropdown above it, e.g. a Trip Type that decides which functions are listed. Use it whenever rows or columns appear only for some choices. The first column holds the row names and is added for you: do not list it in columns.",
  parameters: {
    type: "object",
    required: ["title", "dropdown", "columns", "rows"],
    properties: {
      title: { type: "string" },
      dropdown: {
        type: "object",
        required: ["label", "options"],
        properties: {
          label: { type: "string", description: "e.g. Trip Type." },
          options: { type: "array", items: { type: "string" } },
          default: { type: "string", description: "The choice it starts on. Optional; otherwise the first." },
        },
      },
      row_heading: { type: "string", description: "Heading over the row names, e.g. Function." },
      columns: {
        type: "array",
        description: "The columns after the row names.",
        items: {
          type: "object",
          required: ["label"],
          properties: {
            label: { type: "string" },
            type: { type: "string", description: "text, number, date, select, radio, textarea or checkbox." },
            options: { type: "array", items: { type: "string" }, description: "Choices for select." },
            width: { type: "string" },
            show_for: {
              type: "array",
              items: { type: "string" },
              description: "Dropdown choices that show this column. Leave out to always show it.",
            },
          },
        },
      },
      rows: {
        type: "array",
        items: {
          type: "object",
          required: ["label"],
          properties: {
            label: { type: "string" },
            show_for: {
              type: "array",
              items: { type: "string" },
              description: "Dropdown choices that show this row. Leave out to always show it.",
            },
          },
        },
      },
    },
  },
} as const;

/** What the section editor's regenerate offers the model. */
export const EDIT_TOOLS = [...BUILD_TOOLS, CONDITIONAL_TABLE_TOOL] as const;

function nextId(state: BuildState, prefix: string): string {
  state.counter += 1;
  return `${prefix}${state.counter}`;
}

function findSection(state: BuildState, id: unknown): SectionConfig {
  const key = String(id ?? "");
  const section = state.sections.find((entry) => entry.id === key);
  if (!section) {
    fail(`There is no section "${key}". Existing sections: ${state.sections.map((entry) => entry.id).join(", ") || "none yet"}.`);
  }
  return section;
}

function addSection(state: BuildState, args: Record<string, unknown>, sheet: string): string {
  const title = str(args, "title");
  const columns = args.columns === undefined ? 2 : int(args, "columns", 1, 5);
  const entries = array(args, "fields", BUILD_LIMITS.fields);
  const id = nextId(state, "s");
  const fields: FieldConfig[] = [];
  const cells: { fieldId: string; cell: string }[] = [];
  const used = new Set<string>();

  for (const raw of entries) {
    const entry = record(raw, "field");
    const label = str(entry, "label", BUILD_LIMITS.labelLength, false);
    const address = cellAddress(entry.cell, `"${label || "a field"}"`);
    if (used.has(address)) fail(`${address} is used twice in this section. Each field needs its own cell.`);
    used.add(address);
    const fieldId = nextId(state, "f");
    fields.push({
      id: fieldId,
      label,
      type: fieldType(entry.type, `"${label}"`),
      ...(options(entry.options, label || address) ? { options: options(entry.options, label || address) } : {}),
    });
    cells.push({ fieldId, cell: address });
  }

  state.sections.push({
    id,
    componentType: ComponentType.NAMEPLATE_DATA,
    title,
    order: state.sections.length,
    showInPrint: true,
    layout: (["single-column", "two-column", "three-column", "four-column", "five-column"] as const)[columns - 1],
    fields,
  });
  state.sources.push({ sectionId: id, kind: "fields", sheet, cells });
  return id;
}

function addTable(state: BuildState, args: Record<string, unknown>, sheet: string): string {
  const title = str(args, "title");
  const entries = array(args, "columns", BUILD_LIMITS.columns);
  const rows = int(args, "rows", 1, BUILD_LIMITS.rows);
  const id = nextId(state, "s");
  const anchors: string[] = [];
  let anchorRow = 0;

  const columns: ColumnConfig[] = entries.map((raw, index) => {
    const entry = record(raw, "column");
    const label = str(entry, "label", BUILD_LIMITS.labelLength, false);
    const anchor = cellAddress(entry.cell, `column "${label || index + 1}"`);
    const row = Number(/\d+/.exec(anchor)![0]);
    if (index === 0) anchorRow = row;
    else if (row !== anchorRow) {
      fail(`Every column's cell must be in the same first data row. "${label}" is in row ${row}, but the first column is in row ${anchorRow}.`);
    }
    if (anchors.includes(anchor)) fail(`${anchor} is given for two columns. Each column needs its own cell.`);
    anchors.push(anchor);
    const columnId = nextId(state, "c");
    const fieldId = nextId(state, "f");
    const choices = options(entry.options, label || columnId);
    return {
      id: columnId,
      label,
      ...(entry.width ? { width: str(entry, "width", 20) } : {}),
      field: {
        id: fieldId,
        label,
        type: fieldType(entry.type, `column "${label}"`),
        ...(choices ? { options: choices } : {}),
      },
    };
  });

  state.sections.push({
    id,
    componentType: ComponentType.CUSTOM_TABLE,
    title,
    order: state.sections.length,
    showInPrint: true,
    columns,
    rows,
    allowAddRows: false,
    allowRemoveRows: false,
  });
  state.sources.push({ sectionId: id, kind: "columns", sheet, anchors, rows });
  return id;
}

/**
 * Which dropdown choices show a row or column. Undefined means always: left
 * out, empty, or every choice listed.
 */
function showFor(value: unknown, choices: string[], what: string): string[] | undefined {
  if (value === undefined || value === null) return undefined;
  if (!Array.isArray(value)) fail(`"show_for" for ${what} must be a list of dropdown choices.`);
  const picked = [...new Set(value.map((entry) => String(entry ?? "")))];
  const unknown = picked.filter((entry) => !choices.includes(entry));
  if (unknown.length) {
    fail(`${what} is shown for ${unknown.map((entry) => `"${entry}"`).join(", ")}, which the dropdown does not offer. Its choices are: ${choices.join(", ")}.`);
  }
  return picked.length === 0 || picked.length === choices.length ? undefined : picked;
}

function addConditionalTable(state: BuildState, args: Record<string, unknown>): string {
  const title = str(args, "title");
  const dropdown = record(args.dropdown, "dropdown");
  const dropdownLabel = str(dropdown, "label");
  const choices = options(dropdown.options, dropdownLabel);
  if (!choices?.length) fail(`The dropdown "${dropdownLabel}" needs its choices.`);
  const values = choices.map((choice) => choice.value);
  const start = str(dropdown, "default", BUILD_LIMITS.labelLength, false);
  if (start && !values.includes(start)) {
    fail(`"${start}" is not one of the dropdown's choices, so it cannot start there. Its choices are: ${values.join(", ")}.`);
  }
  const columnEntries = array(args, "columns", BUILD_LIMITS.columns - 1);
  const rowEntries = array(args, "rows", BUILD_LIMITS.rows);
  const id = nextId(state, "s");
  const settingId = nextId(state, "set");
  const follows = (picked: string[] | undefined) =>
    picked ? { visibleWhen: { [settingId]: picked } } : {};

  const rowHeading = str(args, "row_heading", BUILD_LIMITS.labelLength, false);
  const nameColumn: ColumnConfig = {
    id: nextId(state, "c"),
    label: rowHeading,
    field: { id: nextId(state, "f"), label: rowHeading, type: FieldType.TEXT },
  };
  const columns: ColumnConfig[] = columnEntries.map((raw, index) => {
    const entry = record(raw, "column");
    const label = str(entry, "label", BUILD_LIMITS.labelLength, false);
    const name = `Column "${label || index + 2}"`;
    const columnChoices = options(entry.options, label || `column ${index + 2}`);
    return {
      id: nextId(state, "c"),
      label,
      ...(entry.width ? { width: str(entry, "width", 20) } : {}),
      field: {
        id: nextId(state, "f"),
        label,
        type: fieldType(entry.type, name),
        ...(columnChoices ? { options: columnChoices } : {}),
      },
      ...follows(showFor(entry.show_for, values, name)),
    };
  });
  const conditionalRows = rowEntries.map((raw) => {
    const entry = record(raw, "row");
    const label = str(entry, "label");
    return { id: nextId(state, "r"), label, ...follows(showFor(entry.show_for, values, `Row "${label}"`)) };
  });

  state.sections.push({
    id,
    componentType: ComponentType.CONDITIONAL_TABLE,
    title,
    order: state.sections.length,
    showInPrint: true,
    settingFields: [
      { id: settingId, label: dropdownLabel, options: choices, ...(start ? { defaultValue: start } : {}) },
    ],
    conditionalRows,
    columns: [nameColumn, ...columns],
    allowAddRows: false,
    allowRemoveRows: false,
  });
  return id;
}

function addHeaderRow(state: BuildState, args: Record<string, unknown>): string {
  const section = findSection(state, args.section);
  if (!section.columns?.length) fail(`"${section.title}" is not a table, so it has no column headings.`);
  const cells = array(args, "cells", BUILD_LIMITS.columns);
  const header = section.v2?.header ?? [];
  if (header.length >= BUILD_LIMITS.headerRows) fail(`"${section.title}" already has ${header.length} heading rows.`);

  const total = cells.reduce<number>((sum, raw) => {
    const entry = record(raw, "heading");
    return sum + (entry.span === undefined ? 1 : int(entry, "span", 1, BUILD_LIMITS.columns));
  }, 0);
  if (total > section.columns.length) {
    fail(`The spans add up to ${total}, but "${section.title}" has ${section.columns.length} columns. Either the spans are too wide or the table is missing columns.`);
  }

  let covered = 0;
  const headingCells = cells.map((raw) => {
    const entry = record(raw, "heading");
    const label = str(entry, "label", BUILD_LIMITS.labelLength, false);
    const span = entry.span === undefined ? 1 : int(entry, "span", 1, BUILD_LIMITS.columns);
    const column = section.columns![covered];
    covered += span;
    return { id: nextId(state, "hc"), columnId: column.id, label, ...(span > 1 ? { colSpan: span } : {}) };
  });
  // A row that stops short leaves a hole that blocks publication. Blank
  // headings over the remaining columns are what a person would draw anyway.
  while (covered < section.columns.length) {
    headingCells.push({ id: nextId(state, "hc"), columnId: section.columns[covered].id, label: "" });
    covered += 1;
  }
  const row = { id: nextId(state, "h"), cells: headingCells };

  // The authored grouping row sits above the column headings themselves.
  const headings = {
    id: nextId(state, "h"),
    cells: section.columns.map((column) => ({
      id: nextId(state, "hc"),
      columnId: column.id,
      label: column.label,
    })),
  };
  section.v2 = { ...(section.v2 ?? {}), header: header.length ? [...header, row] : [row, headings] };
  return `${row.cells.length} heading${row.cells.length === 1 ? "" : "s"}`;
}

function setColumnText(state: BuildState, args: Record<string, unknown>): string {
  const section = findSection(state, args.section);
  if (!section.columns?.length) fail(`"${section.title}" is not a table.`);
  const index = int(args, "column", 1, section.columns.length) - 1;
  const values = array(args, "values", BUILD_LIMITS.rows);
  const rows = section.rows ?? values.length;
  if (values.length !== rows) {
    fail(`"${section.title}" has ${rows} rows but ${values.length} values were given. Give exactly one per row.`);
  }
  const column = section.columns[index];
  column.field = { ...column.field, cellBehavior: "static" };
  const staticCells = { ...(section.staticCells ?? {}) };
  values.forEach((value, row) => {
    staticCells[cellKey(row, column.id)] = String(value ?? "").slice(0, BUILD_LIMITS.textLength);
  });
  section.staticCells = staticCells;
  // Fixed text is not a place a workbook value can land, so this column stops
  // being a source of data.
  state.sources = state.sources.map((source) =>
    source.sectionId === section.id && source.kind === "columns"
      ? { ...source, anchors: source.anchors.map((anchor, at) => (at === index ? "" : anchor)) }
      : source,
  );
  return `${values.length} fixed values in "${column.label || `column ${index + 1}`}"`;
}

function addNote(state: BuildState, args: Record<string, unknown>): string {
  const section = findSection(state, args.section);
  const text = str(args, "text", BUILD_LIMITS.textLength);
  const body = section.v2?.body ?? [];
  section.v2 = {
    ...(section.v2 ?? {}),
    body: [...body, { id: nextId(state, "b"), kind: "note", text }],
  };
  return "note added";
}

/**
 * Perform one call against the draft.
 *
 * A refusal is not a failure of the run: the message goes back to the model as
 * the result of its call, so it can correct itself. Only the caller's budget
 * ends a run.
 */
export function applyToolCall(state: BuildState, call: ToolCall, sheet: string): ToolResult {
  if (state.finished) return { ok: false, message: "The form is already finished. Do not call any more tools." };
  const args = call.args ?? {};
  try {
    switch (call.name) {
      case "add_section": {
        const id = addSection(state, args, sheet);
        const section = state.sections[state.sections.length - 1];
        return {
          ok: true,
          summary: `${section.title}, ${section.fields!.length} fields`,
          message: `Added section "${section.title}" as ${id} with ${section.fields!.length} fields.`,
        };
      }
      case "add_table": {
        const id = addTable(state, args, sheet);
        const section = state.sections[state.sections.length - 1];
        return {
          ok: true,
          summary: `${section.title}, ${section.columns!.length} columns by ${section.rows} rows`,
          message: `Added table "${section.title}" as ${id}: ${section.columns!.length} columns, ${section.rows} rows.`,
        };
      }
      case "add_conditional_table": {
        const id = addConditionalTable(state, args);
        const section = state.sections[state.sections.length - 1];
        const dropdown = section.settingFields![0].label;
        return {
          ok: true,
          summary: `${section.title}, ${section.conditionalRows!.length} rows that follow ${dropdown}`,
          message: `Added table "${section.title}" as ${id}: ${section.columns!.length} columns and ${section.conditionalRows!.length} rows, shown by "${dropdown}".`,
        };
      }
      case "add_header_row": {
        const detail = addHeaderRow(state, args);
        return { ok: true, summary: `merged headings (${detail})`, message: `Added a grouping row: ${detail}.` };
      }
      case "set_column_text": {
        const detail = setColumnText(state, args);
        return { ok: true, summary: detail, message: `Set ${detail}.` };
      }
      case "add_note": {
        const detail = addNote(state, args);
        return { ok: true, summary: "note", message: detail };
      }
      case "finish": {
        if (!state.sections.length) return { ok: false, message: "Nothing has been built yet. Add the sheet's sections first." };
        // Notes are commentary. Trimming them is better than refusing a finish
        // that has already marked the form done: that left a finished form
        // reported as an abandoned one.
        const notes = String(args.notes ?? "").slice(0, BUILD_LIMITS.textLength);
        state.finished = true;
        return {
          ok: true,
          summary: "finished",
          message: `Finished with ${state.sections.length} sections.${notes ? ` Notes: ${notes}` : ""}`,
        };
      }
      default:
        return {
          ok: false,
          message: `There is no tool called "${call.name}". Available: ${BUILD_TOOLS.map((tool) => tool.name).join(", ")}.`,
        };
    }
  } catch (error) {
    if (error instanceof ToolError) return { ok: false, message: error.message };
    throw error;
  }
}
