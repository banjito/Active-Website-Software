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

// Input here is a flattened Excel grid, not OCR: every character is exact, and
// each cell arrives addressed as "C7: 12.4". So unlike the oil parser this
// prompt is not fighting misread digits — it is fighting layout. The meaning
// of a value lives in the label to its left or the heading above it, and the
// workbooks are hand-edited, so those anchors move between revisions.
const INSTRUCTIONS = `You convert a technician's Excel test report into JSON.

INPUT FORMAT
Each sheet appears as "### SHEET: <name>", then one line per non-empty row:
  <row number> | A: <cell> | B: <cell> | D: <cell>
Empty cells are omitted, so column letters are the only reliable alignment.

HOW TO READ THE LAYOUT
- A label and its value are usually adjacent on the same row ("A: Serial No." /
  "B: 4471-A"). One row can hold several such pairs side by side.
- A table is a heading row whose cells are column names, followed by rows whose
  cells sit under the SAME column letters. Match by column letter, not by
  position in the line: a blank cell shifts everything otherwise.
- A row whose first cell is a name and whose remaining cells are readings is a
  labelled row — put the name in "label" and the readings in "cells".
- A units row ("kV", "Ω", "µA") directly under the headings is "units", not a
  data row.
- A cell spanning a row on its own, often upper-case, is a SECTION TITLE. Start
  a new section there.
- Sheets named for instructions, a cover page, a dropdown list, or lookup data
  hold no report. Skip them entirely.

RULES
- Copy values VERBATIM, exactly as displayed: keep "N/A", "—", ">2000",
  "0.0", "PASS", trailing units, and the workbook's own date formatting.
- NEVER invent, compute, round, convert, or reformat a value. If a cell is
  blank, emit "".
- Do not drop data you cannot categorize. Anything that does not fit a table or
  a label/value pair goes in that section's "notes" rather than being lost.
- Keep every section the workbook has, in the order the workbook has them.
- Comments, remarks, and recommendations are "notes": join wrapped lines with
  single spaces and separate distinct paragraphs with \\n\\n.
- ONE report object per unit under test. A workbook with one sheet per unit
  yields one report per sheet; a workbook testing one unit across several
  sheets yields ONE report whose sections span those sheets.
- Output ONLY a JSON object of the form { "reports": [ ... ] }.`;

const SCHEMA = `Each element of "reports" has this TypeScript shape. Every value is a STRING; use "" for anything the workbook leaves blank.

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
  sections: Section[];   // in workbook order
  sourceSheet: string;   // sheet this report came from
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
  units?: string[];      // units line under the headings, if the sheet has one
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

    const { workbookText, fileName } = await req.json();
    if (!workbookText || typeof workbookText !== "string") {
      return json({ error: "workbookText (string) is required" }, 400);
    }

    // Guard the context window. The client already truncates, but a caller is
    // not something to take on trust.
    const MAX_CHARS = 120_000;
    const text =
      workbookText.length > MAX_CHARS
        ? workbookText.slice(0, MAX_CHARS)
        : workbookText;

    const userText = `Source file: ${fileName || "unknown.xlsx"}

FLATTENED WORKBOOK (cells are addressed by column letter):
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
