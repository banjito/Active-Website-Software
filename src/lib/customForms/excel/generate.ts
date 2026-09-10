/**
 * The two impure ends of an Excel import: reading the file and asking for a
 * layout. Kept apart from `./import.ts` so the assembly and every check it
 * performs can be tested without a browser, a file or a network call.
 */

import { supabase } from "@/lib/supabase";
import { COMPONENT_LIBRARY } from "@/lib/customForms/componentLibrary";
import { buildExcelDraft } from "@/lib/customForms/excel/import";
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
