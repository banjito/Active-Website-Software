/**
 * The build loop: one tool call at a time, with a budget and a running commentary.
 *
 * The model is given a readable map of the sheet and the builder's own
 * authoring tools, and it works through the sheet section by section. Nothing
 * here trusts it to be right: every call goes through `applyToolCall`, which
 * refuses anything the builder cannot represent and hands back a message to
 * correct. A refusal costs one step, not the run.
 *
 * The loop is driven from the browser so each provider call is short, the
 * person can watch it and stop it, and a run that ends early still leaves a
 * valid draft of whatever was built.
 */

import type { SectionConfig } from "@/lib/types/customForms";
import type { ExcelImportDraft, ExcelWorkbookAnalysis } from "@/lib/customForms/excel/types";
import { buildExcelDraft, deriveMappings } from "@/lib/customForms/excel/import";
import {
  BUILD_TOOLS,
  applyToolCall,
  newBuildState,
  type BuildState,
  type ToolCall,
} from "@/lib/customForms/excel/tools";

export interface BuildBudget {
  maxSteps: number;
  maxConsecutiveErrors: number;
  maxMinutes: number;
}

export const BUILD_BUDGET: Readonly<BuildBudget> = Object.freeze({
  /** Enough for a dense form; a sheet needing more should be split. */
  maxSteps: 120,
  /** A model that keeps getting the same call wrong is not converging. */
  maxConsecutiveErrors: 5,
  maxMinutes: 10,
});

export interface BuildStep {
  index: number;
  tool: string;
  ok: boolean;
  /** One short line for the person watching. */
  text: string;
}

export type BuildEvent =
  | { kind: "reading"; text: string }
  | { kind: "step"; step: BuildStep; state: BuildState }
  | { kind: "retry"; text: string }
  | { kind: "done"; reason: BuildStopReason };

export type BuildStopReason =
  | "finished"
  | "cancelled"
  | "step_limit"
  | "stuck"
  | "provider_error"
  | "no_action";

export interface ModelMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  toolCallId?: string;
  toolCalls?: { id: string; name: string; args: string }[];
}

export interface ModelTurn {
  text: string;
  toolCalls: { id: string; name: string; args: string }[];
}

export type ModelCall = (
  messages: ModelMessage[],
  signal: AbortSignal,
) => Promise<ModelTurn>;

// ---------------------------------------------------------------------------
// Describing the sheet
// ---------------------------------------------------------------------------

const MAX_CELL_TEXT = 60;

function columnNumber(letters: string): number {
  let value = 0;
  for (const letter of letters) value = value * 26 + letter.charCodeAt(0) - 64;
  return value;
}
const MAX_DESCRIBED_CELLS = 1_200;

/**
 * The sheet as a person would read it, not as JSON.
 *
 * A row per line, each cell as `address: text` or `address =formula`. This is
 * both smaller and easier to follow than the analysis object, and it keeps the
 * addresses next to the text so the model can name ranges without counting.
 */
