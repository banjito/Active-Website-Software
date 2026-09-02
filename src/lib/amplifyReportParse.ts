/**
 * Client side of the AMP-lify ingestion pipeline.
 *
 * The source document is converted to text in the browser: spreadsheets are
 * flattened by amplifyWorkbook.ts, while PDFs use their embedded text or OCR.
 * This module hands that text to the parse-amplify-report edge function, which
 * calls DeepSeek with the server-held API key and coerces the response into an
 * AmplifyReport.
 *
 * The model is prompted for this shape but is not trusted to produce it, so
 * every field is normalized defensively before it reaches the renderer.
 */

import { supabase } from "@/lib/supabase";
import type {
  AmplifyField,
  AmplifyReport,
  AmplifyRow,
  AmplifySection,
  AmplifyTable,
} from "@/lib/amplifyReport";

/** Coerce anything the model emits for a scalar field into a trimmed string. */
function s(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return "";
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function normalizeFields(value: unknown): AmplifyField[] {
  return asArray(value)
    .map((raw) => {
      const f = (raw ?? {}) as Record<string, unknown>;
      return { label: s(f.label), value: s(f.value) };
    })
    // A pair with no label cannot be rendered against anything.
    .filter((f) => f.label !== "");
}

function normalizeRow(raw: unknown, columnCount: number): AmplifyRow {
  const r = (raw ?? {}) as Record<string, unknown>;
  const cells = asArray(r.cells).map(s);
  // Short rows are padded rather than dropped: a technician leaving the last
  // two columns blank is normal, and the row still has to line up.
  while (cells.length < columnCount) cells.push("");

  const label = s(r.label);
  const result = s(r.result);
  return {
    ...(label ? { label } : {}),
    cells: cells.slice(0, columnCount),
    ...(result ? { result } : {}),
  };
}

function normalizeTable(raw: unknown): AmplifyTable | null {
  const t = (raw ?? {}) as Record<string, unknown>;
  const columns = asArray(t.columns).map(s);
  if (columns.length === 0) return null;

  const rows = asArray(t.rows).map((row) => normalizeRow(row, columns.length));
  if (rows.length === 0) return null;

  const units = asArray(t.units).map(s);
  return {
    columns,
    rows,
    ...(units.some(Boolean) ? { units } : {}),
  };
}

function slugify(value: string, fallback: string): string {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || fallback;
}

function normalizeSection(raw: unknown, index: number): AmplifySection {
  const sec = (raw ?? {}) as Record<string, unknown>;
  const title = s(sec.title) || `Section ${index + 1}`;
  return {
    id: slugify(s(sec.id) || title, `section-${index + 1}`),
    title,
    fields: normalizeFields(sec.fields),
    table: normalizeTable(sec.table),
    notes: s(sec.notes),
  };
}

/** Whether a section carries anything worth rendering. */
function hasContent(section: AmplifySection): boolean {
  return (
    section.fields.length > 0 || section.table !== null || section.notes !== ""
  );
}

function normalizeReport(
  raw: Record<string, unknown>,
  index: number,
  sourceFile: string,
): AmplifyReport {
  const equipment = normalizeFields(raw.equipment);
  const label =
    s(raw.label) ||
    equipment.find((f) => /equipment|unit|device|asset/i.test(f.label))?.value ||
    s(raw.sourceSheet) ||
    `Report ${index + 1}`;

  const sections = asArray(raw.sections)
    .map((section, i) => normalizeSection(section, i))
    .filter(hasContent);

  return {
    id: slugify(s(raw.id) || label, `report-${index + 1}`),
    label,
    siteName: s(raw.siteName),
    siteAddress: s(raw.siteAddress),
    customer: s(raw.customer),
    jobNumber: s(raw.jobNumber),
    reportDate: s(raw.reportDate),
    technician: s(raw.technician),
    equipment,
    status: s(raw.status),
    sections,
    sourceFile,
    sourceSheet: s(raw.sourceSheet),
  };
}

/**
 * Send extracted source text for structuring and return renderable reports.
 *
 * Reports with no sections are dropped: they are almost always a cover page or
 * an instructions tab the model tried to be helpful about.
 */
export async function parseAmplifyReport(
  sourceText: string,
  fileName: string,
): Promise<AmplifyReport[]> {
  const { data, error } = await supabase.functions.invoke(
    "parse-amplify-report",
    // Keep the legacy field name for compatibility with already-deployed
    // versions of the edge function; it now carries spreadsheet or PDF text.
    { body: { workbookText: sourceText, fileName } },
  );

  if (error) {
    throw new Error(`Could not reach the parser: ${error.message}`);
  }
  if (data?.error) {
    throw new Error(data.detail ? `${data.error}: ${data.detail}` : data.error);
  }

  const reports = asArray(data?.reports)
    .map((raw, i) =>
      normalizeReport((raw ?? {}) as Record<string, unknown>, i, fileName),
    )
    .filter((report) => report.sections.length > 0);

  if (reports.length === 0) {
    throw new Error(
      "No readable report was found in that file. Check that it contains test data as spreadsheet cells, selectable PDF text, or a clear scan.",
    );
  }

  // Ids feed React keys and the report switcher, so they must be unique even
  // if two source sections share a label.
  const seen = new Set<string>();
  return reports.map((report) => {
    let id = report.id;
    let n = 2;
    while (seen.has(id)) id = `${report.id}-${n++}`;
    seen.add(id);
    return { ...report, id };
  });
}

/**
 * Re-run a saved report through the model with one plain-language instruction
 * ("On Rated Voltage, change the value to 15kV") and return the revision.
 *
 * The uploaded source file is not kept after a conversion, so this revises the
 * stored JSON rather than parsing the source again. The response is normalized
 * through the same path as a fresh parse, since a revision is no more trusted
 * to hold the shape than the original was.
 *
 * `note` is the model's explanation when it declined to change anything; it is
 * "" on a normal revision.
 */
export async function reviseAmplifyReport(
  report: AmplifyReport,
  instruction: string,
): Promise<{ report: AmplifyReport; note: string }> {
  const { data, error } = await supabase.functions.invoke(
    "revise-amplify-report",
    { body: { report, instruction } },
  );

  if (error) {
    throw new Error(`Could not reach the reviser: ${error.message}`);
  }
  if (data?.error) {
    throw new Error(data.detail ? `${data.error}: ${data.detail}` : data.error);
  }

  const raw = (data?.report ?? {}) as Record<string, unknown>;
  const revised = normalizeReport(raw, 0, report.sourceFile);

  if (revised.sections.length === 0) {
    throw new Error(
      "The revision came back empty. The report was left as it was — try a more specific instruction.",
    );
  }

  return {
    // Identity stays with the saved row, not with whatever the model echoed:
    // report.id keys the renderer and the source file never changes here.
    report: { ...revised, id: report.id, sourceFile: report.sourceFile },
    note: typeof data?.note === "string" ? data.note : "",
  };
}
