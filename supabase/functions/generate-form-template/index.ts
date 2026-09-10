/// <reference lib="dom" />
// @ts-ignore deno: types are resolved at runtime
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import {
  ExcelValidationError,
  buildExcelMessages,
  parseExcelResponse,
  validateExcelRequest,
} from "./excel-prompt.ts";
// Local TS linting shim (for non-Deno editors)
declare const Deno: {
  env: { get: (name: string) => string | undefined };
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// DeepSeek (OpenAI-compatible API). "deepseek-chat" (V3) is fast + supports
// JSON mode; switch to "deepseek-reasoner" (R1) for harder mapping — but note
// the reasoner does NOT support response_format json_object, so drop that below.
const MODEL = "deepseek-chat";
const DEEPSEEK_URL = "https://api.deepseek.com/chat/completions";

// ---------------------------------------------------------------------------
// The template schema the model must emit. Kept in sync with
// src/lib/types/customForms.ts — only the fields the builder actually reads.
// ---------------------------------------------------------------------------
const SCHEMA = `You output a CustomFormTemplate. TypeScript shape of the fields you may use:

interface CustomFormTemplate {
  name: string;               // report title, e.g. "3-Set Low Voltage Cable Test Report (ATS)"
  description?: string;
  netaSection?: string;       // e.g. "7.3.3"
  structure: {
    sections: SectionConfig[];
    settings: { includePassFail: boolean; includeJobInfo: boolean; includePrintHeader: boolean; pageBreakAfterSection?: boolean };
  };
}

interface SectionConfig {
  id: string;                 // unique slug, e.g. "job-info", "electrical-tests"
  componentType: ComponentType;
  title: string;
  order: number;              // 0-based render order
  showInPrint: boolean;       // almost always true
  referenceCode?: string;     // short code used in formulas: JD (Job Details), ETI, VAM, TEU, COM, etc.
  // table components:
  columns?: ColumnConfig[];
  rows?: number;
  allowAddRows?: boolean;
  allowRemoveRows?: boolean;
  // single-field components (comments):
  field?: FieldConfig;
  // grouped-field components (nameplate / custom table label strip / test equipment):
  fields?: FieldConfig[];
  layout?: 'single-column'|'two-column'|'three-column'|'four-column'|'five-column'|'grid';
  // visual & mechanical inspection:
  checklistItems?: { id: string; netaSection?: string; description: string; resultOptions: string[] }[];
  // fields shown above a table, e.g. "Test Voltage:" / "Number of Cable Sets:"
  aboveTableFields?: FieldConfig[];
  // V2 grid: use this whenever the report's table is more than one header row
  // of plain columns. Omit it entirely for simple tables.
  v2?: SectionTableOverlay;
}

interface SectionTableOverlay {
  // Multi-row headers with merged cells. Row 1 is the top row.
  header?: { id: string; cells: HeaderCell[] }[];
  // Replaces the generated body. Use it to mix repeated rows with notes,
  // dividers, labels and totals.
  body?: BodyRow[];
  footer?: { id: string; cells: BodyCell[] }[];
}

// A header cell anchors to a column id and may span right (colSpan) or down
// (rowSpan). Every column must be covered exactly once across the header.
interface HeaderCell { id: string; columnId: string; label: string; colSpan?: number; rowSpan?: number; align?: 'left'|'center'|'right' }

type BodyRow =
  | { id: string; kind: 'records'; policy: RowPolicy }
  | { id: string; kind: 'fixed'; label?: string; cells: BodyCell[] }
  | { id: string; kind: 'divider' }
  | { id: string; kind: 'note'|'criteria'|'label'; text: string; align?: 'left'|'center'|'right' }
  | { id: string; kind: 'subtotal'|'total'; label?: string; cells: BodyCell[] };

interface RowPolicy {
  initial: number; min: number; max: number;
  allowAdd: boolean; allowRemove: boolean; allowReorder: boolean; allowCopy: boolean;
  // Set when ONE record occupies several table rows (e.g. a reading row and a
  // corrected row per circuit).
  rowsPerRecord?: number;
  // Columns drawn once per record, spanning its rows (the identifying columns).
  spanningColumns?: string[];
  // A label per sub-row, e.g. ["RDG", "Corrected"].
  subRowLabels?: string[];
}

interface BodyCell {
  id: string; columnId: string; colSpan?: number; rowSpan?: number;
  kind: 'editable'|'calculated'|'populated'|'display'|'static'|'empty';
  text?: string;      // for 'static'
  formula?: string;   // for 'calculated'
  align?: 'left'|'center'|'right';
  emphasis?: 'none'|'bold'|'muted'|'heading';
}

interface ColumnConfig { id: string; label: string; field: FieldConfig; width?: string }

interface FieldConfig {
  id: string;
  label: string;
  type: FieldType;
  required?: boolean;
  readOnly?: boolean;
  options?: { label: string; value: string }[];      // for SELECT
  unit?: string;
  unitOptions?: string[];
  cellBehavior?: 'user'|'populate'|'calculate';       // table cells
  calculation?: { formula: string; dependsOn: string[] }; // when cellBehavior='calculate'
}

enum FieldType { TEXT='text', NUMBER='number', DATE='date', SELECT='select', RADIO='radio', TEXTAREA='textarea', CHECKBOX='checkbox', CALCULATED='calculated', TEMPERATURE_HUMIDITY='temperature-humidity' }

ComponentType is one of the ids given in the COMPONENT CATALOG below.`;

const INSTRUCTIONS = `You convert a hard-coded electrical test report (a React .tsx file) into a Custom Form Builder template (JSON).

Rules:
1. Read the report source and reproduce its sections IN RENDER ORDER (the order of the <h2> headings / JSX blocks).
2. Start with a Job Information section (componentType "job-info", referenceCode "JD") unless the report clearly has none. Use the catalog default for it.
3. For every other section pick the CLOSEST componentType from the COMPONENT CATALOG. Use a catalog entry's defaultConfig as your starting point, then adapt titles/columns/rows/options to match the report. Only fall back to "custom-table" when nothing else fits (e.g. a label→value strip of nameplate/cable data: N columns, 1 row, allowAddRows/allowRemoveRows false).
4. Reproduce dropdown options exactly from the report's *_OPTIONS arrays. Inspection result options usually are: Satisfactory, Unsatisfactory, Cleaned, See Comments, Not Applicable.
5. Row counts: use the report's number of test sets/rows (Array.from({length:N}) / TOTAL_ROWS). Fixed tables set allowAddRows=false, allowRemoveRows=false.
6. Temperature-corrected columns: set the reading columns first (positional order matters), then each corrected column uses cellBehavior "calculate" with calculation.formula referencing the reading column by position and the TCF, e.g. "{ETI.C5}*{JD.tcf}". {REF.Cn} = column n of the section with referenceCode REF (1-based). Lowercase {JD.tcf}.
7. Always include a Test Equipment Used section (componentType "test-equipment") and a Comments section (componentType "comments") near the end if the report has them.
8. Give every section a stable, unique kebab-case id and a unique referenceCode.
9. HEADERS. Every table column needs a "label" — a table whose columns have no
   labels renders with a blank header strip, which is always wrong. If the
   report's <thead> is a SINGLE row of plain <th>, just set column labels and do
   NOT emit v2. If the <thead> has TWO rows, or any <th> with colSpan/rowSpan,
   reproduce it in v2.header: one entry per <tr>, each cell anchored to the
   column id it starts at, carrying the same colSpan/rowSpan as the source.
   Across the whole header every column must be covered exactly once.
10. PAIRED ROWS. If the report renders TWO <tr> per record (a measured row and a
   corrected row, with the identifying <td>s carrying rowSpan={2}), express that
   as ONE records row with policy.rowsPerRecord = 2 and
   policy.spanningColumns = the ids of the columns that carry the rowSpan. Do
   not emit twice as many columns or twice as many rows.
11. NOTES AND TOTALS. A caption under a table, a criteria note, or a totals row
   is a v2.body entry of kind note/criteria/label/subtotal/total. Put the
   repeated data rows in a 'records' entry in the right position among them.
12. WIDTHS. If the source table has a <colgroup>, copy each column's width onto
   the matching ColumnConfig.width.
13. RADIO BUTTONS. When the report renders <input type="radio"> for an exclusive
   choice (winding connection, material), use FieldType RADIO, not SELECT.
   Reproduce the options exactly.
14. ROW LABELS. When a table's first column is a fixed set of names rather than
   something the technician types (e.g. "Primary to Ground", "Secondary to
   Ground"), emit one 'fixed' body row per name with a 'static' cell carrying
   the text, instead of a records row.
15. Reproduce the report's own section headings verbatim as section titles,
   including any "Electrical Tests - ..." prefix.

Output ONLY the JSON object for the CustomFormTemplate — no prose, no markdown fences, no commentary.`;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    if (req.method !== "POST") {
      return json({ error: "Method not allowed" }, 405);
    }

    const apiKey = Deno.env.get("DEEPSEEK_API_KEY");
    if (!apiKey) throw new Error("DEEPSEEK_API_KEY is not set");

    const payload = await req.json();

    // An uploaded workbook takes a different path: its prompt forbids formulas
    // entirely, and the app translates those itself from the original file.
    if (payload?.sourceType === "excel") {
      return await generateFromExcel(payload, apiKey);
    }

    const { reportName, reportSource, componentCatalog } = payload ?? {};
    if (!reportSource || typeof reportSource !== "string") {
      return json({ error: "reportSource (string) is required" }, 400);
    }
    if (!componentCatalog) {
      return json({ error: "componentCatalog is required" }, 400);
    }

    const catalogText =
      typeof componentCatalog === "string"
        ? componentCatalog
        : JSON.stringify(componentCatalog);

    const userText = `Report file: ${reportName || "unknown.tsx"}

COMPONENT CATALOG (available componentTypes and their default configs):
${catalogText}

REPORT SOURCE:
\`\`\`tsx
${reportSource}
\`\`\`

Generate the CustomFormTemplate JSON now.`;

    const body = {
      model: MODEL,
      max_tokens: 8192, // deepseek-chat output ceiling
      stream: true,
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: `${INSTRUCTIONS}\n\n${SCHEMA}` },
        { role: "user", content: userText },
      ],
    };

    const resp = await fetch(DEEPSEEK_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!resp.ok || !resp.body) {
      const errText = await resp.text();
      console.error("DeepSeek API error:", resp.status, errText);
      return json(
        { error: `DeepSeek API error (${resp.status})`, detail: errText },
        502,
      );
    }

    // Accumulate text_delta events from the SSE stream.
    const rawText = await collectStreamedText(resp.body);
    const template = parseTemplate(rawText);
    if (!template) {
      console.error("Could not parse template JSON. Raw head:", rawText.slice(0, 500));
      return json(
        { error: "Model did not return valid template JSON", raw: rawText.slice(0, 2000) },
        502,
      );
    }

    return json({ template });
  } catch (err) {
    console.error("generate-form-template failed:", err);
    return json({ error: String((err as Error).message || err) }, 500);
  }
});