export function describeWorkbook(analysis: ExcelWorkbookAnalysis): string {
  const lines: string[] = [];
  for (const sheet of analysis.sheets) {
    lines.push(`SHEET "${sheet.name}"${sheet.hidden ? " (hidden)" : ""} covering ${sheet.range}`);
    // Merges are the difference between the columns a person sees and the raw
    // grid. Without them a heading spanning five narrow columns reads as five
    // columns, and the form comes out padded with empty ones.
    const spans = new Map<string, string>();
    for (const merge of sheet.merges) {
      const [from, to] = merge.split(":");
      const start = /^([A-Z]{1,3})([0-9]+)$/.exec(from ?? "");
      const end = /^([A-Z]{1,3})([0-9]+)$/.exec(to ?? "");
      if (!start || !end) continue;
      const width = columnNumber(end[1]) - columnNumber(start[1]) + 1;
      const height = Number(end[2]) - Number(start[2]) + 1;
      if (width > 1 || height > 1) {
        spans.set(from, ` [spans ${width > 1 ? `${width} cols` : ""}${width > 1 && height > 1 ? ", " : ""}${height > 1 ? `${height} rows` : ""}]`);
      }
    }
    const rows = new Map<number, string[]>();
    let described = 0;
    for (const cell of sheet.cells) {
      if (described >= MAX_DESCRIBED_CELLS) {
        lines.push(`  … ${sheet.cells.length - described} more cells not listed.`);
        break;
      }
      described += 1;
      const row = Number(/\d+/.exec(cell.address)?.[0] ?? 0);
      const span = spans.get(cell.address) ?? "";
      const text = cell.formula
        ? `${cell.address} =${cell.formula.slice(0, MAX_CELL_TEXT)}${span}`
        : `${cell.address}: ${String(cell.value ?? "").slice(0, MAX_CELL_TEXT)}${span}`;
      const list = rows.get(row);
      if (list) list.push(text);
      else rows.set(row, [text]);
    }
    for (const row of [...rows.keys()].sort((a, b) => a - b)) {
      lines.push(`  ${rows.get(row)!.join("  |  ")}`);
    }
    const lists = sheet.validations.filter((validation) => validation.options?.length);
    for (const validation of lists.slice(0, 40)) {
      lines.push(`  CHOICES ${validation.range}: ${validation.options!.join(" / ").slice(0, 200)}`);
    }
  }
  return lines.join("\n");
}

const SYSTEM_PROMPT = `You rebuild a spreadsheet as a form, one tool call at a time.

The sheet is a paper form drawn in Excel. Work through it from top to bottom and
call one tool per part of it. Between calls you will be told what was built or
what to correct.

RULES
- Reproduce the sheet's own headings and labels exactly. Invent nothing: no
  criteria, options, sections or columns the sheet does not contain.
- Never write a formula or a value. Calculated cells are ordinary columns; the
  application translates the workbook's formulas itself afterwards.
- This sheet merges cells, so the columns a reader sees are not the columns of
  the raw grid. Cells marked [spans n cols] are one column, not n. Give each
  column the cell it occupies in the FIRST DATA ROW, under its heading, and say
  how many data rows there are. Never pad a table with empty columns to make a
  rectangle fit.
- A column of results or readings belongs in the table it describes, not in a
  separate section beside it.
- A cell mapped to a field is the cell holding the VALUE, not its label.
- Columns of fixed text the technician never types (section numbers, criteria
  wording, row names) are set with set_column_text, not left as inputs.
- Where a heading spans several columns, add the table first, then
  add_header_row with spans that cover every column exactly once.
- Do not map the same cell twice.
- Call finish when the whole sheet is represented, and say in its notes anything
  you could not build.

Make one call per message.`;

// ---------------------------------------------------------------------------
// Coverage
// ---------------------------------------------------------------------------

const REPORTED_GAPS = 12;
const MAX_FINISH_REFUSALS = 3;

/**
 * Workbook cells the form has nowhere to put.
 *
 * The first real run produced fifteen sections and carried over none of the
 * sixty-five formulas: whole columns of calculated cells had no field, and
 * every formula depending on them failed in turn. A model cannot see that from
 * inside its own conversation, but the application can compute it exactly, so
 * `finish` is refused while any formula cell is still unmapped and the missing
 * addresses are handed back to be added.
 */
export function uncoveredFormulaCells(
  analysis: ExcelWorkbookAnalysis,
  state: BuildState,
): { address: string; formula: string }[] {
  const structure = {
    sections: state.sections,
    settings: {
      includePassFail: false,
      includeJobInfo: false,
      includePrintHeader: true,
      pageBreakAfterSection: false,
    },
  };
  const mapped = new Set(
    deriveMappings(structure, analysis, state.sources, []).map(
      (mapping) => `${mapping.sheet}!${mapping.cell}`,
    ),
  );
  const missing: { address: string; formula: string }[] = [];
  for (const sheet of analysis.sheets) {
    for (const cell of sheet.cells) {
      if (!cell.formula) continue;
      if (mapped.has(`${sheet.name}!${cell.address}`)) continue;
      missing.push({ address: cell.address, formula: cell.formula });
    }
  }
  return missing;
}

