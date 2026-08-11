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

// DeepSeek (OpenAI-compatible API). Same key/secret as generate-form-template.
// deepseek-chat supports JSON mode, which we rely on here.
const MODEL = "deepseek-chat";
const DEEPSEEK_URL = "https://api.deepseek.com/chat/completions";

// Source PDFs have no text layer, so the input is OCR output: column
// alignment is gone, and digits are frequently misread. The prompt leans on
// the fixed report layout to put values back in the right place.
const INSTRUCTIONS = `You convert OCR text from a transformer oil analysis lab report into JSON.

The reports come from MVA Diagnostics and always follow the same layout:
- A "Nameplate Data" block and an "Equipment Information" block, side by side.
- A results table whose columns are sample dates, NEWEST FIRST (left to right).
- Row groups in this order: sample identification, DGA gases (ppm), DGA
  Condition, DGA Analysis, Operating Procedures, Sampling Interval, then a
  fluid quality block (Moisture, Acid, IFT, Color, Visual, Dielectric,
  Specific Gravity, PF 25C, PCB, Oil Classification), then Oil Quality.
- One PDF may contain SEVERAL units, one after another.
- CONTINUATION PAGES: a unit's rows often overflow onto the next page, which
  REPEATS the same nameplate block and then shows only the leftover rows
  (commonly just "Oil Quality"). If a nameplate block has the same Serial
  Number / Unit ID as the unit you just emitted, it is NOT a new unit — merge
  those rows into that unit, matching values to samples by sample date.
  Emit one report object per PHYSICAL TRANSFORMER, never one per page.

Rules:
- OCR loses column alignment. Use the count of sample-date headers to decide
  how many values each row should have, and assign values left to right.
- If a row has fewer values than there are sample columns, the MISSING ONES ARE
  TRAILING (older samples often lack later-added tests). Leave them out.
- Copy values verbatim, including "Trace", "< 1", "Condition 2", "Status 2".
- Do NOT invent, round, or normalize numbers. Omit any field you cannot read.
- Keep DGA Analysis / Operating Procedures prose intact; join wrapped lines
  with single spaces and separate distinct paragraphs with \\n\\n.
- Common OCR confusions in this layout: 0/O, 1/l/I, 5/S, 8/B. Prefer the digit
  inside numeric columns.
- Output ONLY a JSON object of the form { "reports": [ ... ] }.`;

const SCHEMA = `Each element of "reports" has this TypeScript shape. All fields optional except id, label, nameplate, samples.

interface OilReport {
  id: string;            // kebab-case slug, e.g. "bunge-t5"
  label: string;         // human label for the unit, e.g. "T-5 Bunge" (use Unit ID + site, else serial)
  siteName: string;
  siteAddress: string;
  nameplate: {
    serialNumber: string; unitId: string; equipmentType: string;
    manufacturer: string; yearManufactured: string; primaryKV: string;
    gallons: string; kvaRating: string; phases: string; fluidType: string;
    substationLocation: string; breathingConfiguration: string;
  };
  equipment: {
    topValve: string; bottomValve: string; hoseLength: string;
    paintCondition: string; conservatorTank: string; bushingsEnclosed: string;
    leaks: string; radiators: string; serviceEnergized: string; compartments: string;
  };
  samples: Sample[];     // newest first, same order as the table columns
}

interface Sample {
  sampleDate: string;    // as printed, e.g. "07/06/2026"
  barcodeDGA?: string; barcodeFluid?: string; jobNumber?: string;
  sampleTempC?: string; identification?: string;
  dga: {
    hydrogen?: string; methane?: string; ethane?: string; ethylene?: string;
    acetylene?: string; carbonMonoxide?: string; carbonDioxide?: string;
    oxygen?: string; nitrogen?: string; tdcg?: string;
    tdcgRatePerDay?: string; co2co?: string;
  };
  dgaCondition?: string;      // e.g. "Condition 2" or "Status 2"
  dgaAnalysis?: string;
  operatingProcedures?: string;
  samplingInterval?: string;
  moisture?: string; acid?: string; ift?: string; color?: string;
  visual?: string; dielectric?: string; specificGravity?: string;
  pf25c?: string; pcb?: string; oilClassification?: string; oilQuality?: string;
}

All values are STRINGS. Use "" for a blank nameplate/equipment field; omit optional sample fields entirely.`;

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

    const { ocrText, fileName } = await req.json();
    if (!ocrText || typeof ocrText !== "string") {
      return json({ error: "ocrText (string) is required" }, 400);
    }

    // Guard the context window; the largest sample report is ~20 pages.
    const MAX_CHARS = 120_000;
    const text =
      ocrText.length > MAX_CHARS ? ocrText.slice(0, MAX_CHARS) : ocrText;

    const userText = `Source file: ${fileName || "unknown.pdf"}

OCR TEXT (column alignment is unreliable):
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
    console.error("parse-oil-report failed:", err);
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
