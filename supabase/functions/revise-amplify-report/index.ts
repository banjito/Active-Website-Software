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

// Same DeepSeek key/model as parse-amplify-report.
const MODEL = "deepseek-chat";
const DEEPSEEK_URL = "https://api.deepseek.com/chat/completions";

// The uploaded workbook is not kept after a conversion, so "regenerate" is a
// revision of the stored report rather than a second parse: the model gets the
// saved JSON plus one instruction from the person reading it, and returns the
// whole object back. That means the instruction is the ONLY licence it has to
// change anything — hence the emphasis below on leaving the rest byte-identical.
const INSTRUCTIONS = `You revise an already-structured electrical test report, given as JSON, according to ONE instruction from the engineer reviewing it.

RULES
- Apply ONLY what the instruction asks for. Everything the instruction does not
  mention must come back byte-identical: same sections, same order, same ids,
  same wording, same spacing, same blank strings.
- Do NOT tidy, re-order, re-title, re-slug, round, reformat, or "improve"
  anything on your own initiative.
- Keep the exact same shape (see the schema below). Every value is a string.
  Never emit null, a number, or a boolean.
- Never change an "id" of the report or of a section unless the instruction
  asks you to. Ids are how the report is keyed.
- If the instruction names a label ("Rated Voltage"), find it wherever it lives
  (equipment, a section's fields, a table row label, a table column) and change
  only that entry.
- If the instruction asks to add a section, row, column, or field, add it in the
  position the instruction implies, or at the end of its block otherwise. A new
  table row must have exactly one cell per column.
- If the instruction asks to remove something, remove exactly that.
- If the instruction cannot be carried out (it names something the report does
  not contain, or it is not about this report), return the report COMPLETELY
  UNCHANGED and put a one-sentence explanation in "note".
- Output ONLY a JSON object of the form { "report": { ... }, "note": "" }.`;

const SCHEMA = `The "report" object has this TypeScript shape. Every value is a STRING; use "" for anything blank.

interface AmplifyReport {
  id: string;            // kebab-case slug
  label: string;         // what this report covers, e.g. "Breaker 52-1"
  siteName: string;
  siteAddress: string;
  customer: string;
  jobNumber: string;
  reportDate: string;    // as printed, e.g. "03/14/2026"
  technician: string;
  equipment: Field[];    // nameplate identity: manufacturer, model, serial, ratings…
  status: string;        // overall result as printed, e.g. "PASS"
  sections: Section[];
  sourceSheet: string;
}

interface Field { label: string; value: string; }

interface Section {
  id: string;            // kebab-case slug of the title
  title: string;
  fields: Field[];       // label/value pairs; [] if purely tabular
  table: Table | null;   // tabular results, or null
  notes: string;         // comments/remarks prose, or ""
}

interface Table {
  columns: string[];     // headings, EXCLUDING the stub column that holds row labels
  units?: string[];      // units line under the headings, if there is one
  rows: Row[];
}

interface Row {
  label?: string;        // the stub cell, e.g. "A-B" or "Phase A"
  cells: string[];       // one per entry in columns, in the same order
  result?: string;       // per-row pass/fail, only if the report prints one
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

    const { report, instruction } = await req.json();
    if (!report || typeof report !== "object") {
      return json({ error: "report (object) is required" }, 400);
    }
    if (!instruction || typeof instruction !== "string") {
      return json({ error: "instruction (string) is required" }, 400);
    }

    // A whole report has to survive the round trip, so the instruction is the
    // only part worth capping — it is a sentence, not a document.
    const ask = instruction.slice(0, 2_000);

    const userText = `CURRENT REPORT JSON:
"""
${JSON.stringify(report)}
"""

INSTRUCTION FROM THE ENGINEER:
"""
${ask}
"""

Return the { "report": {...}, "note": "" } JSON now.`;

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

    const parsed = parseRevision(raw);
    if (!parsed) {
      console.error("Could not parse revision JSON. Raw head:", raw.slice(0, 500));
      return json(
        {
          error: "Model did not return valid report JSON",
          raw: raw.slice(0, 2000),
        },
        502,
      );
    }

    return json(parsed);
  } catch (err) {
    console.error("revise-amplify-report failed:", err);
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
 * Pull the revised report out of the model response, tolerating a stray code
 * fence and a response that is the bare report rather than the wrapper.
 */
function parseRevision(
  raw: string,
): { report: Record<string, unknown>; note: string } | null {
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

  if (!parsed || typeof parsed !== "object") return null;
  const wrapper = parsed as { report?: unknown; note?: unknown };
  const report =
    wrapper.report && typeof wrapper.report === "object"
      ? (wrapper.report as Record<string, unknown>)
      : // A response that skipped the wrapper is still usable as long as it
        // looks like a report rather than an error object.
        "sections" in (parsed as Record<string, unknown>)
        ? (parsed as Record<string, unknown>)
        : null;

  if (!report) return null;
  return {
    report,
    note: typeof wrapper.note === "string" ? wrapper.note : "",
  };
}