/** The refusal a model can act on: which cells, and what they calculate. */
function coverageComplaint(missing: { address: string; formula: string }[]): string {
  const shown = missing
    .slice(0, REPORTED_GAPS)
    .map((entry) => `${entry.address} (${entry.formula.slice(0, 50)})`)
    .join(", ");
  return `Not finished: ${missing.length} calculated cell${missing.length === 1 ? "" : "s"} of the sheet ${
    missing.length === 1 ? "has" : "have"
  } no field in the form, so ${missing.length === 1 ? "it" : "they"} would be lost. Add the columns or fields that hold them, then finish. Missing: ${shown}${
    missing.length > REPORTED_GAPS ? `, and ${missing.length - REPORTED_GAPS} more` : ""
  }.`;
}

// ---------------------------------------------------------------------------
// The loop
// ---------------------------------------------------------------------------

export interface BuildRun {
  state: BuildState;
  steps: BuildStep[];
  reason: BuildStopReason;
  notes: string;
}

export interface BuildOptions {
  analysis: ExcelWorkbookAnalysis;
  call: ModelCall;
  onEvent?: (event: BuildEvent) => void;
  signal?: AbortSignal;
  budget?: Partial<BuildBudget>;
  now?: () => number;
}

export async function runBuild(options: BuildOptions): Promise<BuildRun> {
  const { analysis, call, onEvent, signal, now = Date.now } = options;
  const budget = { ...BUILD_BUDGET, ...options.budget };
  const sheet = analysis.sheets[0]?.name ?? "";
  const state = newBuildState(analysis.fileName.replace(/\.xlsx$/i, ""));
  const steps: BuildStep[] = [];
  const started = now();
  let notes = "";

  onEvent?.({
    kind: "reading",
    text: `Read ${analysis.sheets.map((entry) => `"${entry.name}"`).join(", ")}: ${
      analysis.sheets.reduce((total, entry) => total + entry.cells.length, 0)
    } filled cells, ${analysis.formulaCount} formulas.`,
  });

  const messages: ModelMessage[] = [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: `Rebuild this sheet as a form.\n\n${describeWorkbook(analysis)}` },
  ];

  let consecutiveErrors = 0;
  // A model that cannot close the gaps should still be allowed to stop, with
  // the gaps recorded, rather than being held in a loop it cannot escape.
  let finishRefusals = 0;
  let reason: BuildStopReason = "step_limit";

  for (let index = 0; index < budget.maxSteps; index++) {
    if (signal?.aborted) { reason = "cancelled"; break; }
    if (now() - started > budget.maxMinutes * 60_000) { reason = "step_limit"; break; }

    let turn: ModelTurn;
    try {
      turn = await call(messages, signal ?? new AbortController().signal);
    } catch (error) {
      if (signal?.aborted) { reason = "cancelled"; break; }
      // One provider hiccup should not throw away a part-built form.
      consecutiveErrors += 1;
      onEvent?.({ kind: "retry", text: (error as Error).message });
      if (consecutiveErrors >= budget.maxConsecutiveErrors) { reason = "provider_error"; break; }
      continue;
    }

    if (!turn.toolCalls.length) {
      // Nothing to do and nothing built means the model is talking, not working.
      consecutiveErrors += 1;
      messages.push({ role: "assistant", content: turn.text || "" });
      messages.push({
        role: "user",
        content: "Answer only by calling a tool. Call the next one now, or finish if the sheet is complete.",
      });
      if (consecutiveErrors >= budget.maxConsecutiveErrors) { reason = "no_action"; break; }
      continue;
    }

    messages.push({ role: "assistant", content: turn.text || "", toolCalls: turn.toolCalls });

    for (const toolCall of turn.toolCalls) {
      let args: Record<string, unknown> = {};
      let parseError = "";
      try {
        args = toolCall.args ? JSON.parse(toolCall.args) : {};
      } catch {
        parseError = "The arguments were not valid JSON. Send them again as a JSON object.";
      }
      const call2: ToolCall = { name: toolCall.name, args };
      // Coverage is something the application can see and the model cannot, so
      // it is checked here rather than trusted to the conversation.
      const gaps =
        !parseError && toolCall.name === "finish" && !state.finished
          ? uncoveredFormulaCells(analysis, state)
          : [];
      const result = parseError
        ? ({ ok: false, message: parseError } as const)
        : gaps.length && finishRefusals < MAX_FINISH_REFUSALS
          ? ({ ok: false, message: coverageComplaint(gaps) } as const)
          : applyToolCall(state, call2, sheet);
      if (gaps.length && toolCall.name === "finish") finishRefusals += 1;

      const step: BuildStep = {
        index: steps.length + 1,
        tool: toolCall.name,
        ok: result.ok,
        text: result.ok ? result.summary : result.message,
      };
      steps.push(step);
      consecutiveErrors = result.ok ? 0 : consecutiveErrors + 1;
      messages.push({ role: "tool", toolCallId: toolCall.id, content: result.message });
      onEvent?.({ kind: "step", step, state });

      if (result.ok && toolCall.name === "finish") {
        notes = String(args.notes ?? "");
        reason = "finished";
      }
    }

    if (reason === "finished") break;
    if (consecutiveErrors >= budget.maxConsecutiveErrors) { reason = "stuck"; break; }
  }

  if (signal?.aborted) reason = "cancelled";
  onEvent?.({ kind: "done", reason });
  return { state, steps, reason, notes };
}

