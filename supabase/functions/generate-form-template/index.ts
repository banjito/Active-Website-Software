/// <reference lib="dom" />
// @ts-ignore deno: types are resolved at runtime
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
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

enum FieldType { TEXT='text', NUMBER='number', DATE='date', SELECT='select', TEXTAREA='textarea', CHECKBOX='checkbox', CALCULATED='calculated', TEMPERATURE_HUMIDITY='temperature-humidity' }

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

    const { reportName, reportSource, componentCatalog } = await req.json();
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