/**
 * Workbook to layout. The model may propose a layout and cell mappings only.
 *
 * The request is fully validated before the provider is called, and the answer
 * is validated against that same request, so a model cannot invent a sheet,
 * a cell, or a formula.
 */
async function generateFromExcel(payload: unknown, apiKey: string): Promise<Response> {
  let request;
  try {
    request = validateExcelRequest(payload);
  } catch (err) {
    if (err instanceof ExcelValidationError) {
      return json({ error: `Workbook upload rejected: ${err.message}` }, 400);
    }
    throw err;
  }

  const resp = await fetch(DEEPSEEK_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 8192,
      stream: true,
      temperature: 0,
      response_format: { type: "json_object" },
      messages: buildExcelMessages(request),
    }),
  });
  if (!resp.ok || !resp.body) {
    const detail = await resp.text();
    console.error("DeepSeek API error (excel):", resp.status, detail);
    return json({ error: `DeepSeek API error (${resp.status})`, detail }, 502);
  }

  const rawText = await collectStreamedText(resp.body);
  try {
    // Never echo the raw model output: it can contain workbook contents.
    return json(parseExcelResponse(rawText, request));
  } catch (err) {
    if (err instanceof ExcelValidationError) {
      console.error("Excel response rejected:", err.message);
      // Say enough to act on without quoting the answer, which carries
      // workbook contents: length and whether it was cut off mid-object.
      const truncated = rawText.length > 0 && !rawText.trimEnd().endsWith("}");
      const shape = rawText.length === 0
        ? "The model returned nothing."
        : truncated
          ? `The answer was cut off after ${rawText.length} characters, so this workbook is too large to lay out in one pass. Import a smaller sheet, or split the workbook.`
          : `The answer was ${rawText.length} characters.`;
      return json({ error: `The generated layout was rejected: ${err.message}`, detail: shape }, 502);
    }
    throw err;
  }
}

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "content-type": "application/json" },
  });
}