/**
 * The draft for whatever was built.
 *
 * Deliberately works on a partial run too: every step was valid on its own, so
 * nine sections of twelve is a form worth opening, not a failure to discard.
 */
export function draftFromBuild(
  analysis: ExcelWorkbookAnalysis,
  run: BuildRun,
): ExcelImportDraft {
  const warnings: string[] = [];
  if (run.reason !== "finished") {
    warnings.push(
      `INCOMPLETE: the build stopped (${run.reason.replace(/_/g, " ")}) with ${run.state.sections.length} sections. Compare this draft against the workbook before using it.`,
    );
  }
  if (run.notes.trim()) warnings.push(`BUILDER_NOTES: ${run.notes.trim()}`);
  for (const step of run.steps.filter((entry) => !entry.ok).slice(0, 20)) {
    warnings.push(`STEP_REJECTED: ${step.tool}: ${step.text}`);
  }

  return buildExcelDraft(analysis, {
    template: {
      name: run.state.name,
      structure: {
        sections: run.state.sections.map((section, order) => ({ ...section, order })),
        settings: {
          includePassFail: false,
          includeJobInfo: false,
          includePrintHeader: true,
          pageBreakAfterSection: false,
        },
      },
    },
    sources: run.state.sources,
    warnings,
  });
}

// ---------------------------------------------------------------------------
// Rebuilding one section
// ---------------------------------------------------------------------------

const REBUILD_STEPS = 8;

/**
 * Build one section again, in place.
 *
 * A model reading a merged sheet will get a section wrong now and then, and
 * rerunning the whole workbook to fix one table wastes everything else it got
 * right. This replaces a single section: the rest of the form, and the mappings
 * that go with it, are untouched. What was there before is described to the
 * model, along with whatever the person says is wrong with it.
 */
