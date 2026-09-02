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

// DeepSeek (OpenAI-compatible API). Same key/secret as parse-oil-report.
// deepseek-chat supports JSON mode, which we rely on here.
const MODEL = "deepseek-chat";
const DEEPSEEK_URL = "https://api.deepseek.com/chat/completions";

// Input can be an addressed spreadsheet grid, embedded PDF text, or OCR. The
// model must preserve exact values while rebuilding layout that may be encoded
// by column letters, reading order, repeated headings, or page boundaries.
const INSTRUCTIONS = `You convert a technician's electrical test report from a spreadsheet or PDF into JSON.

INPUT FORMATS
The source is one of these formats:
1. SPREADSHEET TEXT. Each sheet starts with "### SHEET: <name>", followed by
   non-empty rows such as:
     <row number> | A: <cell> | B: <cell> | D: <cell>
   Empty cells are omitted, so column letters are the reliable alignment.
2. PDF TEXT. Each page starts with "--- PAGE <number> ---". Text may come from
   an embedded text layer or OCR, so column alignment can be unreliable, lines
   can be split, and OCR may confuse similar characters.

HOW TO READ THE LAYOUT
- In spreadsheet text, match table values to headings by column letter, not by
  position in the line: omitted blank cells otherwise shift values.
- In PDF text, infer tables from headings, units, row labels, repeated blocks,
  and the left-to-right order and count of values. Use page order to join
  sections that continue on a later page.
- A label and its value are usually adjacent. One row or line can hold several
  label/value pairs side by side.
- A row whose first value is a name and whose remaining values are readings is
  a labelled row — put the name in "label" and the readings in "cells".
- A units row ("kV", "Ω", "µA") directly under the headings is "units", not a
  data row.
- Standalone, often upper-case text is usually a SECTION TITLE. Start a new
  section there when the following content belongs to it.
- Instructions, cover pages, dropdown lists, and lookup data hold no report.
  Skip them entirely.

RULES
- Copy source values VERBATIM: keep "N/A", "—", ">2000", "0.0", "PASS",
  trailing units, and the source's own date formatting.
- NEVER invent, compute, round, convert, or reformat a value. For OCR text, only
  resolve an obvious character confusion when the surrounding value clearly
  establishes it; otherwise preserve the extracted text or omit unreadable data.
- Do not drop data you cannot categorize. Anything that does not fit a table or
  a label/value pair goes in that section's "notes" rather than being lost.
- Keep every section in source order.
- Comments, remarks, and recommendations are "notes": join wrapped lines with
  single spaces and separate distinct paragraphs with \\n\\n.
- Emit ONE report object per physical unit under test. Separate spreadsheet
  sheets or PDF pages that continue the same identified unit belong to ONE
  report; distinct units require distinct report objects.
- Set "sourceSheet" to the sheet name for spreadsheets. For PDFs, use the page
  number/range when useful, otherwise use "".
- Output ONLY a JSON object of the form { "reports": [ ... ] }.`;

const SCHEMA = `Each element of "reports" has this TypeScript shape. Every value is a STRING; use "" for anything the source leaves blank.

interface AmplifyReport {
  id: string;            // kebab-case slug, e.g. "breaker-52-1"
  label: string;         // what this report covers, e.g. "Breaker 52-1"
  siteName: string;
  siteAddress: string;
  customer: string;
  jobNumber: string;
  reportDate: string;    // as printed, e.g. "03/14/2026"
  technician: string;
  equipment: Field[];    // nameplate identity: manufacturer, model, serial, ratings…
  status: string;        // overall result as printed, e.g. "PASS"
  sections: Section[];   // in source order
  sourceSheet: string;   // spreadsheet sheet or PDF page/range, when useful
}

interface Field { label: string; value: string; }

interface Section {
  id: string;            // kebab-case slug of the title
  title: string;         // as printed, e.g. "Insulation Resistance"
  fields: Field[];       // label/value pairs in this block; [] if purely tabular
  table: Table | null;   // tabular results, or null
  notes: string;         // comments/remarks prose, or ""
}

interface Table {
  columns: string[];     // headings, EXCLUDING the stub column that holds row labels
  units?: string[];      // units line under the headings, if the source has one
  rows: Row[];
}

interface Row {
  label?: string;        // the stub cell, e.g. "A-B" or "Phase A"
  cells: string[];       // one per entry in columns, in the same order
  result?: string;       // per-row pass/fail, only if the sheet prints one
}`;

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    if (req.method !== "POST") {
      return json({ error: "Method not allowed" }, 405);
    }

    const apiKey = Deno.env.get("DEEPSEEK_API_KEY");
    if (!apiKey) throw new Error("DEEPSEEK_API_KEY is not set");

    const { sourceText: requestedSourceText, workbookText, fileName } =
      await req.json();
    // `workbookText` is retained for clients deployed before PDF support.
    const sourceText = requestedSourceText ?? workbookText;
    if (!sourceText || typeof sourceText !== "string") {
      return json(
        { error: "sourceText or workbookText (string) is required" },
        400,
      );
    }

    // Guard the context window. Spreadsheet extraction also truncates on the
    // client, but PDF callers and direct API callers are not taken on trust.
    const MAX_CHARS = 120_000;
    const text =
      sourceText.length > MAX_CHARS
        ? sourceText.slice(0, MAX_CHARS)
        : sourceText;
    const sourceFile =
      typeof fileName === "string" && fileName ? fileName : "unknown";
    const sourceDescription = /\.pdf$/i.test(sourceFile)
      ? "PDF TEXT (page order is preserved; alignment may be unreliable)"
      : "FLATTENED SPREADSHEET (cells are addressed by column letter)";

    const userText = `Source file: ${sourceFile}

${sourceDescription}:
"""
${text}
"""

Return the { "reports": [...] } JSON now.`;

    const resp = await fetch(DEEPSEEK_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 8192,
        temperature: 0,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: `${INSTRUCTIONS}\n\n${SCHEMA}` },
          { role: "user", content: userText },
        ],
      }),
    });

    if (!resp.ok) {
      const errText = await resp.text();
      console.error("DeepSeek API error:", resp.status, errText);
      return json(
        { error: `DeepSeek API error (${resp.status})`, detail: errText },
        502,
      );
    }

    const payload = await resp.json();
    const raw: string = payload?.choices?.[0]?.message?.content ?? "";

    const reports = parseReports(raw);
    if (!reports) {
      console.error("Could not parse report JSON. Raw head:", raw.slice(0, 500));
      return json(
        {
          error: "Model did not return valid report JSON",
          raw: raw.slice(0, 2000),
        },
        502,
      );
    }

    return json({ reports });
  } catch (err) {
    console.error("parse-amplify-report failed:", err);
    return json({ error: String((err as Error).message || err) }, 500);
  }
});

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "content-type": "application/json" },
  });
}

/**
 * Pull the reports array out of the model response, tolerating a stray code
 * fence even though JSON mode normally prevents one.
 */
function parseReports(raw: string): unknown[] | null {
  const cleaned = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/```$/, "");
  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start === -1 || end <= start) return null;
    try {
      parsed = JSON.parse(cleaned.slice(start, end + 1));
    } catch {
      return null;
    }
  }

  if (Array.isArray(parsed)) return parsed;
  const reports = (parsed as { reports?: unknown })?.reports;
  return Array.isArray(reports) ? reports : null;
}