/** Read the DeepSeek (OpenAI-format) SSE stream and concatenate delta content. */
async function collectStreamedText(
  stream: ReadableStream<Uint8Array>,
): Promise<string> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let out = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    // SSE events are separated by a blank line.
    let sep;
    while ((sep = buffer.indexOf("\n\n")) !== -1) {
      const event = buffer.slice(0, sep);
      buffer = buffer.slice(sep + 2);
      for (const line of event.split("\n")) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("data:")) continue;
        const data = trimmed.slice(5).trim();
        if (!data || data === "[DONE]") continue;
        try {
          const parsed = JSON.parse(data);
          // Ignore reasoning_content (deepseek-reasoner) — keep only answer text.
          const delta = parsed.choices?.[0]?.delta?.content;
          if (typeof delta === "string") out += delta;
        } catch {
          // ignore keep-alive / non-JSON lines
        }
      }
    }
  }
  return out;
}

/** Extract and parse the JSON template object from the model's raw output. */
function parseTemplate(raw: string): Record<string, unknown> | null {
  let text = raw.trim();
  // Strip markdown fences if the model added them despite instructions.
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) text = fence[1].trim();
  // Fall back to the first {...} span.
  if (!text.startsWith("{")) {
    const first = text.indexOf("{");
    const last = text.lastIndexOf("}");
    if (first === -1 || last === -1) return null;
    text = text.slice(first, last + 1);
  }
  try {
    const obj = JSON.parse(text);
    if (obj && typeof obj === "object" && obj.structure) return obj;
    return null;
  } catch {
    return null;
  }
}