export async function rebuildSection(
  analysis: ExcelWorkbookAnalysis,
  run: BuildRun,
  sectionId: string,
  complaint: string,
  call: ModelCall,
  options: { onEvent?: (event: BuildEvent) => void; signal?: AbortSignal } = {},
): Promise<BuildRun> {
  const index = run.state.sections.findIndex((section) => section.id === sectionId);
  if (index < 0) return run;
  const previous = run.state.sections[index];
  const sheet = analysis.sheets[0]?.name ?? "";

  // A scratch state, so a failed attempt cannot damage the form that exists.
  const scratch: BuildState = {
    name: run.state.name,
    sections: [],
    sources: [],
    finished: false,
    counter: run.state.counter + 1000,
  };

  const describeExisting = previous.columns?.length
    ? `a table of ${previous.columns.length} columns (${previous.columns.map((column) => column.label || "unnamed").join(", ")}) and ${previous.rows ?? 0} rows`
    : `a section of ${previous.fields?.length ?? 0} fields`;

  const messages: ModelMessage[] = [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: `Rebuild this sheet as a form.\n\n${describeWorkbook(analysis)}` },
    {
      role: "user",
      content: `Build ONLY the part of the sheet titled "${previous.title}", and nothing else. The previous attempt made ${describeExisting}, which was wrong.${
        complaint.trim() ? ` The person reviewing it says: ${complaint.trim()}` : ""
      } Look again at where that part of the sheet actually starts and ends, and which cells are merged. Do not call finish.`,
    },
  ];

  const steps: BuildStep[] = [];
  for (let attempt = 0; attempt < REBUILD_STEPS; attempt++) {
    if (options.signal?.aborted) break;
    let turn: ModelTurn;
    try {
      turn = await call(messages, options.signal ?? new AbortController().signal);
    } catch (error) {
      options.onEvent?.({ kind: "retry", text: (error as Error).message });
      break;
    }
    if (!turn.toolCalls.length) break;
    messages.push({ role: "assistant", content: turn.text || "", toolCalls: turn.toolCalls });

    for (const toolCall of turn.toolCalls) {
      if (toolCall.name === "finish") continue;
      let args: Record<string, unknown> = {};
      try {
        args = toolCall.args ? JSON.parse(toolCall.args) : {};
      } catch {
        messages.push({ role: "tool", toolCallId: toolCall.id, content: "The arguments were not valid JSON." });
        continue;
      }
      const result = applyToolCall(scratch, { name: toolCall.name, args } as ToolCall, sheet);
      const step: BuildStep = {
        index: steps.length + 1,
        tool: toolCall.name,
        ok: result.ok,
        text: result.ok ? result.summary : result.message,
      };
      steps.push(step);
      messages.push({ role: "tool", toolCallId: toolCall.id, content: result.message });
      options.onEvent?.({ kind: "step", step, state: scratch });
    }
    // One good section is the whole job here.
    if (scratch.sections.length && steps[steps.length - 1]?.ok) break;
  }

  if (!scratch.sections.length) return run;

  const sections = [...run.state.sections];
  sections.splice(index, 1, ...scratch.sections);
  const sources = [
    ...run.state.sources.filter((source) => source.sectionId !== sectionId),
    ...scratch.sources,
  ];
  const state: BuildState = {
    ...run.state,
    counter: scratch.counter,
    sections: sections.map((section, order) => ({ ...section, order })),
    sources,
  };
  options.onEvent?.({ kind: "done", reason: run.reason });
  return { ...run, state, steps: [...run.steps, ...steps] };
}

// ---------------------------------------------------------------------------
// Rebuilding a section from an instruction, with no file involved
// ---------------------------------------------------------------------------

const EDIT_STEPS = 6;

