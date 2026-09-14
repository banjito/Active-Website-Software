/**
 * The two impure ends of an Excel import: reading the file and asking for a
 * layout. Kept apart from `./import.ts` so the assembly and every check it
 * performs can be tested without a browser, a file or a network call.
 */

import { supabase } from "@/lib/supabase";
import { COMPONENT_LIBRARY } from "@/lib/customForms/componentLibrary";
import type { SectionConfig } from "@/lib/types/customForms";
import { buildExcelDraft } from "@/lib/customForms/excel/import";
import { BUILD_TOOLS } from "@/lib/customForms/excel/tools";
import {
  draftFromBuild,
  rebuildSection,
  regenerateSection,
  runBuild,
  type BuildEvent,
  type BuildRun,
  type ModelCall,
} from "@/lib/customForms/excel/build";
import { readExcelWorkbook } from "@/lib/customForms/excel/workbook";
import type {
  ExcelGenerationResponse,
  ExcelImportDraft,
  ExcelWorkbookAnalysis,
} from "@/lib/customForms/excel/types";

export interface ExcelImportOptions {
  /** Overridden in tests so no network call is made. */
  generate?: (workbook: ExcelWorkbookAnalysis) => Promise<ExcelGenerationResponse>;
}

/**
 * The reason behind a failed function call.
 *
 * supabase-js reports any non-2xx as "Edge Function returned a non-2xx status
 * code" and keeps the response body on the error instead of in the message, so
 * the actual reason (a rejected layout, a provider outage) never reaches the
 * person who has to act on it.
 */
async function functionErrorMessage(error: unknown): Promise<string> {
  const response = (error as { context?: unknown })?.context;
  if (response instanceof Response) {
    try {
      const body = await response.clone().json();
      const detail = typeof body?.detail === "string" ? ` ${body.detail.slice(0, 300)}` : "";
      if (typeof body?.error === "string") return `${body.error}${detail}`;
    } catch {
      try {
        const text = (await response.clone().text()).trim();
        if (text) return text.slice(0, 500);
      } catch {
        // Body already consumed; fall through to the generic message.
      }
    }
  }
  return error instanceof Error ? error.message : String(error);
}

/** Ask the edge function for a layout and cell mappings. It never writes formulas. */
async function requestLayout(workbook: ExcelWorkbookAnalysis): Promise<ExcelGenerationResponse> {
  const { data, error } = await supabase.functions.invoke("generate-form-template", {
    body: {
      sourceType: "excel",
      workbook,
      componentCatalog: COMPONENT_LIBRARY.map((component) => ({ componentType: component.id })),
    },
  });
  if (error) throw new Error(await functionErrorMessage(error));
  if (data?.error) throw new Error(data.error);
  if (!data?.template?.structure || !Array.isArray(data?.sources)) {
    throw new Error("The generator did not return a usable layout for this workbook.");
  }
  return data as ExcelGenerationResponse;
}

/** Read a workbook, ask for a layout, and assemble a reviewable draft. */
export async function importExcelTemplate(
  file: File,
  options: ExcelImportOptions = {},
): Promise<ExcelImportDraft> {
  const workbook = await readExcelWorkbook(file);
  const response = await (options.generate ?? requestLayout)(workbook);
  return buildExcelDraft(workbook, response);
}

/**
 * One step of the tool-driven build.
 *
 * The conversation is held here, in the browser, so each provider call is short
 * and the person can watch and stop the run. The edge function is a bounded
 * pass-through that adds the API key.
 */
const stepCall: ModelCall = async (messages, signal) => {
  const { data, error } = await supabase.functions.invoke("generate-form-template", {
    body: {
      sourceType: "excel-step",
      messages: messages.map((message) => ({
        role: message.role,
        content: message.content,
        ...(message.toolCallId ? { tool_call_id: message.toolCallId } : {}),
        ...(message.toolCalls
          ? {
              tool_calls: message.toolCalls.map((call) => ({
                id: call.id,
                type: "function",
                function: { name: call.name, arguments: call.args },
              })),
            }
          : {}),
      })),
      tools: BUILD_TOOLS.map((tool) => ({ type: "function", function: tool })),
    },
    ...(signal ? { signal } : {}),
  });
  if (error) throw new Error(await functionErrorMessage(error));
  if (data?.error) throw new Error(data.error);
  return { text: String(data?.text ?? ""), toolCalls: Array.isArray(data?.toolCalls) ? data.toolCalls : [] };
};

export interface FileImportOptions {
  onEvent?: (event: BuildEvent) => void;
  signal?: AbortSignal;
  /** Overridden in tests so no network call is made. */
  call?: ModelCall;
}

/**
 * Read a workbook and build a draft from it, one step at a time.
 *
 * Returns whatever was built, complete or not: every step was valid on its own,
 * so a run that stops early still produces a draft worth opening.
 */
export async function buildTemplateFromFile(
  file: File,
  options: FileImportOptions = {},
): Promise<{ analysis: ExcelWorkbookAnalysis; draft: ExcelImportDraft; run: BuildRun }> {
  const analysis = await readExcelWorkbook(file);
  const run = await runBuild({
    analysis,
    call: options.call ?? stepCall,
    onEvent: options.onEvent,
    signal: options.signal,
  });
  return { analysis, draft: draftFromBuild(analysis, run), run };
}

/** Build one section again, leaving the rest of the form as it is. */
export async function rebuildOneSection(
  analysis: ExcelWorkbookAnalysis,
  run: BuildRun,
  sectionId: string,
  complaint: string,
  options: FileImportOptions = {},
): Promise<{ draft: ExcelImportDraft; run: BuildRun }> {
  const next = await rebuildSection(analysis, run, sectionId, complaint, options.call ?? stepCall, {
    onEvent: options.onEvent,
    signal: options.signal,
  });
  return { draft: draftFromBuild(analysis, next), run: next };
}

/**
 * Rebuild one section of any template from a written instruction.
 *
 * Nothing here is specific to an imported form: the builder's sections are the
 * same whatever made them.
 */
export async function regenerateSectionWithPrompt(
  section: SectionConfig,
  instruction: string,
  options: { call?: ModelCall; signal?: AbortSignal } = {},
): Promise<SectionConfig[] | null> {
  return regenerateSection(section, instruction, options.call ?? stepCall, { signal: options.signal });
}