/** The section as it stands, in the terms the tools use to build one. */
export function describeSection(section: SectionConfig): string {
  const lines = [`Title: ${section.title}`];
  if (section.columns?.length) {
    lines.push(`A table of ${section.rows ?? 0} rows and ${section.columns.length} columns:`);
    section.columns.forEach((column, index) => {
      const choices = column.field.options?.map((option) => option.label).join(" / ");
      lines.push(
        `  ${index + 1}. "${column.label}" (${column.field.type}${choices ? `: ${choices}` : ""})`,
      );
    });
    const header = section.v2?.header ?? [];
    for (const row of header) {
      lines.push(`  Heading row: ${row.cells.map((cell) => `"${cell.label}"${cell.colSpan && cell.colSpan > 1 ? ` over ${cell.colSpan}` : ""}`).join(", ")}`);
    }
  } else {
    const fields = [...(section.fields ?? []), ...(section.aboveTableFields ?? []), ...(section.field ? [section.field] : [])];
    lines.push(`A section of ${fields.length} fields:`);
    for (const field of fields) {
      const choices = field.options?.map((option) => option.label).join(" / ");
      lines.push(`  "${field.label}" (${field.type}${choices ? `: ${choices}` : ""})`);
    }
  }
  return lines.join("\n");
}

const EDIT_PROMPT = `You rebuild one section of a form, using the tools given.

You are not reading a spreadsheet: build what the person asks for, keeping
whatever they did not ask you to change. Reproduce their wording exactly and
invent nothing. Never write a formula or a value.

Cells are not involved here. Where a tool asks for a cell or a range, use the
first data row you are given, or A1 upwards, and nothing will be read from it.

Make one call, then stop. Do not call finish.`;

/**
 * Rebuild a section from a written instruction.
 *
 * The editor has no workbook: a template can come from anywhere, and by the
 * time someone is looking at a section they want changed, the file it may have
 * come from is long gone. So this works from the section itself plus what the
 * person asks for, which is also what makes it useful on templates that were
 * never imported at all.
 *
 * Returns null when nothing usable came back, and the caller keeps what it had.
 */
export async function regenerateSection(
  section: SectionConfig,
  instruction: string,
  call: ModelCall,
  options: { signal?: AbortSignal } = {},
): Promise<SectionConfig[] | null> {
  const scratch = newBuildState("edit");
  const messages: ModelMessage[] = [
    { role: "system", content: EDIT_PROMPT },
    {
      role: "user",
      content: `This is the section as it stands.\n\n${describeSection(section)}\n\nRebuild it so that: ${instruction.trim()}`,
    },
  ];

  for (let attempt = 0; attempt < EDIT_STEPS; attempt++) {
    if (options.signal?.aborted) return null;
    let turn: ModelTurn;
    try {
      turn = await call(messages, options.signal ?? new AbortController().signal);
    } catch {
      return null;
    }
    if (!turn.toolCalls.length) return null;
    messages.push({ role: "assistant", content: turn.text || "", toolCalls: turn.toolCalls });

    for (const toolCall of turn.toolCalls) {
      if (toolCall.name === "finish") continue;
      let args: Record<string, unknown> = {};
      try {
        args = toolCall.args ? JSON.parse(toolCall.args) : {};
      } catch {
        messages.push({ role: "tool", toolCallId: toolCall.id, content: "The arguments were not valid JSON." });
        continue;
      }
      const result = applyToolCall(scratch, { name: toolCall.name, args } as ToolCall, "");
      messages.push({ role: "tool", toolCallId: toolCall.id, content: result.message });
    }
    if (scratch.sections.length) break;
  }

  if (!scratch.sections.length) return null;
  // Keep what the person chose about the section as a whole: where it sits,
  // what it is called if the instruction did not rename it, and its reference
  // code, which formulas elsewhere in the form may already point at.
  return scratch.sections.map((built, index) => ({
    ...built,
    id: index === 0 ? section.id : `${section.id}-${index}`,
    order: section.order,
    showInPrint: section.showInPrint,
    ...(section.referenceCode ? { referenceCode: section.referenceCode } : {}),
  }));
}
